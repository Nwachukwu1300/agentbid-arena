"""Experiments: replay strategies on recent closed auctions against the real recorded rival bids.

Nothing here touches live play: no bids, decisions or credits are written (the route charges the fee).
shortcut: no negotiation and an idle workload in replays, add them if results feel unrealistic.
"""

import asyncio

from app.config import get_settings
from app.models.agent import Agent
from app.models.agent_decision import AgentState, AuctionContext, BidDecision
from app.models.auction import AuctionStatus
from app.services.agent_intelligence import AgentIntelligenceService
from app.services.agent_service import AgentService
from app.services.auction_service import AuctionService
from app.services.database import DatabaseService


class NoAuctionsToReplay(Exception):
    pass


def score(my_bid: int | None, my_cost: int, rival_bids: list[int], budget: int,
          payment_rule: str = "second_price") -> tuple[str, int | None, int]:
    """(outcome, price paid, profit) for one replayed bid, by the live auction rules."""
    if my_bid is None:
        return "passed", None, 0
    if my_bid > budget:  # live play rejects it, so it can't win
        return "over_budget", None, 0
    best_rival = min(rival_bids) if rival_bids else None
    if best_rival is not None and my_bid >= best_rival:  # the rivals bid earlier, so they win ties
        return "lost", None, 0
    price = my_bid if payment_rule == "first_price" or best_rival is None else best_rival
    return "won", price, price - my_cost


def summarize(rows: list[dict], labels: dict[str, str]) -> tuple[dict, list[str]]:
    """Totals per strategy and plain sentences on why one did better. rows: one per replayed auction."""
    summary = {}
    for key, label in labels.items():
        runs = [row["runs"][key] for row in rows]
        margins = [(r["bid"] / row["work_cost"] - 1) for row, r in zip(rows, runs) if r["bid"] and row["work_cost"]]
        summary[key] = {
            "label": label,
            "wins": sum(r["outcome"] == "won" for r in runs),
            "losses": sum(r["outcome"] in ("lost", "over_budget") for r in runs),
            "passes": sum(r["outcome"] == "passed" for r in runs),
            "profit": sum(r["profit"] for r in runs),
            "avg_margin": round(sum(margins) / len(margins) * 100, 1) if margins else None,
            # Lost, though a bid just under the best rival would still have beaten its own cost
            "missed_profitable": sum(
                r["outcome"] in ("lost", "passed") and row["best_rival_bid"] is not None
                and row["best_rival_bid"] - 1 > row["work_cost"]
                for row, r in zip(rows, runs)
            ),
        }

    a, b = (summary[k] for k in labels)
    why = []
    if a["profit"] == b["profit"]:
        why.append(f"Both earned {a['profit']} credits across {len(rows)} replayed auctions.")
    else:
        top, low = (a, b) if a["profit"] > b["profit"] else (b, a)
        why.append(f"{top['label']} earned {top['profit']} credits across {len(rows)} replayed auctions, "
                   f"against {low['profit']} for {low['label']}.")
    why.append(f"{a['label']} won {a['wins']} of them and {b['label']} won {b['wins']}.")
    if a["avg_margin"] is not None and b["avg_margin"] is not None and a["wins"] != b["wins"]:
        pricey, cheap = (a, b) if a["avg_margin"] > b["avg_margin"] else (b, a)
        if pricey["wins"] < cheap["wins"]:
            why.append(f"{pricey['label']} bid {pricey['avg_margin']}% above its cost on average, against "
                       f"{cheap['avg_margin']}% for {cheap['label']}, so rivals undercut it more often.")
    for s in (a, b):
        if s["passes"] >= 2 and s["passes"] - min(a["passes"], b["passes"]) >= 2:
            why.append(f"{s['label']} passed on {s['passes']} jobs, giving up chances to win.")
        if s["missed_profitable"]:
            why.append(f"{s['label']} missed {s['missed_profitable']} auction(s) it could have won at a profit "
                       "by bidding just under the best rival.")
    why.append("Replays treat the agent as idle and skip negotiation, and the AI's answers vary between runs, "
               "so small differences may be noise.")
    return summary, why


