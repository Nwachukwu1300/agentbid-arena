"""Intelligence: insights about one agent's own play, for its owner only.

Built from data the game already stores (decisions, bids, auctions, jobs, negotiations). Each sentence is
tagged "fact" (what the data shows) or "read" (our interpretation of it).
"""

from collections import defaultdict

from app.services.database import DatabaseService


def _pct(part: int, whole: int) -> float | None:
    return round(part / whole * 100, 1) if whole else None


def _label(version: int | None) -> str:
    return f"Version {version}" if version else "Before version tracking"


async def agent_insights(db: DatabaseService, agent_id) -> dict:
    agent_id = str(agent_id)
    decisions = (await db.table("agent_decisions").select(
        "auction_id, decision_type, bid_amount, strategy_version, created_at"
    ).eq("agent_id", agent_id).execute()).data
    auction_ids = list({d["auction_id"] for d in decisions})
    auctions = {
        a["id"]: a for a in ((await db.table("auctions").select("id, job_id, status, winning_agent_id, closed_at").in_(
            "id", auction_ids
        ).execute()).data if auction_ids else [])
    }
    # Only finished auctions count: open ones have no outcome yet
    decisions = [d for d in decisions if auctions.get(d["auction_id"], {}).get("status") in ("closed", "cancelled")]
    version_of = {d["auction_id"]: d["strategy_version"] for d in decisions}

    bids = {
        b["auction_id"]: b for b in (await db.table("bids").select("auction_id, amount, work_cost").eq(
            "agent_id", agent_id
        ).execute()).data
    }
    won_jobs = {a["job_id"]: a["id"] for a in auctions.values() if str(a.get("winning_agent_id")) == agent_id}
    jobs = (await db.table("jobs").select("id, status, winning_bid, work_cost").in_(
        "id", list(won_jobs)
    ).execute()).data if won_jobs else []
    negotiations = [n for n in (await db.table("negotiations").select(
        "auction_id, status, end_reason, opening_price, final_price, client_max_price, work_cost"
    ).eq("agent_id", agent_id).execute()).data if n["status"] != "active"]  # the client's limit is secret until it ends

    groups: dict = defaultdict(lambda: defaultdict(int))
    margins: dict = defaultdict(list)
    gains: dict = defaultdict(list)
    trend = []
    below_cost = 0
    for d in sorted(decisions, key=lambda d: auctions[d["auction_id"]]["closed_at"] or ""):
        g, v = groups[d["strategy_version"]], d["strategy_version"]
        g["decisions"] += 1
        bid = bids.get(d["auction_id"])
        if d["decision_type"] != "bid" or not bid:
            g["passes"] += 1  # includes bids the game rejected
            continue
        g["bids"] += 1
        won = str(auctions[d["auction_id"]].get("winning_agent_id")) == agent_id
        g["wins"] += won
        if bid.get("work_cost"):
            margin = bid["amount"] / bid["work_cost"] - 1
            margins[v].append(margin)
            below_cost += bid["amount"] < bid["work_cost"]
            trend.append({"at": auctions[d["auction_id"]]["closed_at"], "margin": round(margin * 100, 1),
                          "won": won, "version": v})
    for job in jobs:
        if job["status"] == "completed" and job.get("work_cost") is not None:
            g = groups[version_of.get(won_jobs[job["id"]])]
            g["completed"] += 1
            g["profit"] += (job["winning_bid"] or 0) - job["work_cost"]
    walked_with_room, left_on_table, deals_below_max = 0, 0, 0
    for n in negotiations:
        g = groups[version_of.get(n["auction_id"])]
        if n["status"] == "deal":
            g["deals"] += 1
            gains[version_of.get(n["auction_id"])].append(n["final_price"] - n["opening_price"])
            if n["final_price"] < n["client_max_price"]:
                deals_below_max += 1
                left_on_table += n["client_max_price"] - n["final_price"]
        else:
            g["no_deals"] += 1
            if n["end_reason"] == "agent_walked" and n["client_max_price"] > n["work_cost"]:
                walked_with_room += 1

    per_version = []
    for v in sorted(groups, key=lambda v: v or 0, reverse=True):  # newest first, untracked last
        g = groups[v]
        per_version.append({
            "version": v,
            "label": _label(v),
            "decisions": g["decisions"],
            "bids": g["bids"],
            "passes": g["passes"],
            "pass_rate": _pct(g["passes"], g["decisions"]),
            "wins": g["wins"],
            "win_rate": _pct(g["wins"], g["bids"]),
            "avg_margin": round(sum(margins[v]) / len(margins[v]) * 100, 1) if margins[v] else None,
            "completed_jobs": g["completed"],
            "profit": g["profit"],
            "deals": g["deals"],
            "no_deals": g["no_deals"],
            "avg_negotiation_gain": round(sum(gains[v]) / len(gains[v]), 1) if gains[v] else None,
        })

    return {
        "per_version": per_version,
        "trend": trend,
        "insights": _insights(per_version, len(decisions), below_cost, walked_with_room, left_on_table, deals_below_max),
    }


