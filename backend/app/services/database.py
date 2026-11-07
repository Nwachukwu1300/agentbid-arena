import asyncio

from supabase import AsyncClient, AsyncClientOptions, acreate_client

from app.config import get_settings


class DatabaseService:
    def __init__(self, client: AsyncClient):
        self.client = client

    def table(self, table_name: str):
        return self.client.table(table_name)

    def rpc(self, fn: str, params: dict):
        return self.client.rpc(fn, params)

    @property
    def auth(self):
        return self.client.auth


# One client per event loop: the API server and the game loop run their own loops, and an async
# client's connections belong to the loop that created them.
_clients: dict[asyncio.AbstractEventLoop, AsyncClient] = {}


async def get_supabase_client() -> AsyncClient:
    """Async Supabase client using the service role key (bypasses RLS), falling back to the anon key."""
    loop = asyncio.get_running_loop()
    client = _clients.get(loop)
    if client is None:
        settings = get_settings()
        key = settings.supabase_service_role_key or settings.supabase_key
        # Timeout so a dropped connection (e.g. the machine sleeping) fails fast instead of hanging forever
        client = await acreate_client(
            settings.supabase_url, key, options=AsyncClientOptions(postgrest_client_timeout=10)
        )
        _clients[loop] = client
    return client


async def fetch_all(make_query, page: int = 1000) -> list[dict]:
    """Every row of a query. Supabase returns at most 1000 rows per request, so a single read silently truncates.

    make_query builds a fresh, stably ordered query each call (a query builder can only run once).
    """
    rows: list[dict] = []
    while True:
        batch = (await make_query().range(len(rows), len(rows) + page - 1).execute()).data
        rows.extend(batch)
        if len(batch) < page:
            return rows


async def get_database_service() -> DatabaseService:
    return DatabaseService(await get_supabase_client())