async def pick_auctions(db: DatabaseService, agent: Agent, n: int) -> list[tuple]:
    """The n most recent closed auctions in the agent's specialty with at least one rival bid: (auction, rival bids)."""
    # The specialty filter runs after the page is fetched, so fetch a wide page (5 specialties share it)
    auctions = await AuctionService(db).get_active_auctions(
        specialty=agent.specialty, limit=max(100, n * 10), status=AuctionStatus.CLOSED,
    )
    if not auctions:
        return []
    rival_bids: dict[str, list[int]] = {}
    for row in (await db.table("bids").select("auction_id, agent_id, amount").in_(
        "auction_id", [str(a.id) for a in auctions]
    ).execute()).data:
        # shortcut: rivals are every other agent, including the owner's other agents
        if str(row["agent_id"]) != str(agent.id):
            rival_bids.setdefault(str(row["auction_id"]), []).append(row["amount"])
    return [(a, rival_bids[str(a.id)]) for a in auctions if rival_bids.get(str(a.id))][:n]


async def run(db: DatabaseService, agent: Agent, strategies: dict[str, tuple[str, str]], n: int) -> dict:
    """Replay each strategy ({key: (label, instructions)}) on the same n auctions and score them."""
    settings = get_settings()
    picked = await pick_auctions(db, agent, n)
    if not picked:
        raise NoAuctionsToReplay("No closed auctions with rival bids in this specialty yet.")
    intelligence = AgentIntelligenceService(db)
    # Same wording as live play: how many other agents might bid, not how many did
    rival_count = max(len(await AgentService(db).get_all(specialty=agent.specialty, is_active=True)) - 1, 0)
    sem = asyncio.Semaphore(5)

    async def decide(instructions: str, auction):
        prompt = intelligence._build_system_prompt(
            AgentState(agent_name=agent.name, specialty=agent.specialty.value, auction_instructions=instructions,
                       current_jobs=0, credits=agent.credits),
            AuctionContext(job_title=auction.job_title, job_description=auction.job_description,
                           job_specialty=auction.job_specialty.value, market_average_price=auction.job_base_price,
                           rival_count=rival_count, time_remaining_seconds=auction.duration_seconds, total_bids=0),
            agent.id, auction.id,
        )
        async with sem:
            decision, _ = await intelligence.ask_model(prompt, agent.name)
        return decision

    jobs = [(key, auction, rivals) for auction, rivals in picked for key in strategies]
    decisions = await asyncio.gather(*(decide(strategies[key][1], auction) for key, auction, _ in jobs))
    if all(d is None for d in decisions):
        raise RuntimeError("The AI model gave no usable answers")

    rows: dict[str, dict] = {}
    for (key, auction, rivals), decision in zip(jobs, decisions):
        cost = settings.work_cost(auction.job_base_price, 0, agent.id, auction.id)
        row = rows.setdefault(str(auction.id), {
            "auction_id": str(auction.id),
            "job_title": auction.job_title,
            "budget": auction.job_base_price,
            "work_cost": cost,
            "best_rival_bid": min(rivals),
            "rival_bids": len(rivals),
            "runs": {},
        })
        bid = decision.bid_amount if isinstance(decision, BidDecision) else None
        outcome, price, profit = score(bid, cost, rivals, auction.job_base_price, settings.payment_rule)
        row["runs"][key] = {
            "bid": bid, "outcome": outcome, "price": price, "profit": profit,
            "reasoning": decision.reasoning if decision else "No usable answer from the AI model, counted as a pass.",
        }

    summary, why = summarize(list(rows.values()), {key: label for key, (label, _) in strategies.items()})
    return {"auctions": list(rows.values()), "summary": summary, "why": why}