def _insights(per_version: list[dict], finished: int, below_cost: int, walked_with_room: int,
              left_on_table: int, deals_below_max: int) -> list[dict]:
    if not finished:
        return [{"kind": "fact", "text": "No finished auctions yet. Insights appear once your agent has bid in a few."}]
    fact = lambda text: {"kind": "fact", "text": text}  # noqa: E731
    read = lambda text: {"kind": "read", "text": text}  # noqa: E731
    bids = sum(v["bids"] for v in per_version)
    passes = sum(v["passes"] for v in per_version)
    wins = sum(v["wins"] for v in per_version)
    win_rate = _pct(wins, bids) or 0
    out = [fact(f"{bids} bids and {passes} passes across {finished} finished auctions. "
                f"Won {wins} of those bids ({win_rate}%).")]

    all_margins = [(v["avg_margin"], v["bids"]) for v in per_version if v["avg_margin"] is not None]
    if all_margins:
        margin = round(sum(m * n for m, n in all_margins) / sum(n for _, n in all_margins), 1)
        out.append(fact(f"Bids averaged {margin}% above work cost."))
        if margin >= 30 and win_rate < 25:
            out.append(read("Bids sit well above cost and rivals undercut you often. Under second price you are paid "
                            "the runner-up's bid anyway, so bidding closer to cost would win more jobs."))
        elif margin <= 8 and win_rate >= 40:
            out.append(read("You bid close to cost, so you win often. Your profit comes from the runner-up's bid, "
                            "not your own, which is how second price is meant to be played."))
    if below_cost:
        out.append(fact(f"{below_cost} bid(s) were below your own work cost, which loses credits when they win."))
    if passes / finished >= 0.5 and finished >= 5:
        out.append(read("Your agent passes on most jobs. If that isn't the plan, loosen the conditions in its "
                        "strategy for when to bid."))

    tracked = [v for v in per_version if v["version"] and v["bids"] >= 3]
    if len(tracked) >= 2:
        new, old = tracked[0], tracked[1]
        out.append(fact(f"{new['label']} wins {new['win_rate']}% of its bids, {old['label']} won {old['win_rate']}%."))
        if abs((new["win_rate"] or 0) - (old["win_rate"] or 0)) >= 15:
            better, worse = (new, old) if (new["win_rate"] or 0) > (old["win_rate"] or 0) else (old, new)
            out.append(read(f"{better['label']} is winning clearly more often than {worse['label']}."))

    if walked_with_room:
        out.append(fact(f"Walked away from {walked_with_room} client(s) who could have paid more than your cost."))
        out.append(read("A softer walk-away rule in the negotiation style could turn those into deals."))
    if deals_below_max:
        out.append(fact(f"Left {left_on_table} credits on the table across {deals_below_max} deal(s): "
                        "those clients would have paid more."))
    if finished < 10:
        out.append(read(f"Based on only {finished} auctions, so treat these as early signs."))
    return out
