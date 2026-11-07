"""
API routes for agent statistics and performance metrics.

Provides real stats for the user dashboard.
"""

from fastapi import APIRouter, HTTPException, Depends
from uuid import UUID
from pydantic import BaseModel

from app.services.database import DatabaseService, get_database_service
from app.services.decision_service import DecisionService

router = APIRouter(prefix="/api/agents", tags=["agent-stats"])


class AgentStats(BaseModel):
    """Statistics for a single agent."""
    agent_id: str
    total_earnings: int
    jobs_won: int
    jobs_completed: int
    win_rate: float
    active_bids: int
    total_bids: int
    avg_bid_amount: float
    deals: int = 0  # negotiations that ended in a deal
    no_deals: int = 0
    walk_aways: int = 0  # no deals where this agent walked away
    avg_negotiation_gain: float | None = None  # average agreed price minus opening bid, over deals


class AgentFullStats(AgentStats):
    """Extended statistics including recent activity."""
    recent_wins: list[dict]
    specialty_breakdown: dict


@router.get("/{agent_id}/stats", response_model=AgentStats)
async def get_agent_stats(
    agent_id: UUID,
    db: DatabaseService = Depends(get_database_service),
) -> AgentStats:
    """Get statistics for a specific agent."""
    agent_id_str = str(agent_id)

    # Get agent to verify it exists
    agent_result = await db.table("agents").select("*").eq("id", agent_id_str).execute()
    if not agent_result.data:
        raise HTTPException(status_code=404, detail="Agent not found")

    agent = agent_result.data[0]

    # Bids on live auctions are sealed: they count toward totals, but their amounts stay out of
    # the average (comparing the average before and after a bid would reveal the sealed amount)
    active_auctions = await db.table("auctions").select("id").eq("status", "active").execute()
    active_auction_ids = {a["id"] for a in active_auctions.data or []}
    bids = (await db.table("bids").select("amount, auction_id").eq("agent_id", agent_id_str).execute()).data or []
    total_bids = len(bids)
    revealed = [b["amount"] for b in bids if b["auction_id"] not in active_auction_ids]
    avg_bid = sum(revealed) / len(revealed) if revealed else 0
    active_bids = len({b["auction_id"] for b in bids if b["auction_id"] in active_auction_ids})

    # Auctions won (win rate measures bidding, whatever happened in a negotiation after)
    winning_auctions = await db.table("auctions").select("id", count="exact").eq("winning_agent_id", agent_id_str).eq("status", "closed").execute()
    jobs_won = winning_auctions.count or 0

    # Earnings: what completed jobs actually paid (the agreed price when negotiated)
    completed = (await db.table("jobs").select("winning_bid").eq("assigned_agent_id", agent_id_str).eq("status", "completed").execute()).data or []
    jobs_completed = len(completed)
    total_earnings = sum(j.get("winning_bid") or 0 for j in completed)

    negotiations = (await db.table("negotiations").select("status, end_reason, opening_price, final_price").eq(
        "agent_id", agent_id_str
    ).execute()).data or []
    deal_gains = [n["final_price"] - n["opening_price"] for n in negotiations if n["status"] == "deal"]

    # Calculate win rate
    win_rate = (jobs_won / total_bids * 100) if total_bids > 0 else 0

    return AgentStats(
        agent_id=agent_id_str,
        total_earnings=total_earnings,
        jobs_won=jobs_won,
        jobs_completed=jobs_completed,
        win_rate=round(win_rate, 1),
        active_bids=active_bids,
        total_bids=total_bids,
        avg_bid_amount=round(avg_bid, 2),
        deals=len(deal_gains),
        no_deals=sum(n["status"] == "no_deal" for n in negotiations),
        walk_aways=sum(n["end_reason"] == "agent_walked" for n in negotiations),
        avg_negotiation_gain=round(sum(deal_gains) / len(deal_gains), 1) if deal_gains else None,
    )


@router.get("/{agent_id}/full-stats", response_model=AgentFullStats)
async def get_agent_full_stats(
    agent_id: UUID,
    db: DatabaseService = Depends(get_database_service),
) -> AgentFullStats:
    """Get extended statistics including recent activity."""
    # Get basic stats
    basic_stats = await get_agent_stats(agent_id, db)
    agent_id_str = str(agent_id)

    # Get recent winning auctions with job details
    recent_wins_result = await db.table("auctions").select(
        "id, winning_amount, closed_at, job_id"
    ).eq("winning_agent_id", agent_id_str).eq("status", "closed").order(
        "closed_at", desc=True
    ).limit(5).execute()

    recent_wins = []
    for auction in recent_wins_result.data or []:
        # Get job details
        job_result = await db.table("jobs").select("title, specialty, winning_bid, status").eq("id", auction["job_id"]).execute()
        job = job_result.data[0] if job_result.data else {}
        recent_wins.append({
            "auction_id": auction["id"],
            # The price the job pays (agreed price after a negotiation); no deal pays nothing
            "amount": None if job.get("status") == "unfilled" else job.get("winning_bid", auction["winning_amount"]),
            "job_status": job.get("status"),
            "closed_at": auction["closed_at"],
            "job_title": job.get("title", "Unknown"),
            "specialty": job.get("specialty", "unknown"),
        })

    # Get specialty breakdown of won jobs
    specialty_breakdown = {}
    if recent_wins_result.data:
        for win in recent_wins_result.data:
            job_result = await db.table("jobs").select("specialty").eq("id", win["job_id"]).execute()
            if job_result.data:
                spec = job_result.data[0]["specialty"]
                specialty_breakdown[spec] = specialty_breakdown.get(spec, 0) + 1

    return AgentFullStats(
        **basic_stats.model_dump(),
        recent_wins=recent_wins,
        specialty_breakdown=specialty_breakdown,
    )


@router.get("/{agent_id}/decisions")
async def get_agent_decisions(
    agent_id: UUID,
    limit: int = 20,
    db: DatabaseService = Depends(get_database_service),
) -> list[dict]:
    """The agent's latest bids and passes with reasoning, the job, and how each auction ended."""
    return await DecisionService(db).for_agent(agent_id, min(limit, 100))
