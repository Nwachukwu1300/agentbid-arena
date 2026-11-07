from uuid import UUID
from datetime import datetime, timezone

from app.models.agent import AgentCreate, AgentUpdate, Agent, AgentSpecialty
from app.services.database import DatabaseService
from app.config import get_settings


class AgentService:
    def __init__(self, db: DatabaseService):
        self.db = db
        self.table = db.table("agents")
        self.settings = get_settings()

    async def create(self, agent_data: AgentCreate) -> Agent:
        now = datetime.now(timezone.utc).isoformat()
        data = {
            "user_id": str(agent_data.user_id),
            "name": agent_data.name,
            "specialty": agent_data.specialty.value,
            "auction_instructions": agent_data.auction_instructions,
            "negotiation_style": agent_data.negotiation_style,
            "credits": self.settings.default_agent_credits,
            "current_jobs": 0,
            "is_active": True,
            "created_at": now,
            "updated_at": now,
        }

        result = await self.table.insert(data).execute()
        agent = self._to_agent(result.data[0])
        await self._save_version(agent.id, 1, agent_data.auction_instructions, agent_data.negotiation_style)
        return agent

    async def get_by_id(self, agent_id: UUID) -> Agent | None:
        result = await self.table.select("*").eq("id", str(agent_id)).execute()
        if not result.data:
            return None
        return self._to_agent(result.data[0])

    async def get_by_user_id(self, user_id: UUID) -> list[Agent]:
        result = await self.table.select("*").eq("user_id", str(user_id)).order("created_at", desc=True).execute()
        return [self._to_agent(row) for row in result.data]

    async def get_all(
        self,
        specialty: AgentSpecialty | None = None,
        is_active: bool | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> list[Agent]:
        query = self.table.select("*")

        if specialty is not None:
            query = query.eq("specialty", specialty.value)
        if is_active is not None:
            query = query.eq("is_active", is_active)

        result = await query.order("created_at", desc=True).range(offset, offset + limit - 1).execute()
        return [self._to_agent(row) for row in result.data]

    async def update(self, agent_id: UUID, agent_data: AgentUpdate) -> Agent | None:
        existing = await self.get_by_id(agent_id)
        if not existing:
            return None

        update_data = agent_data.model_dump(exclude_unset=True)
        if not update_data:
            return existing

        update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
        strategy_changed = any(
            key in update_data and update_data[key] != getattr(existing, key)
            for key in ("auction_instructions", "negotiation_style")
        )
        if strategy_changed:
            update_data["strategy_version"] = existing.strategy_version + 1

        result = await self.table.update(update_data).eq("id", str(agent_id)).execute()
        if not result.data:
            return None
        agent = self._to_agent(result.data[0])
        if strategy_changed:
            # shortcut: the agent row and its version row are two writes; a crash between them loses one version's text
            await self._save_version(agent.id, agent.strategy_version, agent.auction_instructions, agent.negotiation_style)
        return agent

    async def _save_version(self, agent_id, version: int, auction_instructions, negotiation_style) -> None:
        await self.db.table("strategy_versions").insert({
            "agent_id": str(agent_id),
            "version": version,
            "auction_instructions": auction_instructions,
            "negotiation_style": negotiation_style,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }).execute()

    async def get_versions(self, agent_id) -> list[dict]:
        """Every strategy version of an agent, newest first. Owner-only data."""
        return (await self.db.table("strategy_versions").select("*").eq("agent_id", str(agent_id)).order(
            "version", desc=True
        ).execute()).data

    async def delete(self, agent_id: UUID) -> bool:
        result = await self.table.delete().eq("id", str(agent_id)).execute()
        return len(result.data) > 0

    async def adjust(self, agent_id: UUID, credits: int = 0, jobs: int = 0) -> Agent | None:
        """Add to credits and job count in one database statement (adjust_agent), so concurrent game
        loops can't overwrite each other. None if the agent is missing or jobs would pass capacity."""
        result = await self.db.rpc("adjust_agent", {
            "p_agent_id": str(agent_id), "p_credits": credits, "p_jobs": jobs,
        }).execute()
        return self._to_agent(result.data[0]) if result.data else None

    def _to_agent(self, data: dict) -> Agent:
        return Agent(
            id=data["id"],
            user_id=data["user_id"],
            name=data["name"],
            specialty=AgentSpecialty(data["specialty"]),
            auction_instructions=data["auction_instructions"],
            negotiation_style=data.get("negotiation_style"),
            credits=data["credits"],
            current_jobs=data["current_jobs"],
            is_active=data["is_active"],
            strategy_version=data.get("strategy_version") or 1,
            created_at=data["created_at"],
            updated_at=data["updated_at"],
        )
