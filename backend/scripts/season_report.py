#!/usr/bin/env python3
"""Auction numbers for one season: bidders per round, winner profit at the auction price, per-agent results.

Run from backend/:  ./venv/bin/python scripts/season_report.py <season number>
"""
import asyncio, statistics, sys
from collections import Counter, defaultdict
sys.path.insert(0, str(__import__('pathlib').Path(__file__).resolve().parents[1]))  # backend/
from uuid import UUID
from app.services.database import get_database_service
from app.services.auction_service import AuctionService
from app.services.season_service import SeasonService
from app.services.agent_service import AgentService

async def main(number: int):
    db = await get_database_service()
    season = await SeasonService(db).get_by_number(number)
    rows = (await db.table("auctions").select("id,winning_agent_id,status,closed_at")
            .gte("closed_at", season["started_at"]).lte("closed_at", season["ends_at"]).execute()).data
    names = {str(a.id): a.name for a in await AgentService(db).get_all()} if hasattr(AgentService, "get_all") else {}
    svc = AuctionService(db)
    profits, bidders, gaps = [], Counter(), []
    per_agent = defaultdict(lambda: {"wins": 0, "profit": 0, "bids": 0})
    for r in rows:
        bids = await svc.get_auction_bids(UUID(r["id"]))
        seen = {}
        for b in bids:
            seen.setdefault(str(b.agent_id), b)
        bidders[len(seen)] += 1
        for aid in seen:
            per_agent[aid]["bids"] += 1
        if not r["winning_agent_id"]:
            continue
        a = await svc.get_auction_with_job(UUID(r["id"]))
        win = seen.get(str(r["winning_agent_id"]))
        if not win or win.work_cost is None or a.price_paid is None:
            continue
        p = a.price_paid - win.work_cost
        profits.append(p)
        gaps.append(a.price_paid - a.winning_amount)
        per_agent[str(r["winning_agent_id"])]["wins"] += 1
        per_agent[str(r["winning_agent_id"])]["profit"] += p
    if not names:
        res = (await db.table("agents").select("id,name").execute()).data
        names = {x["id"]: x["name"] for x in res}
    print(f"Season {number}: {len(rows)} closed auctions, {len(profits)} with a winner")
    print("Bidders per auction:", dict(sorted(bidders.items())))
    if profits:
        print(f"Winner profit at auction price: mean {statistics.mean(profits):.1f}, median {statistics.median(profits)}, "
              f"min {min(profits)}, at or below 1: {sum(p <= 1 for p in profits)} of {len(profits)}")
        print(f"Second-price gap (paid minus winning bid): mean {statistics.mean(gaps):.1f}, median {statistics.median(gaps)}")
    print("Per agent (wins / bids, auction profit):")
    for aid, v in sorted(per_agent.items(), key=lambda kv: -kv[1]["profit"]):
        n = names.get(aid, aid[:8])
        print(f"  {n:15s}{v['wins']:3d} / {v['bids']:3d}   {v['profit']:5d}")

asyncio.run(main(int(sys.argv[1])))
