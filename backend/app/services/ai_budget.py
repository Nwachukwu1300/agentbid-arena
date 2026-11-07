"""Daily caps on paid AI calls, so a busy arena or a single user can't run up a surprise bill.

Counts live in the database (ai_usage table, spend_ai_call function), so restarts don't reset them.
"""

import logging
from datetime import datetime, timezone

from app.config import get_settings
from app.services.database import DatabaseService

logger = logging.getLogger(__name__)


async def _spend(db: DatabaseService, key: str, limit: int, today: str | None) -> bool:
    try:
        result = await db.rpc("spend_ai_call", {
            "p_day": today or datetime.now(timezone.utc).date().isoformat(),
            "p_key": key,
            "p_limit": limit,
        }).execute()
        return bool(result.data)
    except Exception as e:
        # Fail closed: if usage can't be counted, don't spend money
        logger.error(f"AI budget check failed, refusing the call: {e}")
        return False


async def try_agent_call(db: DatabaseService, today: str | None = None) -> bool:
    """One agent decision. False once the arena-wide daily cap is used up."""
    return await _spend(db, "agents", get_settings().ai_daily_agent_calls, today)


async def try_negotiation_call(db: DatabaseService, today: str | None = None) -> bool:
    """One negotiation turn (client or agent). False once the arena-wide daily cap is used up."""
    return await _spend(db, "negotiation", get_settings().ai_daily_negotiation_calls, today)


async def try_builder_call(db: DatabaseService, user_id: str, today: str | None = None) -> bool:
    """One agent-builder call for this user. False once their daily cap is used up."""
    return await _spend(db, f"builder:{user_id}", get_settings().ai_daily_builder_calls_per_user, today)
