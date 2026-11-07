"""Read-only views of agent decisions: why each agent won or lost an auction."""

from uuid import UUID

from app.config import get_settings
from app.models.auction import AuctionStatus, AuctionWithJob
from app.services.auction_service import AuctionService
from app.services.database import DatabaseService


SEALED = "Sealed until the auction closes."


def explain(
    status: AuctionStatus,
    is_winner: bool,
    best_bid: int | None,
    winning_amount: int | None,
    cost: str | None,
    winner_cost: str | None,
    cost_value: int | None = None,
    price: int | None = None,
    haggle: dict | None = None,
) -> tuple[str, str]:
    """(outcome, one-line explanation) for one agent in one auction.

    cost / winner_cost are labels like "86 (2 jobs running)"; None for bids from before sealed auctions.
    haggle is the winner's finished negotiation (status, final_price), which decides what it was finally paid.
    """
    if status == AuctionStatus.ACTIVE:
        return ("sealed", "Bid submitted. Revealed when the auction closes.") if best_bid is not None \
            else ("passed", "Passed.")
    if best_bid is None:
        return "passed", "Never bid."
    yours = f" with a work cost of {cost}" if cost else ""
    theirs = f" with a work cost of {winner_cost}" if winner_cost else ""
    if status == AuctionStatus.CANCELLED:
        return "no_winner", f"Bid {best_bid}, but the auction closed without a winner."
    if is_winner:
        paid = price if price is not None else best_bid  # second price: the runner-up's bid
        won = f"Won at {best_bid}" if paid == best_bid else f"Won with a bid of {best_bid} and was paid {paid} (the runner-up's bid)"
        if haggle:  # the auction price only opened a negotiation; its result is what counts
            opening = f"Won at {best_bid}" if paid == best_bid else f"Won with a bid of {best_bid} at an auction price of {paid}"
            if haggle["status"] != "deal":
                return "won", f"{opening}, but no price was agreed with the client, so the job went unfilled and paid nothing."
            final = haggle["final_price"]
            if cost_value is None:
                return "won", f"{opening}, then agreed {final} with the client."
            profit = final - cost_value
            result = f"profit {profit}" if profit >= 0 else f"a loss of {-profit}"
            return "won", f"{opening}{yours}, then agreed {final} with the client: {result}."
        if cost_value is None:
            return "won", f"{won}."
        profit = paid - cost_value
        result = f"profit {profit}" if profit >= 0 else f"a loss of {-profit}"
        return "won", f"{won}{yours}: {result}."
    if winning_amount is None:
        return "lost", f"Bid {best_bid}{yours}."
    if best_bid > winning_amount:
        return "lost", (
            f"Bid {best_bid}{yours}. The winner bid {winning_amount}, "
            f"{best_bid - winning_amount} lower{theirs}."
        )
    if best_bid == winning_amount:
        return "lost", f"Bid {winning_amount}, same as the winner but later. Ties go to the earlier bid."
    return "lost", (
        f"Had the lowest bid ({best_bid}) but was full or out of credits at closing time, "
        "so the job went to the next bidder."
    )


def negotiation_explanation(negotiation: dict, messages: list[dict]) -> str:
    """One plain line on how a finished negotiation went, revealing the client's secret max and personality."""
    client_max, cost = negotiation["client_max_price"], negotiation["work_cost"]
    status, reason, final = negotiation["status"], negotiation["end_reason"], negotiation["final_price"]
    client_offers = [m["offer"] for m in messages if m["speaker"] == "client" and m["offer"]]
    agent_offers = [m["offer"] for m in messages if m["speaker"] == "agent" and m["action"] == "counter" and m["offer"]]
    agent_last = agent_offers[-1] if agent_offers else negotiation["opening_price"]

    if status == "deal":
        profit = final - cost
        result = f"a profit of {profit}" if profit >= 0 else f"a loss of {-profit}, below your work cost of {cost}"
        if final < client_max:
            line = (f"The client would have paid up to {client_max}. You settled at {final} and left "
                    f"{client_max - final} credits on the table ({result}).")
        else:
            line = f"You got the client's full limit of {client_max} ({result})."
    elif reason == "season_ended":
        line = f"The season ended before a deal. The client would have paid up to {client_max}."
    elif client_max < cost:
        line = (f"The client's limit was {client_max}, below your work cost of {cost}. "
                "No deal was the right outcome.")
    elif reason == "agent_walked":
        line = (f"You walked away, but the client would have paid up to {client_max}, "
                f"{client_max - cost} above your cost.")
    elif agent_last > client_max:
        line = (f"You asked for {agent_last} but the client's limit was {client_max}. "
                "No price above that could ever work.")
    elif reason == "client_walked":
        line = f"The client walked away. Its limit was {client_max}, so your {agent_last} could have worked."
    else:
        line = (f"Time ran out with your ask of {agent_last} still on the table. The client could have paid up to "
                f"{client_max}, so a deal was possible, but neither side closed it in time.")

    if negotiation["client_personality"] == "bluffer" and client_offers and max(client_offers) < client_max:
        line = (f"The client was a bluffer. It never offered more than {max(client_offers)} "
                f"but would have gone to {client_max}. ") + line
    return line


