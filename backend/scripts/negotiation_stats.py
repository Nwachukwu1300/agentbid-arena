#!/usr/bin/env python3
"""Negotiation balance numbers for a season (default: the current one), or for every negotiation.

Run from backend/:  ./venv/bin/python scripts/negotiation_stats.py [--season N | --all]
Target deal rate: 60-80%. Tunables live in app/config.py (client_max_low_ratio, client_max_high_ratio, ...).
"""

import argparse
import asyncio
import statistics
import sys
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # backend/


def summarize(negotiations: list[dict]) -> str:
    """The balance report for finished negotiations (active ones are skipped)."""
    ended = [n for n in negotiations if n["status"] != "active"]
    if not ended:
        return "No finished negotiations."
    deals = [n for n in ended if n["status"] == "deal"]
    feasible = [n for n in ended if n["client_max_price"] >= n["work_cost"]]
    pct = lambda part, whole: f"{100 * len(part) / len(whole):.0f}%" if whole else "n/a"
    lines = [
        f"Finished negotiations: {len(ended)}",
        f"1. Deal rate: {pct(deals, ended)} ({len(deals)} deals)"
        f"   | among those where a deal was possible (client max >= agent cost): "
        f"{pct([n for n in feasible if n['status'] == 'deal'], feasible)} of {len(feasible)}",
    ]
    if deals:
        gains = [n["final_price"] - n["opening_price"] for n in deals]
        lines.append(f"2. Final price vs opening: avg {statistics.mean(gains):+.1f} credits "
                     f"({statistics.mean(n['final_price'] / n['opening_price'] for n in deals):.0%} of opening)")
        lines.append(f"3. Profit per deal: avg {statistics.mean(n['final_price'] - n['work_cost'] for n in deals):.1f}, "
                     f"deals below cost: {sum(n['final_price'] < n['work_cost'] for n in deals)}")
    else:
        lines += ["2. Final price vs opening: no deals", "3. Profit per deal: no deals"]
    reasons = Counter(n["end_reason"] for n in ended)
    lines.append("4. End reasons: " + ", ".join(f"{r} {c}" for r, c in reasons.most_common()))
    by_personality = defaultdict(list)
    for n in ended:
        by_personality[n["client_personality"]].append(n)
    lines.append("5. Deal rate by client personality: " + ", ".join(
        f"{p} {pct([n for n in ns if n['status'] == 'deal'], ns)} ({len(ns)})" for p, ns in sorted(by_personality.items())
    ))
    return "\n".join(lines)


async def main():
    from app.services.database import fetch_all, get_database_service
    from app.services.season_service import SeasonService

    parser = argparse.ArgumentParser(description=(__doc__ or "").splitlines()[0])
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--season", type=int, help="season number (default: the current season)")
    group.add_argument("--all", action="store_true", help="every negotiation ever")
    args = parser.parse_args()

    db = await get_database_service()
    season = None
    if not args.all:
        seasons = SeasonService(db)
        season = await (seasons.get_by_number(args.season) if args.season else seasons.get_current())
        if not season:
            sys.exit("Season not found.")
    rows = await fetch_all(lambda: (
        db.table("negotiations").select("*").eq("season_id", season["id"]) if season
        else db.table("negotiations").select("*")
    ).order("id"))
    print(f"Season {season['number']}" if season else "All seasons")
    print(summarize(rows))


if __name__ == "__main__":
    asyncio.run(main())
