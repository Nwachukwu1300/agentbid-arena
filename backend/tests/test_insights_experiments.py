"""Strategy versions, Intelligence insights and Experiments, against the in-memory fake database (no network).

Run from backend/:  ./venv/bin/python -m tests.test_insights_experiments
"""

import asyncio
import os
import uuid
from datetime import datetime, timedelta, timezone
from typing import cast
from unittest.mock import AsyncMock, patch

for key in ("SUPABASE_URL", "SUPABASE_KEY", "OPENAI_API_KEY"):
    os.environ.setdefault(key, "test")
os.environ.setdefault("NEGOTIATION_SHARE", "0")

from app.models.agent import AgentCreate, AgentSpecialty, AgentUpdate  # noqa: E402
from app.models.agent_decision import BidDecision  # noqa: E402
from app.models.auction import AuctionCreate, BidCreate  # noqa: E402
from app.models.job import JobCreate  # noqa: E402
from app.services.agent_intelligence import AgentIntelligenceService  # noqa: E402
from app.services.agent_service import AgentService  # noqa: E402
from app.services.auction_service import AuctionService  # noqa: E402
from app.services.database import DatabaseService  # noqa: E402
from app.services.experiment_service import score, summarize  # noqa: E402
from app.services.insights_service import agent_insights  # noqa: E402
from app.services.job_service import JobService  # noqa: E402
from tests.fake_db import FakeDB  # noqa: E402

ASK = "app.services.agent_intelligence.AgentIntelligenceService.ask_model"


async def new_agent(db, owner, name="Mine", specialty=AgentSpecialty.CODER, instructions="STRAT_A"):
    return await AgentService(db).create(AgentCreate(
        name=name, specialty=specialty, auction_instructions=instructions, user_id=owner,
    ))


async def closed_auction(db, rival_bids: list[tuple], budget=200, specialty=AgentSpecialty.CODER, minutes_ago=1):
    """A finished auction with the given (agent_id, amount) bids already in it."""
    fake = cast(FakeDB, db)
    job = await JobService(db).create(JobCreate(title="Build API", description="d", specialty=specialty, base_price=budget))
    auction = await AuctionService(db).create_auction(AuctionCreate(job_id=job.id))
    for agent_id, amount in rival_bids:
        fake.tables["bids"].append({"id": str(uuid.uuid4()), "auction_id": str(auction.id), "agent_id": str(agent_id),
                                    "amount": amount, "work_cost": 100, "created_at": "2026-01-01T00:00:00+00:00",
                                    "is_winning": False})
    row = next(a for a in fake.tables["auctions"] if a["id"] == str(auction.id))
    row.update({"status": "closed",
                "closed_at": (datetime.now(timezone.utc) - timedelta(minutes=minutes_ago)).isoformat()})
    return row


async def versions():
    db = cast(DatabaseService, FakeDB())
    fake = cast(FakeDB, db)
    service = AgentService(db)
    agent = await new_agent(db, uuid.uuid4())
    assert agent.strategy_version == 1 and len(fake.tables["strategy_versions"]) == 1

    agent = await service.update(agent.id, AgentUpdate(auction_instructions="STRAT_B"))
    assert agent.strategy_version == 2
    saved = await service.get_versions(agent.id)
    assert [v["version"] for v in saved] == [2, 1] and saved[0]["auction_instructions"] == "STRAT_B"

    # Renames, pauses and unchanged text are not new strategies
    await service.update(agent.id, AgentUpdate(name="Renamed", is_active=True))
    agent = await service.update(agent.id, AgentUpdate(auction_instructions="STRAT_B"))
    assert agent.strategy_version == 2 and len(fake.tables["strategy_versions"]) == 2
    agent = await service.update(agent.id, AgentUpdate(negotiation_style="Hold firm"))
    assert agent.strategy_version == 3

    # A live decision records the version that made it
    job = await JobService(db).create(JobCreate(title="t", description="d", specialty=AgentSpecialty.CODER, base_price=200))
    auction = await AuctionService(db).create_auction(AuctionCreate(job_id=job.id))
    with patch(ASK, AsyncMock(return_value=(BidDecision(bid_amount=150, reasoning="r"), "raw"))):
        await AgentIntelligenceService(db).execute_decision(agent.id, auction.id)
    assert fake.tables["agent_decisions"][0]["strategy_version"] == 3
    assert fake.tables["bids"][0]["amount"] == 150
    print("strategy versions: all checks passed")


