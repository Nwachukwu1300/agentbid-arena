#!/usr/bin/env python3
"""Run many negotiations at once against the real AI, on an in-memory database, and print the balance report.

No game loop and no Supabase writes: just the negotiation service. About 6-12 gpt-4o-mini calls per negotiation.
Run from backend/:  ./venv/bin/python scripts/negotiation_sim.py [--n 40] [--seed 1] [--show 2]
Scenarios follow live second-price play: opening price = the agent's cost x 1.1-1.8, capped at the budget.
"""

import argparse
import asyncio
import random
import sys
import uuid
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # backend/

from app.config import get_settings  # noqa: E402
from app.models.agent import SPECIALTY_PRICE_RANGES  # noqa: E402
from app.services.negotiation_service import NegotiationService  # noqa: E402
from scripts.negotiation_stats import summarize  # noqa: E402
from tests.fake_db import FakeDB  # noqa: E402

# --styles mix: a spread from cooperative to stubborn, like real players might write (None = the default style)
STYLES = {
    "default": None,
    "closer": "Close fast: accept the first offer that earns any profit at all.",
    "haggler": "Ask for about 15% more than the opening price, concede in small steps, and settle for a solid profit.",
    "stubborn": "Hold firm: never accept less than 95% of the opening price. Walk away rather than go lower.",
}


async def negotiate(fake, svc, rng, sem, style_name, client=None):
    specialty, (low, high) = rng.choice(list(SPECIALTY_PRICE_RANGES.items()))
    budget = rng.randint(low, high)
    cost = round(budget * 0.5 * rng.uniform(0.8, 1.2))
    opening = min(budget, round(cost * rng.uniform(1.1, 1.8)))
    job_id, agent_id = str(uuid.uuid4()), str(uuid.uuid4())
    fake.tables.setdefault("jobs", []).append({
        "id": job_id, "title": f"{specialty.value} job", "description": "A typical job.", "base_price": budget,
        "status": "in_progress", "specialty": specialty.value,
    })
    fake.tables.setdefault("agents", []).append({
        "id": agent_id, "user_id": str(uuid.uuid4()), "name": "Agent", "specialty": specialty.value,
        "auction_instructions": "x", "negotiation_style": STYLES[style_name], "credits": 1000, "current_jobs": 1, "is_active": True,
        "created_at": "2026-01-01T00:00:00+00:00", "updated_at": "2026-01-01T00:00:00+00:00",
    })
    job = SimpleNamespace(id=job_id, base_price=budget, title=f"{specialty.value} job")
    async with sem:
        await svc.maybe_start(uuid.uuid4(), job, agent_id, opening, cost)
        negotiation = next(n for n in fake.tables["negotiations"] if n["job_id"] == job_id)  # others run concurrently
        negotiation["style"] = style_name  # for the per-style report only
        if client:
            negotiation["client_personality"] = client
        while negotiation["status"] == "active":
            await svc.take_turn(dict(negotiation))


async def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0] if __doc__ else None)
    parser.add_argument("--n", type=int, default=40, help="number of negotiations")
    parser.add_argument("--seed", type=int, default=1, help="scenario seed (client draws use the global RNG)")
    parser.add_argument("--concurrency", type=int, default=10)
    parser.add_argument("--show", type=int, default=0, help="print this many transcripts")
    parser.add_argument("--styles", choices=["default", "mix"], default="default", help="agent negotiation styles")
    parser.add_argument("--client", help="force one client personality (e.g. picky)")
    args = parser.parse_args()

    fake = FakeDB()
    svc = NegotiationService(fake)
    svc.settings = get_settings().model_copy(update={"negotiation_share": 1.0})
    rng, sem = random.Random(args.seed), asyncio.Semaphore(args.concurrency)
    random.seed(args.seed)
    names = list(STYLES) if args.styles == "mix" else ["default"]
    await asyncio.gather(*(negotiate(fake, svc, rng, sem, names[i % len(names)], args.client) for i in range(args.n)))

    negotiations = fake.tables["negotiations"]
    for n in negotiations[: args.show]:
        print(f"\n--- {n['client_personality']}: opening {n['opening_price']}, cost {n['work_cost']}, "
              f"client max {n['client_max_price']} -> {n['status']} {n['final_price'] or ''} ({n['end_reason']})")
        for m in [m for m in fake.tables["negotiation_messages"] if m["negotiation_id"] == n["id"]]:
            print(f"  {m['turn_number']} {m['speaker']:6} {m['action']:9} {m['offer'] or '':>4}  {m['message'][:110]}")
    calls = sum(v for (_, key), v in fake.ai_usage.items() if key == "negotiation")
    print(f"\n{summarize(negotiations)}\nAI calls: {calls}")
    if args.styles == "mix":
        print("\nBy agent style (earned = average profit per negotiation, no deal = 0):")
        for name in names:
            mine = [n for n in negotiations if n.get("style") == name]
            deals = [n for n in mine if n["status"] == "deal"]
            earned = sum(n["final_price"] - n["work_cost"] for n in deals) / len(mine)
            print(f"  {name:9} deal rate {100 * len(deals) / len(mine):3.0f}%  earned {earned:5.1f}  ({len(mine)} negotiations)")


if __name__ == "__main__":
    asyncio.run(main())
