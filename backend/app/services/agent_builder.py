"""
LLM-Assisted Agent Builder Service

This service powers the "wow" feature - users describe their desired agent
in natural language, and the LLM generates comprehensive, strategic
auction instructions.
"""

import json
import logging
from typing import Literal, Optional
from openai import AsyncOpenAI
from pydantic import BaseModel, Field

from app.config import get_settings
from app.models.agent import AgentSpecialty
from app.services.negotiation_service import DEFAULT_NEGOTIATION_STYLE

logger = logging.getLogger(__name__)


class GeneratedInstructions(BaseModel):
    """The output of the LLM instruction generation."""
    auction_instructions: str
    suggested_name: str
    personality_summary: str
    negotiation_style: str = ""  # how the agent haggles with clients after winning


class ConversationMessage(BaseModel):
    """A message in the agent creation conversation."""
    role: Literal["user", "assistant"]  # never "system": clients can't override the builder's instructions
    content: str = Field(..., max_length=4000)


class AgentBuilderService:
    """
    Service for LLM-assisted agent creation.

    Users chat with the LLM to describe their desired agent strategy,
    and the LLM generates rich, detailed personality instructions.
    """

    SYSTEM_PROMPT = """You are an AI assistant helping users create autonomous agents for a competitive marketplace.

The marketplace works like this:
- Agents compete in sealed auctions for service jobs in their own specialty (Designer, Coder, Writer, Data Analyst, or Tester)
- Each agent places ONE secret bid per job (or passes); the LOWEST bid wins, ties go to the earlier bid
- The winner is paid the SECOND-lowest bid (the runner-up's), or its own bid if nobody else bid. So a bid decides whether an agent wins, not how much it is paid
- Doing a job costs the agent half the budget, plus 10% more for each job it is already running, and each agent's cost on each job varies by up to {cost_spread_pct}% either way. That private cost is only known to the agent itself. Profit = price paid - work cost, so bidding below cost loses credits
- About {negotiation_pct}% of winning bids go to a negotiation with the client before work starts: the final price can end up higher or lower than the bid, or the job can fall through. Agents don't know which ones in advance
- Agents start with 1000 credits and can hold max 5 concurrent jobs. At 0 credits an agent is bankrupt until the season ends
- Seasons last two hours: the agent with the most credits wins, then everyone resets to 1000

Every agent has two parts: a BIDDING STRATEGY for the auctions and a NEGOTIATION STYLE for haggling with clients.

Your job is to:
1. Have a friendly, engaging conversation to understand what kind of agent the user wants
2. Ask clarifying questions to understand their strategy preferences
3. When you have enough information, generate comprehensive personality instructions

IMPORTANT STRATEGY DIMENSIONS TO EXPLORE:
- Risk tolerance: Conservative (safe bids) vs Aggressive (undercut heavily)
- Job selection: Which jobs within their specialty to chase or pass on
- Pricing strategy: Premium (higher bids, fewer jobs) vs Volume (low bids, many jobs)
- Workload management: Stay lean (1-2 jobs) vs maximize capacity (4-5 jobs)
- Credit strategy: Preserve credits vs reinvest aggressively
- Competition response: React to competitors or stick to own strategy
- Service preferences: What types of work within their specialty they prefer
- Negotiation: Hold firm vs settle quickly, how far to concede, when to walk away, how to handle a client who claims a tight budget

Keep the conversation natural and conversational. Don't ask all questions at once.
Ask 2-3 questions per response, building on previous answers.

When you feel you have enough information (usually after 2-4 exchanges),
indicate you're ready to generate instructions by saying something like
"I think I understand what you're looking for! Let me create your agent..."

Be enthusiastic and make the user feel their agent will be unique and strategic."""

    GENERATION_PROMPT = """Based on our conversation, generate comprehensive personality instructions for this agent.

The user wants a {specialty} agent with these characteristics:
{conversation_summary}

Generate AUCTION INSTRUCTIONS - how the agent should behave in competitive auctions:
   - Be specific about bidding strategy, risk tolerance, pricing approach
   - Include personality traits that will influence decisions
   - Reference specific scenarios (when to bid aggressively, when to pass)
   - Make it feel like a real personality, not generic rules

Generate a NEGOTIATION STYLE - how the agent haggles with the client after winning (60-150 words):
   - How firmly it holds its price and how far it will concede
   - When it asks for more than its bid, and when it walks away (never below its work cost unless the user wants that)
   - How it reads a client who claims a tight budget or questions quality
   - Same personality as the auction instructions

CRITICAL: Make the auction instructions RICH and DETAILED (150-300 words).
They should capture a distinct personality that will lead to unique behavior.
Avoid generic advice - be specific and strategic.

Also suggest:
- A creative, memorable name that fits the personality
- A one-sentence personality summary

Respond with ONLY a valid JSON object in this exact format:
{{
  "auction_instructions": "...",
  "negotiation_style": "...",
  "suggested_name": "...",
  "personality_summary": "..."
}}"""

    REFINEMENT_PROMPT = """The user has provided feedback on the generated instructions.

Current instructions:
AUCTION: {current_auction}
NEGOTIATION: {current_negotiation}

User feedback: {feedback}

Please regenerate the instructions incorporating this feedback while maintaining
the rich, detailed personality approach. Keep the overall strategy but adjust
based on the user's input.

Respond with ONLY a valid JSON object:
{{
  "auction_instructions": "...",
  "negotiation_style": "...",
  "suggested_name": "...",
  "personality_summary": "..."
}}"""

    def __init__(self):
        self.settings = get_settings()
        self.client = AsyncOpenAI(api_key=self.settings.openai_api_key, timeout=60, max_retries=1)
        self.system_prompt = self.SYSTEM_PROMPT.replace(
            "{negotiation_pct}", str(round(self.settings.negotiation_share * 100))
        ).replace("{cost_spread_pct}", str(round(self.settings.private_cost_spread * 100)))

    async def chat(
        self,
        messages: list[ConversationMessage],
        specialty: Optional[AgentSpecialty] = None,
    ) -> str:
        """
        Continue the agent creation conversation.

        Args:
            messages: The conversation history
            specialty: The agent's specialty (if already selected)

        Returns:
            The assistant's response
        """
        # Build messages for the API
        api_messages = [{"role": "system", "content": self.system_prompt}]

        # Add specialty context if provided
        if specialty:
            api_messages.append({
                "role": "system",
                "content": f"The user has selected the {specialty.value} specialty. "
                           f"Tailor your questions and suggestions to this specialty."
            })

        # Add conversation history
        for msg in messages:
            api_messages.append({
                "role": msg.role,
                "content": msg.content,
            })

        try:
            response = await self.client.chat.completions.create(
                model="gpt-4o",  # Use GPT-4 for better conversation quality
                messages=api_messages,
                max_tokens=500,
                temperature=0.8,  # More creative conversation
            )
            return response.choices[0].message.content
        except Exception as e:
            logger.error(f"OpenAI chat error: {e}")
            raise ValueError(f"Failed to get response: {e}")

    async def generate_instructions(
        self,
        conversation: list[ConversationMessage],
        specialty: AgentSpecialty,
    ) -> GeneratedInstructions:
        """
        Generate comprehensive agent instructions based on the conversation.

        Args:
            conversation: The full conversation history
            specialty: The agent's specialty

        Returns:
            Generated auction instructions with suggested name
        """
        # Build conversation summary for context
        conversation_text = "\n".join([
            f"{msg.role.upper()}: {msg.content}"
            for msg in conversation
        ])

        prompt = self.GENERATION_PROMPT.format(
            specialty=specialty.value,
            conversation_summary=conversation_text,
        )

        try:
            response = await self.client.chat.completions.create(
                model="gpt-4o",
                messages=[
                    {"role": "system", "content": self.system_prompt},
                    {"role": "user", "content": prompt},
                ],
                max_tokens=1500,
                temperature=0.7,
            )

            raw_response = response.choices[0].message.content
            return self._parse_instructions(raw_response)

        except Exception as e:
            logger.error(f"OpenAI generation error: {e}")
            raise ValueError(f"Failed to generate instructions: {e}")

    async def refine_instructions(
        self,
        current: GeneratedInstructions,
        feedback: str,
        specialty: AgentSpecialty,
    ) -> GeneratedInstructions:
        """
        Refine generated instructions based on user feedback.

        Args:
            current: The current generated instructions
            feedback: User's feedback for refinement
            specialty: The agent's specialty

        Returns:
            Refined instructions
        """
        prompt = self.REFINEMENT_PROMPT.format(
            current_auction=current.auction_instructions,
            current_negotiation=current.negotiation_style or "(none yet)",
            feedback=feedback,
        )

        try:
            response = await self.client.chat.completions.create(
                model="gpt-4o",
                messages=[
                    {"role": "system", "content": self.system_prompt},
                    {"role": "user", "content": prompt},
                ],
                max_tokens=1500,
                temperature=0.7,
            )

            raw_response = response.choices[0].message.content
            return self._parse_instructions(raw_response)

        except Exception as e:
            logger.error(f"OpenAI refinement error: {e}")
            raise ValueError(f"Failed to refine instructions: {e}")

    async def quick_generate(
        self,
        description: str,
        specialty: AgentSpecialty,
    ) -> GeneratedInstructions:
        """
        Quick generation without conversation - for users who want to skip chat.

        Args:
            description: User's brief description of desired agent
            specialty: The agent's specialty

        Returns:
            Generated instructions
        """
        prompt = f"""Generate comprehensive agent personality instructions based on this description:

Specialty: {specialty.value}
User's description: {description}

Create RICH, DETAILED instructions (150-300 words) that capture a distinct personality.
Be specific about:
- Bidding strategy and risk tolerance
- Pricing approach
- Workload preferences
- When to be aggressive vs conservative

Also write a NEGOTIATION STYLE (60-150 words): how the agent haggles with the client after winning, how far it
concedes, and when it walks away.

Respond with ONLY a valid JSON object:
{{
  "auction_instructions": "...",
  "negotiation_style": "...",
  "suggested_name": "...",
  "personality_summary": "..."
}}"""

        try:
            response = await self.client.chat.completions.create(
                model="gpt-4o",
                messages=[
                    {"role": "system", "content": self.system_prompt},
                    {"role": "user", "content": prompt},
                ],
                max_tokens=1500,
                temperature=0.7,
            )

            raw_response = response.choices[0].message.content
            return self._parse_instructions(raw_response)

        except Exception as e:
            logger.error(f"OpenAI quick generation error: {e}")
            raise ValueError(f"Failed to generate instructions: {e}")

    def _parse_instructions(self, response_text: str) -> GeneratedInstructions:
        """Parse the LLM response into GeneratedInstructions."""
        # Clean up response - remove markdown code blocks if present
        cleaned = response_text.strip()
        if cleaned.startswith("```"):
            lines = cleaned.split("\n")
            lines = lines[1:]
            if lines and lines[-1].strip() == "```":
                lines = lines[:-1]
            cleaned = "\n".join(lines).strip()

        try:
            data = json.loads(cleaned)
            return GeneratedInstructions(
                auction_instructions=data["auction_instructions"],
                suggested_name=data.get("suggested_name", "My Agent"),
                personality_summary=data.get("personality_summary", "A strategic marketplace agent"),
                negotiation_style=data.get("negotiation_style") or DEFAULT_NEGOTIATION_STYLE,
            )
        except (json.JSONDecodeError, KeyError) as e:
            logger.error(f"Failed to parse instructions: {response_text}")
            raise ValueError(f"Failed to parse generated instructions: {e}")


# Singleton instance
_agent_builder: Optional[AgentBuilderService] = None


def get_agent_builder() -> AgentBuilderService:
    """Get or create the agent builder service singleton."""
    global _agent_builder
    if _agent_builder is None:
        _agent_builder = AgentBuilderService()
    return _agent_builder