def scoring():
    assert score(None, 100, [120], 200) == ("passed", None, 0)
    assert score(210, 100, [120], 200) == ("over_budget", None, 0)
    assert score(130, 100, [120], 200) == ("lost", None, 0)
    assert score(120, 100, [120], 200) == ("lost", None, 0)  # the rival bid earlier, so it wins the tie
    assert score(110, 100, [120, 150], 200) == ("won", 120, 20)  # paid the runner-up's bid
    assert score(90, 100, [95], 200) == ("won", 95, -5)  # a win can still lose credits
    assert score(110, 100, [], 200) == ("won", 110, 10)  # no rivals: paid its own bid
    assert score(110, 100, [120], 200, "first_price") == ("won", 110, 10)

    def row(bid_a, out_a, bid_b, out_b, profit_b):
        return {"work_cost": 100, "best_rival_bid": 130, "runs": {
            "a": {"bid": bid_a, "outcome": out_a, "profit": 0},
            "b": {"bid": bid_b, "outcome": out_b, "profit": profit_b}}}
    summary, why = summarize([row(180, "lost", 105, "won", 30)] * 3, {"a": "Version 1", "b": "Draft"})
    assert summary["b"]["wins"] == 3 and summary["b"]["profit"] == 90 and summary["a"]["avg_margin"] == 80.0
    assert summary["a"]["missed_profitable"] == 3
    assert why[0].startswith("Draft earned 90") and any("rivals undercut it" in w for w in why)
    print("experiment scoring: all checks passed")


async def insights():
    db = cast(DatabaseService, FakeDB())
    fake = cast(FakeDB, db)
    me = (await new_agent(db, uuid.uuid4())).id
    rival = (await new_agent(db, uuid.uuid4(), name="Rival")).id

    def decide(auction, version, bid=None):
        fake.tables.setdefault("agent_decisions", []).append({
            "id": str(uuid.uuid4()), "agent_id": str(me), "auction_id": auction["id"], "strategy_version": version,
            "decision_type": "bid" if bid else "pass", "bid_amount": bid, "reasoning": "r",
            "created_at": "2026-01-01T00:00:00+00:00"})
        if bid:
            fake.tables["bids"].append({"id": str(uuid.uuid4()), "auction_id": auction["id"], "agent_id": str(me),
                                        "amount": bid, "work_cost": 100, "created_at": "2026-01-01T00:00:00+00:00"})

    # Version 2: won 3 times at a 10% margin. Version 1: lost 3 times at 60%. One old pass from before versions.
    for minutes in (1, 2, 3):
        a = await closed_auction(db, [(rival, 150)], minutes_ago=minutes)
        a["winning_agent_id"] = str(me)
        decide(a, 2, 110)
    for minutes in (4, 5, 6):
        a = await closed_auction(db, [(rival, 120)], minutes_ago=minutes)
        a["winning_agent_id"] = str(rival)
        decide(a, 1, 160)
    decide(await closed_auction(db, [(rival, 120)], minutes_ago=7), None)
    # Open auctions don't count yet
    job = await JobService(db).create(JobCreate(title="t", description="d", specialty=AgentSpecialty.CODER, base_price=200))
    decide({"id": str((await AuctionService(db).create_auction(AuctionCreate(job_id=job.id))).id)}, 2, 50)
    # A finished negotiation where the agent walked away from a client who could pay above its cost
    fake.tables.setdefault("negotiations", []).append({
        "auction_id": fake.tables["auctions"][0]["id"], "agent_id": str(me), "status": "no_deal",
        "end_reason": "agent_walked", "opening_price": 150, "final_price": None, "client_max_price": 140, "work_cost": 100})

    result = await agent_insights(db, me)
    by = {v["version"]: v for v in result["per_version"]}
    assert [v["version"] for v in result["per_version"]] == [2, 1, None]
    assert by[2]["wins"] == 3 and by[2]["win_rate"] == 100.0 and by[2]["avg_margin"] == 10.0
    assert by[1]["wins"] == 0 and by[1]["avg_margin"] == 60.0
    assert by[None]["label"] == "Before version tracking" and by[None]["passes"] == 1
    assert by[2]["no_deals"] == 1
    assert len(result["trend"]) == 6 and result["trend"][-1]["won"] is True  # oldest first
    texts = " ".join(i["text"] for i in result["insights"])
    assert "6 bids and 1 passes across 7 finished auctions" in texts
    assert "Version 2 wins 100.0% of its bids, Version 1 won 0.0%" in texts
    assert "Walked away from 1 client" in texts
    assert {i["kind"] for i in result["insights"]} == {"fact", "read"}

    empty = await agent_insights(db, rival)
    assert empty["per_version"] == [] and "No finished auctions yet" in empty["insights"][0]["text"]
    print("insights: all checks passed")


