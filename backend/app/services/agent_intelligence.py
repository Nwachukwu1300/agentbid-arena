import asyncio
import json
import logging
from uuid import UUID
from datetime import datetime, timezone
from openai import AsyncOpenAI

from app.models.agent import Agent, MAX_JOBS
from app.models.agent_decision import (
    AgentDecision,
    BidDecision,
    PassDecision,
    DecisionType,
    AgentDecisionResponse,
    AuctionContext,
    AgentState,
)
from app.models.auction import AuctionWithJob
from app.services.database import DatabaseService
from app.services.agent_service import AgentService
from app.services.auction_service import AuctionService
from app.config import get_settings
from app.services import ai_budget

logger = logging.getLogger(__name__)


# One OpenAI client per event loop, reused across rounds (a new client each round leaks connections)
_openai_clients: dict[asyncio.AbstractEventLoop, AsyncOpenAI] = {}


def _openai_client() -> AsyncOpenAI:
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:  # constructed outside a loop (e.g. tests): a private client
        return AsyncOpenAI(api_key=get_settings().openai_api_key, timeout=30, max_retries=1)
    if loop not in _openai_clients:
        _openai_clients[loop] = AsyncOpenAI(api_key=get_settings().openai_api_key, timeout=30, max_retries=1)
    return _openai_clients[loop]


NEGOTIATION_PROMPT_TEMPLATE = """You are {agent_name}, a {specialty} agent. You won the auction for this job at an auction price of {opening_price} (what the auction pays you), and the client wants to negotiate the price before work starts.
{final_banner}
Your negotiation style:
{style}

Job: {job_title}
{job_description}
Client's posted budget: {budget}
Auction price (your opening price): {opening_price}
Your work cost: {work_cost} credits. Profit = agreed price - {work_cost}.
Your credits: {credits}
Messages left after this one: {turns_left}

{offer_math}

Conversation so far (the client speaks first):
{history}

IMPORTANT RULES:
1. Your negotiation style above is the MOST IMPORTANT factor in your decision
2. Actions: "counter" proposes a price in "offer"; "accept" agrees to the client's latest offer; "walk_away" ENDS the talks for good with no deal. To answer a question or hold your position, "counter" with your current price
3. No deal earns you 0 credits. Accepting a price below your work cost of {work_cost} LOSES you credits
4. You want the price HIGH. You may ask for more than the auction price if you think the client has room, up to {max_offer}. If the client offers as much as you are asking, accept it rather than asking for less
5. If the last message passes without an accept, there is no deal
6. The client may bluff about its budget

Respond with ONLY a valid JSON object:
{{"message": "<what you say to the client, under {max_chars} characters>", "offer": <price, or null>, "action": "counter" | "accept" | "walk_away"}}"""


def build_negotiation_prompt(
    *, agent_name: str, specialty: str, style: str, job_title: str, job_description: str, budget: int,
    opening_price: int, work_cost: int, credits: int, turns_left: int, client_offer: int | None,
    max_offer: int, history: list[dict], max_chars: int,
) -> str:
    """The agent's side of a negotiation. Never includes the client's secret max or personality."""
    if client_offer is None:
        offer_math = "The client has not made an offer yet."
    else:
        profit = client_offer - work_cost
        offer_math = (
            f"The client's current offer is {client_offer}. If you accept {client_offer}, you earn "
            f"{client_offer} minus your cost of {work_cost}, which is {profit} credits. Walking away earns 0."
        )
        if profit < 0:
            offer_math += f" WARNING: accepting {client_offer} is BELOW your work cost and LOSES you {-profit} credits."
        elif profit > 0:
            offer_math += f" {client_offer} is ABOVE your cost: accepting is a profit, not a loss."
    if turns_left == 0:
        offer_math += (" This is the LAST message. Only \"accept\" can make a deal now: a counter or walk_away "
                       "ends with no deal and 0 credits.")
    lines = [f"You opened at {opening_price}."]
    for m in history:
        who = "Client" if m["speaker"] == "client" else "You"
        price = f" ({m['action']}, price {m['offer']})" if m["offer"] else f" ({m['action']})"
        lines.append(f"{who}: {m['message']}{price}")
    return NEGOTIATION_PROMPT_TEMPLATE.format(
        agent_name=agent_name, specialty=specialty, style=style, job_title=job_title,
        job_description=job_description, budget=budget, opening_price=opening_price, work_cost=work_cost,
        credits=credits, turns_left=turns_left, offer_math=offer_math, history="\n".join(lines),
        final_banner=(
            f"\nFINAL MESSAGE: your only choices are to ACCEPT the client's offer of {client_offer} "
            f"(you earn {client_offer - work_cost} credits) or to end with NO DEAL (you earn 0). "
            "A counter now also ends with no deal.\n"
            if turns_left == 0 and client_offer is not None else ""
        ),
        max_offer=max_offer, max_chars=max_chars,
    )