class DecisionService:
    def __init__(self, db: DatabaseService):
        self.db = db
        self.decisions = db.table("agent_decisions")
        self.auction_service = AuctionService(db)
        self.settings = get_settings()

    def _cost_label(self, cost: int | None, base_price: int, agent_id=None, auction_id=None) -> str | None:
        """e.g. "86 (2 jobs running)", worked back from the cost formula (private factor included); None for old bids."""
        if cost is None:
            return None
        idle = base_price * self.settings.work_cost_ratio * (
            self.settings.private_cost_factor(agent_id, auction_id) if agent_id and auction_id else 1.0
        )
        jobs = round((cost / idle - 1) / self.settings.workload_cost_step) if idle else 0
        return f"{cost} (idle)" if jobs <= 0 else f"{cost} ({jobs} job{'s' if jobs > 1 else ''} running)"

    async def _agents_by_id(self, agent_ids: set[str]) -> dict[str, dict]:
        if not agent_ids:
            return {}
        rows = (await self.db.table("agents").select("id, name, specialty").in_("id", list(agent_ids)).execute()).data
        return {row["id"]: row for row in rows}

    async def for_auction(self, auction_id: UUID) -> list[dict]:
        """Every stored decision on an auction, oldest first, with the agent's name."""
        rows = (await self.decisions.select("*").eq("auction_id", str(auction_id)).order("created_at").execute()).data
        agents = await self._agents_by_id({row["agent_id"] for row in rows})
        return [
            {
                **row,
                "agent_name": agents.get(row["agent_id"], {}).get("name", "Unknown agent"),
                "agent_specialty": agents.get(row["agent_id"], {}).get("specialty"),
            }
            for row in rows
        ]

    async def auction_breakdown(self, auction_id: UUID) -> dict | None:
        """The auction, its decision timeline, and why each agent won or lost."""
        auction: AuctionWithJob | None = await self.auction_service.get_auction_with_job(auction_id)
        if not auction:
            return None
        base_price = auction.job_base_price
        sealed = auction.status == AuctionStatus.ACTIVE
        decisions = await self.for_auction(auction_id)
        if sealed:
            decisions = [{**d, "bid_amount": None, "reasoning": SEALED} for d in decisions]

        # Each agent's bid and the work cost it faced (bids are sorted lowest first)
        best: dict[str, int] = {}
        costs: dict[str, int | None] = {}
        for bid in await self.auction_service.get_auction_bids(auction_id):
            agent_id = str(bid.agent_id)
            if agent_id not in best:
                best[agent_id] = bid.amount
                costs[agent_id] = bid.work_cost

        last_reasoning = {d["agent_id"]: d["reasoning"] for d in decisions}  # oldest first, so last wins
        agent_ids = set(best) | set(last_reasoning)
        agents = await self._agents_by_id(agent_ids)
        winner_id = str(auction.winning_agent_id) if auction.winning_agent_id else None
        label = {agent_id: self._cost_label(cost, base_price, agent_id, auction_id) for agent_id, cost in costs.items()}

        negotiation = None
        rows = (await self.db.table("negotiations").select("*").eq("auction_id", str(auction_id)).execute()).data
        if rows:
            from app.services.negotiation_service import NegotiationService, public_negotiation
            negotiation = public_negotiation(rows[0], await NegotiationService(self.db).get_messages(rows[0]["id"]))
        haggle = negotiation if negotiation and negotiation["status"] != "active" else None

        summaries = []
        for agent_id in agent_ids:
            outcome, explanation = explain(
                auction.status, agent_id == winner_id, best.get(agent_id), auction.winning_amount,
                label.get(agent_id), label.get(winner_id) if winner_id else None, costs.get(agent_id),
                auction.price_paid, haggle,
            )
            summaries.append({
                "agent_id": agent_id,
                "agent_name": agents.get(agent_id, {}).get("name", "Unknown agent"),
                "specialty": agents.get(agent_id, {}).get("specialty"),
                "best_bid": None if sealed else best.get(agent_id),
                "work_cost": None if sealed else costs.get(agent_id),
                "last_reasoning": None if sealed else last_reasoning.get(agent_id),
                "outcome": outcome,
                "explanation": explanation,
            })
        # Winner first, then lowest bid; agents who never bid last
        summaries.sort(key=lambda s: (s["outcome"] != "won", s["best_bid"] is None, s["best_bid"] or 0))

        return {
            "auction": auction.public_view().model_dump(mode="json"),
            "work_cost": self.settings.work_cost(base_price),  # an idle agent's cost
            "decisions": decisions,
            "agents": summaries,
            "negotiation": negotiation,  # None unless the winner had to negotiate
        }

    async def for_agent(self, agent_id: UUID, limit: int = 20) -> list[dict]:
        """An agent's latest decisions with the job and how the auction turned out."""
        rows = (await self.decisions.select("*").eq("agent_id", str(agent_id)).order(
            "created_at", desc=True
        ).range(0, limit - 1).execute()).data
        auction_ids = list({row["auction_id"] for row in rows})
        auctions = {
            row["id"]: row
            for row in (
                (await self.db.table("auctions").select("id, job_id, status, winning_agent_id, winning_amount")
                .in_("id", auction_ids).execute()).data if auction_ids else []
            )
        }
        job_ids = list({a["job_id"] for a in auctions.values()})
        jobs = {
            row["id"]: row
            for row in (
                (await self.db.table("jobs").select("id, title, specialty").in_("id", job_ids).execute()).data
                if job_ids else []
            )
        }

        history = []
        for row in rows:
            auction = auctions.get(row["auction_id"], {})
            job = jobs.get(auction.get("job_id"), {})
            status = auction.get("status")
            if status == AuctionStatus.ACTIVE.value:
                outcome = "open"
                row = {**row, "bid_amount": None, "reasoning": SEALED}
            elif status == AuctionStatus.CLOSED.value:
                outcome = "won" if auction.get("winning_agent_id") == str(agent_id) else "lost"
            else:
                outcome = "no_winner"
            history.append({
                **row,
                "job_title": job.get("title", "Unknown job"),
                "job_specialty": job.get("specialty"),
                "auction_status": status,
                "winning_amount": auction.get("winning_amount"),
                "outcome": outcome,
            })
        return history