def experiments_api():
    from fastapi.testclient import TestClient
    from app.auth import get_current_user_id
    from app.main import app
    from app.services.database import get_database_service

    db = cast(DatabaseService, FakeDB())
    fake = cast(FakeDB, db)
    owner, stranger = uuid.uuid4(), uuid.uuid4()

    async def setup():
        mine = await new_agent(db, owner)
        await AgentService(db).update(mine.id, AgentUpdate(auction_instructions="STRAT_B"))
        writer = await new_agent(db, owner, name="Writer", specialty=AgentSpecialty.WRITER)
        rival = await new_agent(db, uuid.uuid4(), name="Rival")
        for minutes in range(1, 4):
            await closed_auction(db, [(rival.id, 140)], minutes_ago=minutes)
        return mine, writer
    mine, writer = asyncio.run(setup())

    async def fake_model(self, prompt, name="agent"):
        # Strategy A bids high and loses to the rival's 140; B bids low and wins, paid 140
        bid = 190 if "STRAT_A" in prompt else 101
        return BidDecision(bid_amount=bid, reasoning=f"bid {bid}"), "raw"

    def credits():
        return next(a for a in fake.tables["agents"] if a["id"] == str(mine.id))["credits"]

    app.dependency_overrides[get_database_service] = lambda: db
    app.dependency_overrides[get_current_user_id] = lambda: owner
    client = TestClient(app)  # no "with": the game loop does not start
    base = f"/api/agents/{mine.id}"
    try:
        with patch(ASK, fake_model):
            r = client.post(f"{base}/experiments", json={"version_a": 1, "version_b": 2})
            assert r.status_code == 201, r.text
            body = r.json()
            summary = body["result"]["summary"]
            assert summary["a"]["wins"] == 0 and summary["b"]["wins"] == 3 and len(body["result"]["auctions"]) == 3
            assert summary["b"]["profit"] == sum(140 - row["work_cost"] for row in body["result"]["auctions"])
            assert body["credits_left"] == 980 and credits() == 980
            assert body["result"]["why"][0].startswith("Version 2 earned")

            r = client.post(f"{base}/experiments", json={"version_a": 2, "draft_instructions": "STRAT_A"})
            assert r.status_code == 201 and r.json()["result"]["summary"]["b"]["label"] == "Draft"
            assert credits() == 960
            assert [e["version_b"] for e in client.get(f"{base}/experiments").json()] == [None, 2]  # newest first

            # Bad requests cost nothing
            for bad in ({"version_a": 1}, {"version_a": 1, "version_b": 2, "draft_instructions": "x"},
                        {"version_a": 1, "version_b": 1}):
                assert client.post(f"{base}/experiments", json=bad).status_code == 422
            assert client.post(f"{base}/experiments", json={"version_a": 1, "version_b": 9}).status_code == 404
            # Nothing to replay in the writer's specialty: refunded
            r = client.post(f"/api/agents/{writer.id}/experiments", json={"version_a": 1, "draft_instructions": "x"})
            assert r.status_code == 409 and "refunded" in r.json()["detail"]
            assert next(a for a in fake.tables["agents"] if a["id"] == str(writer.id))["credits"] == 1000
            assert credits() == 960

        # The model fails every call: refunded
        with patch(ASK, AsyncMock(return_value=(None, None))):
            r = client.post(f"{base}/experiments", json={"version_a": 1, "version_b": 2})
            assert r.status_code == 502 and credits() == 960

        # Too few credits, then the daily cap
        next(a for a in fake.tables["agents"] if a["id"] == str(mine.id))["credits"] = 19
        assert client.post(f"{base}/experiments", json={"version_a": 1, "version_b": 2}).status_code == 409
        next(a for a in fake.tables["agents"] if a["id"] == str(mine.id))["credits"] = 500
        today = datetime.now(timezone.utc).date().isoformat()
        fake.ai_usage[(today, f"experiment:{owner}")] = 10
        assert client.post(f"{base}/experiments", json={"version_a": 1, "version_b": 2}).status_code == 429
        assert credits() == 500

        # The owner sees versions and insights; nobody else sees any of it
        assert [v["version"] for v in client.get(f"{base}/versions").json()] == [2, 1]
        assert client.get(f"{base}/intelligence").status_code == 200
        app.dependency_overrides[get_current_user_id] = lambda: stranger
        for method, path in (("get", "versions"), ("get", "intelligence"), ("get", "experiments"), ("post", "experiments")):
            kwargs = {"json": {"version_a": 1, "version_b": 2}} if method == "post" else {}
            r = getattr(client, method)(f"{base}/{path}", **kwargs)
            assert r.status_code == 403, f"{method} {path} must be owner-only, got {r.status_code}"
        assert client.get(f"/api/agents/{uuid.uuid4()}/intelligence").status_code == 404
        del app.dependency_overrides[get_current_user_id]
        assert client.get(f"{base}/intelligence").status_code == 401  # signed out
    finally:
        app.dependency_overrides.clear()
    print("experiments API: all checks passed")


if __name__ == "__main__":
    asyncio.run(versions())
    scoring()
    asyncio.run(insights())
    experiments_api()