class AgentIntelligenceService:
    """Service for AI-powered agent decision-making in auctions."""

    SYSTEM_PROMPT_TEMPLATE = """You are {agent_name}, a {specialty} agent in a competitive auction marketplace.

Your personality and bidding strategy:
{auction_instructions}

Current state:
- Workload: {workload} jobs
- Credits: {credits}

Job available:
{job_description}
Type: {job_specialty}
Budget (maximum bid): {market_average}
Your work cost: {work_cost} credits (base {base_cost}, +10% for each job you are already running, adjusted by your own private efficiency on this job)
{min_bid_line}Rivals: {rival_count} other {job_specialty} agent(s) may bid. Each has its own private cost for this job, somewhere between {min_rival_cost} (idle, most efficient) and {max_rival_cost} (4 jobs running, least efficient); you don't know theirs or how busy they are.
Time remaining: {time_remaining}s

IMPORTANT RULES:
1. Your personality and strategy instructions above are the MOST IMPORTANT factor in your decision
2. SEALED AUCTION: you get exactly ONE bid (or pass) on this job and you cannot see anyone else's bids. All bids are revealed when the auction closes
3. The lowest bid wins (ties go to the earlier bid). You can bid any positive amount up to the budget
4. {payment_rule_text}
5. Agents at 0 credits are bankrupt and out until the next season. The agent with the most credits when the season ends wins
6. Consider your workload, credits, and how cheap your rivals could be
7. About {negotiation_pct}% of winning bids go to a negotiation with the client, where the final price can end up higher or lower than your bid, or the job can fall through. You won't know which ones in advance

Respond with ONLY a valid JSON object in one of these formats:

To place a bid:
{{"bid": <amount>, "reasoning": "<your reasoning>"}}

To pass on this auction:
{{"action": "PASS", "reasoning": "<your reasoning>"}}

Do not include any other text, markdown formatting, or explanation outside the JSON object."""

    def __init__(self, db: DatabaseService):
        self.db = db
        self.settings = get_settings()
        self.client = _openai_client()
        self.agent_service = AgentService(db)
        self.auction_service = AuctionService(db)
        self.decisions_table = db.table("agent_decisions")

    def _build_system_prompt(
        self,
        agent_state: AgentState,
        auction_context: AuctionContext,
        agent_id=None,
        auction_id=None,
    ) -> str:
        """Build the system prompt with agent and auction context."""
        budget = auction_context.market_average_price
        # The same private cost place_bid records for this agent and auction
        work_cost = self.settings.work_cost(budget, agent_state.current_jobs, agent_id, auction_id)
        base_cost = self.settings.work_cost(budget)
        spread = self.settings.private_cost_spread

        return self.SYSTEM_PROMPT_TEMPLATE.format(
            agent_name=agent_state.agent_name,
            specialty=agent_state.specialty,
            auction_instructions=agent_state.auction_instructions,
            workload=agent_state.workload_display,
            credits=agent_state.credits,
            job_description=f"{auction_context.job_title}\n{auction_context.job_description}",
            job_specialty=auction_context.job_specialty,
            market_average=auction_context.market_average_price,
            work_cost=work_cost,
            base_cost=base_cost,
            min_rival_cost=round(base_cost * (1 - spread)),
            max_rival_cost=round(self.settings.work_cost(budget, agent_state.max_capacity - 1) * (1 + spread)),
            **self._payment_rule_text(work_cost),
            rival_count=auction_context.rival_count,
            time_remaining=int(auction_context.time_remaining_seconds),
            negotiation_pct=round(self.settings.negotiation_share * 100),
        )

    def _payment_rule_text(self, work_cost: int) -> dict:
        """Prompt lines for the payment rule in force (settings.payment_rule)."""
        if self.settings.payment_rule == "first_price":
            return {
                "min_bid_line": "",
                "payment_rule_text": (
                    "If you win, you are paid your own bid. Profit = your bid - your work cost, so a bid below your "
                    "work cost LOSES you credits. Bidding higher earns more per job but risks losing to a cheaper rival"
                ),
            }
        return {
            "min_bid_line": f"Minimum profitable bid: {work_cost + 1} (any lower bid loses you credits if you win)\n",
            "payment_rule_text": (
                "SECOND PRICE: if you win, you are paid the next-lowest bid (the runner-up's), or your own bid if "
                "nobody else bids. Profit = price paid - your work cost. Your bid decides WHETHER you win, not how "
                f"much you are paid, so bidding higher only makes you more likely to lose. Never bid below {work_cost + 1}: "
                "as the only bidder you are paid your own bid, and below that you LOSE credits"
            ),
        }

    def _parse_decision(self, response_text: str) -> AgentDecision:
        """Parse the LLM response into an AgentDecision."""
        # Clean up response - remove markdown code blocks if present
        cleaned = response_text.strip()
        if cleaned.startswith("```"):
            # Remove markdown code block
            lines = cleaned.split("\n")
            # Remove first line (```json or ```)
            lines = lines[1:]
            # Remove last line if it's ``
            if lines and lines[-1].strip() == "```":
                lines = lines[:-1]
            cleaned = "\n".join(lines).strip()

        try:
            data = json.loads(cleaned)
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse agent response as JSON: {response_text}")
            raise ValueError(f"Invalid JSON response from agent: {e}")

        # Check if it's a PASS decision
        if data.get("action") == "PASS":
            reasoning = data.get("reasoning", "No reasoning provided")
            return PassDecision(reasoning=reasoning)

        # Check if it's a BID decision
        if "bid" in data:
            bid_amount = data["bid"]
            if not isinstance(bid_amount, (int, float)) or bid_amount <= 0:
                raise ValueError(f"Invalid bid amount: {bid_amount}")
            reasoning = data.get("reasoning", "No reasoning provided")
            return BidDecision(bid_amount=int(bid_amount), reasoning=reasoning)

        raise ValueError(f"Response must contain 'bid' or 'action': {data}")

    async def get_agent_decision(
        self,
        agent_id: UUID,
        auction_id: UUID,
    ) -> AgentDecisionResponse:
        """Get an AI-powered decision from an agent for a specific auction."""
        # Fetch agent
        agent = await self.agent_service.get_by_id(agent_id)
        if not agent:
            raise ValueError("Agent not found")
        if not agent.is_active:
            raise ValueError("Agent is not active")

        # Fetch auction with job details
        auction = await self.auction_service.get_auction_with_job(auction_id)
        if not auction:
            raise ValueError("Auction not found")
        if not auction.is_active:
            raise ValueError("Auction is not active")

        # Check capacity - automatic PASS if at capacity
        if agent.is_at_capacity:
            logger.info(f"Agent {agent.name} at capacity, auto-passing auction {auction_id}")
            return AgentDecisionResponse(
                agent_id=agent_id,
                agent_name=agent.name,
                auction_id=auction_id,
                decision_type=DecisionType.PASS,
                bid_amount=None,
                reasoning=f"At capacity ({agent.current_jobs}/{MAX_JOBS} jobs). Cannot take on more work.",
                raw_response=None,
                created_at=datetime.now(timezone.utc),
            )

        # Automatic PASS without asking the model: bankrupt, or already made its one sealed decision
        auto_pass = None
        if agent.is_bankrupt:
            auto_pass = "Bankrupt. Out until the next season."
        elif (await self.decisions_table.select("id").eq("agent_id", str(agent_id)).eq(
            "auction_id", str(auction_id)
        ).execute()).data:
            auto_pass = "Already made its one sealed decision on this auction."
        if auto_pass:
            return AgentDecisionResponse(
                agent_id=agent_id,
                agent_name=agent.name,
                auction_id=auction_id,
                decision_type=DecisionType.PASS,
                bid_amount=None,
                reasoning=auto_pass,
                raw_response=None,
                created_at=datetime.now(timezone.utc),
            )

        # Build context for the agent
        agent_state = AgentState(
            agent_name=agent.name,
            specialty=agent.specialty.value,
            auction_instructions=agent.auction_instructions,
            current_jobs=agent.current_jobs,
            credits=agent.credits,
        )

        auction_context = AuctionContext(
            job_title=auction.job_title,
            job_description=auction.job_description,
            job_specialty=auction.job_specialty.value,
            market_average_price=auction.job_base_price,
            rival_count=len(await self.agent_service.get_all(specialty=auction.job_specialty, is_active=True)) - 1,
            time_remaining_seconds=auction.time_remaining_seconds,
            total_bids=auction.bid_count,
        )

        # Build the prompt
        system_prompt = self._build_system_prompt(agent_state, auction_context, agent_id, auction_id)

        if not await ai_budget.try_agent_call(self.db):
            logger.warning("Daily agent AI budget reached; agents pass until tomorrow")
            return AgentDecisionResponse(
                agent_id=agent_id,
                agent_name=agent.name,
                auction_id=auction_id,
                decision_type=DecisionType.PASS,
                bid_amount=None,
                reasoning="Daily AI budget reached. Sitting out until tomorrow.",
                raw_response=None,
                created_at=datetime.now(timezone.utc),
            )

        # Call OpenAI
        decision, raw_response = None, None
        try:
            response = await self.client.chat.completions.create(
                model=self.settings.openai_model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": "Make your decision now."},
                ],
                max_tokens=self.settings.openai_max_tokens,
                temperature=self.settings.openai_temperature,
            )
            raw_response = response.choices[0].message.content
            logger.debug(f"Agent {agent.name} raw response: {raw_response}")
            decision = self._parse_decision(raw_response)
        except Exception as e:
            # The call is already paid for: fall through to a stored pass so the agent isn't asked again every round
            logger.error(f"No usable AI decision for agent {agent.name}: {e}")

        return AgentDecisionResponse(
            agent_id=agent_id,
            agent_name=agent.name,
            auction_id=auction_id,
            decision_type=decision.decision_type if decision else DecisionType.PASS,
            bid_amount=decision.bid_amount if isinstance(decision, BidDecision) else None,
            reasoning=decision.reasoning if decision else "No usable answer from the AI model. Passed on this auction.",
            raw_response=raw_response if self.settings.debug else None,
            created_at=datetime.now(timezone.utc),
            from_model=True,
        )

    async def _store_decision(self, decision: AgentDecisionResponse) -> None:
        """Store the agent decision in the database for analytics."""
        try:
            data = {
                "agent_id": str(decision.agent_id),
                "auction_id": str(decision.auction_id),
                "decision_type": decision.decision_type.value,
                "bid_amount": decision.bid_amount,
                "reasoning": decision.reasoning,
                "created_at": decision.created_at.isoformat(),
            }
            await self.decisions_table.insert(data).execute()
        except Exception as e:
            # Don't fail the decision if storage fails
            logger.error(f"Failed to store agent decision: {e}")

    async def execute_decision(
        self,
        agent_id: UUID,
        auction_id: UUID,
    ) -> AgentDecisionResponse:
        """Get agent's decision and execute it (place bid if decided to bid)."""
        decision = await self.get_agent_decision(agent_id, auction_id)

        if decision.decision_type == DecisionType.BID and decision.bid_amount:
            # Place the bid
            from app.models.auction import BidCreate
            bid_data = BidCreate(
                auction_id=auction_id,
                agent_id=agent_id,
                amount=decision.bid_amount,
            )
            try:
                await self.auction_service.place_bid(bid_data)
                logger.info(
                    f"Agent {decision.agent_name} placed bid of {decision.bid_amount} "
                    f"on auction {auction_id}"
                )
            except ValueError as e:
                logger.error(f"Failed to place bid for agent {decision.agent_name}: {e}")
                # Update decision to reflect failed bid
                decision.reasoning = f"{decision.reasoning} [Bid failed: {e}]"

        # Store after the bid attempt so failed bids are recorded as failed.
        # Automatic passes (full, bankrupt, already decided) are not stored: they repeat every round.
        if decision.from_model:
            await self._store_decision(decision)
        return decision

    async def trigger_all_agents_for_auction(
        self,
        auction_id: UUID,
        specialty_match_only: bool = True,
    ) -> list[AgentDecisionResponse]:
        """Trigger all eligible agents to make decisions for an auction."""
        # Get auction details
        auction = await self.auction_service.get_auction_with_job(auction_id)
        if not auction or not auction.is_active:
            raise ValueError("Auction not found or not active")

        # Get all active agents
        agents = await self.agent_service.get_all(is_active=True)

        # Filter by specialty if requested
        if specialty_match_only:
            agents = [a for a in agents if a.specialty == auction.job_specialty]

        decisions = []
        for agent in agents:
            try:
                decision = await self.execute_decision(agent.id, auction_id)
                decisions.append(decision)
            except Exception as e:
                logger.error(f"Error getting decision from agent {agent.name}: {e}")
                # Create error response
                decisions.append(
                    AgentDecisionResponse(
                        agent_id=agent.id,
                        agent_name=agent.name,
                        auction_id=auction_id,
                        decision_type=DecisionType.PASS,
                        bid_amount=None,
                        reasoning=f"Error: {e}",
                        raw_response=None,
                        created_at=datetime.now(timezone.utc),
                    )
                )

        return decisions
