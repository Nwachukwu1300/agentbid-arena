"""
API routes for marketplace analytics.

Provides real market data for the analytics dashboard.
"""

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from datetime import datetime, timedelta, timezone

from app.services.database import DatabaseService, fetch_all, get_database_service
from app.models.agent import AgentSpecialty
from app.services.season_service import SeasonService

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


class MarketStats(BaseModel):
    """Overall marketplace statistics."""
    total_volume: int
    avg_winning_bid: float
    active_agents: int
    jobs_completed: int
    active_auctions: int


class SpecialtyShare(BaseModel):
    """Market share by specialty."""
    specialty: str
    value: int
    percentage: float


class TrendPoint(BaseModel):
    """A point on a trend chart."""
    date: str
    value: float


class LeaderboardEntry(BaseModel):
    """Live season standing (ranked by credits)."""
    rank: int
    agent_id: str
    agent_name: str
    specialty: str
    credits: int
    profit: int
    jobs_won: int
    win_rate: float
    bankrupt: bool
    avg_negotiation_gain: float | None = None  # "best negotiator": average gain over the opening bid


class AnalyticsResponse(BaseModel):
    """Complete analytics response."""
    market_stats: MarketStats
    specialty_share: list[SpecialtyShare]
    bid_trend: list[TrendPoint]
    volume_trend: list[TrendPoint]
    leaderboard: list[LeaderboardEntry]


@router.get("/market-stats", response_model=MarketStats)
async def get_market_stats(
    db: DatabaseService = Depends(get_database_service),
) -> MarketStats:
    """Get overall marketplace statistics."""
    # Count active agents
    agents_result = await db.table("agents").select("id", count="exact").eq("is_active", True).execute()
    active_agents = agents_result.count or 0

    # Count active auctions
    auctions_result = await db.table("auctions").select("id", count="exact").eq("status", "active").execute()
    active_auctions = auctions_result.count or 0

    # Get completed auctions with winning amounts
    completed_auctions = await fetch_all(
        lambda: db.table("auctions").select("winning_amount").eq("status", "closed").not_.is_("winning_amount", "null").order("id")
    )

    jobs_completed = len(completed_auctions)
    bids_total = sum(a.get("winning_amount", 0) or 0 for a in completed_auctions)
    avg_winning_bid = bids_total / jobs_completed if jobs_completed > 0 else 0
    # Volume is what was actually paid: second prices and negotiated deals, not the winning bids
    paid = await fetch_all(
        lambda: db.table("jobs").select("winning_bid").in_("status", ["in_progress", "completed"]).order("id")
    )
    total_volume = sum(j.get("winning_bid") or 0 for j in paid)

    return MarketStats(
        total_volume=total_volume,
        avg_winning_bid=round(avg_winning_bid, 2),
        active_agents=active_agents,
        jobs_completed=jobs_completed,
        active_auctions=active_auctions,
    )


@router.get("/specialty-share", response_model=list[SpecialtyShare])
async def get_specialty_share(
    db: DatabaseService = Depends(get_database_service),
) -> list[SpecialtyShare]:
    """Share of won jobs by specialty (a won job has a winning bid). All zeros before any job is won."""
    specialties = [s.value for s in AgentSpecialty]
    counts = {}
    for specialty in specialties:
        won = await db.table("jobs").select("id", count="exact").eq("specialty", specialty).not_.is_(
            "winning_bid", "null"
        ).execute()
        counts[specialty] = won.count or 0

    total = sum(counts.values())
    return [
        SpecialtyShare(
            specialty=s,
            value=counts[s],
            percentage=round(counts[s] / total * 100, 1) if total else 0.0,
        )
        for s in specialties
    ]


@router.get("/bid-trend", response_model=list[TrendPoint])
async def get_bid_trend(
    days: int = Query(14, ge=1, le=30),
    db: DatabaseService = Depends(get_database_service),
) -> list[TrendPoint]:
    """Average winning bid per day over the last `days` days (UTC). One paged read, bucketed by day."""
    now = datetime.now(timezone.utc)
    first_day = (now - timedelta(days=days - 1)).replace(hour=0, minute=0, second=0, microsecond=0)
    rows = await fetch_all(
        lambda: db.table("auctions").select("winning_amount, closed_at").eq("status", "closed").gte(
            "closed_at", first_day.isoformat()
        ).order("id")
    )
    by_day: dict[str, list[int]] = {}
    for row in rows:
        if row.get("winning_amount") and row.get("closed_at"):
            by_day.setdefault(row["closed_at"][:10], []).append(row["winning_amount"])

    result = []
    for i in range(days):
        day = first_day + timedelta(days=i)
        amounts = by_day.get(day.date().isoformat(), [])
        result.append(TrendPoint(date=day.strftime("%b %d"), value=round(sum(amounts) / len(amounts), 2) if amounts else 0))
    return result


@router.get("/volume-trend", response_model=list[TrendPoint])
async def get_volume_trend(
    days: int = Query(14, ge=1, le=30),
    db: DatabaseService = Depends(get_database_service),
) -> list[TrendPoint]:
    """Get job volume trend over time."""
    result = []
    now = datetime.now(timezone.utc)

    for i in range(days - 1, -1, -1):
        day = now - timedelta(days=i)
        day_start = day.replace(hour=0, minute=0, second=0, microsecond=0)
        day_end = day_start + timedelta(days=1)

        # Count jobs created on this day
        jobs = await db.table("jobs").select("id", count="exact").gte(
            "created_at", day_start.isoformat()
        ).lt("created_at", day_end.isoformat()).execute()

        result.append(TrendPoint(
            date=day.strftime("%b %d"),
            value=jobs.count or 0,
        ))

    return result


@router.get("/leaderboard", response_model=list[LeaderboardEntry])
async def get_leaderboard(
    limit: int = 10,
    db: DatabaseService = Depends(get_database_service),
) -> list[LeaderboardEntry]:
    """Current season standings: most credits first."""
    seasons = SeasonService(db)
    current = await seasons.get_current()
    standings = await seasons.standings(current["started_at"] if current else None)
    return [LeaderboardEntry(**s) for s in standings[:limit]]


@router.get("/all", response_model=AnalyticsResponse)
async def get_all_analytics(
    db: DatabaseService = Depends(get_database_service),
) -> AnalyticsResponse:
    """Get all analytics data in one request."""
    market_stats = await get_market_stats(db)
    specialty_share = await get_specialty_share(db)
    bid_trend = await get_bid_trend(14, db)
    volume_trend = await get_volume_trend(14, db)
    leaderboard = await get_leaderboard(10, db)

    return AnalyticsResponse(
        market_stats=market_stats,
        specialty_share=specialty_share,
        bid_trend=bid_trend,
        volume_trend=volume_trend,
        leaderboard=leaderboard,
    )
