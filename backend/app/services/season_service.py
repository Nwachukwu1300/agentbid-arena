"""Seasons: fixed-length rounds of the arena. Credits reset at the start of each one."""

from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone

from app.config import get_settings
from app.services.agent_service import AgentService
from app.services.database import DatabaseService


class SeasonService:
    def __init__(self, db: DatabaseService):
        self.db = db
        self.seasons = db.table("seasons")
        self.results = db.table("season_results")
        self.agent_service = AgentService(db)
        self.settings = get_settings()

    async def get_current(self) -> dict | None:
        rows = (await self.seasons.select("*").eq("status", "active").order("number", desc=True).range(0, 0).execute()).data
        return rows[0] if rows else None

    async def get_by_number(self, number: int) -> dict | None:
        rows = (await self.seasons.select("*").eq("number", number).execute()).data
        return rows[0] if rows else None

    async def list_seasons(self, limit: int = 20) -> list[dict]:
        return (await self.seasons.select("*").order("number", desc=True).range(0, limit - 1).execute()).data

    async def get_results(self, season_id: str) -> list[dict]:
        return (await self.results.select("*").eq("season_id", season_id).order("rank").execute()).data

    async def standings(self, since: str | None) -> list[dict]:
        """Live ranking by credits. Wins and win rate count auctions closed since `since`."""
        agents = await self.agent_service.get_all(limit=1000)

        # Count wins and entries over the same set of auctions, so win rate stays within 0-100%
        closed_query = self.db.table("auctions").select("id, winning_agent_id").eq("status", "closed")
        if since:
            closed_query = closed_query.gte("closed_at", since)
        closed = (await closed_query.execute()).data
        wins = Counter(row["winning_agent_id"] for row in closed)
        entered: dict[str, set] = defaultdict(set)
        if closed:
            bids = (await self.db.table("bids").select("agent_id, auction_id").in_(
                "auction_id", [row["id"] for row in closed]
            ).execute()).data
            for row in bids:
                entered[row["agent_id"]].add(row["auction_id"])

        deals_query = self.db.table("negotiations").select("agent_id, opening_price, final_price").eq("status", "deal")
        if since:
            deals_query = deals_query.gte("created_at", since)
        gains: dict[str, list[int]] = defaultdict(list)
        for row in (await deals_query.execute()).data:
            gains[row["agent_id"]].append(row["final_price"] - row["opening_price"])

        start = self.settings.default_agent_credits
        ranked = sorted(agents, key=lambda a: a.credits, reverse=True)
        standings = []
        for rank, agent in enumerate(ranked, start=1):
            agent_id = str(agent.id)
            won, joined = wins[agent_id], len(entered[agent_id])
            standings.append({
                "rank": rank,
                "agent_id": agent_id,
                "agent_name": agent.name,
                "specialty": agent.specialty.value,
                "credits": agent.credits,
                "profit": agent.credits - start,
                "jobs_won": won,
                "win_rate": round(won / joined * 100, 1) if joined else 0.0,
                "bankrupt": agent.is_bankrupt,
                # Average price gained over the opening bid in deals (None: no deals yet)
                "avg_negotiation_gain": round(sum(gains[agent_id]) / len(gains[agent_id]), 1) if gains[agent_id] else None,
            })
        return standings

    async def finish(self, season: dict) -> list[dict]:
        """Freeze the final standings and close the season."""
        standings = await self.standings(season["started_at"])
        if standings:
            await self.results.insert([
                {
                    "season_id": season["id"],
                    "agent_id": s["agent_id"],
                    "agent_name": s["agent_name"],
                    "specialty": s["specialty"],
                    "rank": s["rank"],
                    "final_credits": s["credits"],
                    "profit": s["profit"],
                    "jobs_won": s["jobs_won"],
                    "win_rate": s["win_rate"],
                    "avg_negotiation_gain": s["avg_negotiation_gain"],
                }
                for s in standings
            ]).execute()
        await self.seasons.update({"status": "finished"}).eq("id", season["id"]).execute()
        return standings

    async def start_next(self) -> dict:
        """Reset every agent's credits and job count, then open the next season.

        Called after every running job was paid, so no agent is working: zeroing the job count also heals any drift.
        """
        # One statement for every agent (PostgREST requires a filter; this one matches every row)
        await self.agent_service.table.update({
            "credits": self.settings.default_agent_credits, "current_jobs": 0,
        }).gte("current_jobs", 0).execute()

        last = (await self.seasons.select("number").order("number", desc=True).range(0, 0).execute()).data
        now = datetime.now(timezone.utc)
        return (await self.seasons.insert({
            "number": last[0]["number"] + 1 if last else 1,
            "status": "active",
            "started_at": now.isoformat(),
            "ends_at": (now + timedelta(seconds=self.settings.season_duration_seconds)).isoformat(),
        }).execute()).data[0]
