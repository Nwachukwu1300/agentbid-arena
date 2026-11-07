"""In-memory fake of the supabase-py client, for tests and the negotiation simulator. No env side effects."""

import uuid
from types import SimpleNamespace


class FakeQuery:
    """Supports the subset of the supabase-py query builder these services use."""

    def __init__(self, rows: list[dict], action: str, payload: dict | list[dict]):
        self.rows, self.action, self.payload = rows, action, payload
        self.filters, self.orders, self.bounds = [], [], None

    def eq(self, col, val):
        self.filters.append(lambda r: str(r.get(col)) == str(val))
        return self

    def gte(self, col, val):
        self.filters.append(lambda r: r.get(col) is not None and r[col] >= val)
        return self

    def neq(self, col, val):
        self.filters.append(lambda r: str(r.get(col)) != str(val))
        return self

    def lt(self, col, val):
        self.filters.append(lambda r: r.get(col) is not None and r[col] < val)
        return self

    def in_(self, col, vals):
        vals = {str(v) for v in vals}
        self.filters.append(lambda r: str(r.get(col)) in vals)
        return self

    def order(self, col, desc=False):
        self.orders.append((col, desc))
        return self

    def range(self, start, end):
        self.bounds = (start, end)
        return self

    async def execute(self):  # the real client is async
        if self.action == "insert":
            payload = self.payload if isinstance(self.payload, list) else [self.payload]
            new_rows = [{"id": str(uuid.uuid4()), **row} for row in payload]
            self.rows.extend(new_rows)
            return SimpleNamespace(data=new_rows, count=len(new_rows))
        matched = [r for r in self.rows if all(f(r) for f in self.filters)]
        if self.action == "update":
            for r in matched:
                r.update(self.payload)
            return SimpleNamespace(data=matched, count=len(matched))
        for col, desc in reversed(self.orders):  # stable sort: last key first
            matched.sort(key=lambda r: r[col], reverse=desc)
        if self.bounds:
            matched = matched[self.bounds[0] : self.bounds[1] + 1]
        return SimpleNamespace(data=[dict(r) for r in matched], count=len(matched))


class FakeTable:
    """Like supabase-py, each select/insert/update starts a fresh query."""

    def __init__(self, rows: list[dict]):
        self.rows = rows

    def select(self, *_args, **_kwargs):
        return FakeQuery(self.rows, "select", {})

    def insert(self, data: dict | list[dict]):
        return FakeQuery(self.rows, "insert", data)

    def update(self, data: dict):
        return FakeQuery(self.rows, "update", data)


class FakeRPC:
    def __init__(self, result):
        self.result = result

    async def execute(self):
        return SimpleNamespace(data=self.result)


class FakeDB:
    def __init__(self):
        self.tables: dict[str, list[dict]] = {}
        self.ai_usage: dict[tuple[str, str], int] = {}

    def table(self, name):
        return FakeTable(self.tables.setdefault(name, []))

    def rpc(self, fn, params):
        if fn == "adjust_agent":  # mirrors the adjust_agent function in schema.sql
            rows = [r for r in self.tables.get("agents", []) if r["id"] == params["p_agent_id"]
                    and r["current_jobs"] + params["p_jobs"] <= 5]
            for r in rows:
                r["credits"] += params["p_credits"]
                r["current_jobs"] = max(r["current_jobs"] + params["p_jobs"], 0)
            return FakeRPC([dict(r) for r in rows])
        assert fn == "spend_ai_call"
        key = (params["p_day"], params["p_key"])
        if params["p_limit"] <= 0 or self.ai_usage.get(key, 0) >= params["p_limit"]:
            return FakeRPC(False)
        self.ai_usage[key] = self.ai_usage.get(key, 0) + 1
        return FakeRPC(True)
