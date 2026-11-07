"""Owner-only views of an agent: strategy versions, Intelligence insights and Experiments."""

import logging
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, model_validator

from app.auth import get_current_user_id
from app.config import get_settings
from app.models.agent import Agent, STRATEGY_MAX_LENGTH
from app.services import ai_budget, experiment_service
from app.services.agent_service import AgentService
from app.services.database import DatabaseService, get_database_service
from app.services.insights_service import agent_insights

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/agents", tags=["intelligence"])


async def _own_agent(agent_id: UUID, user_id: UUID, db: DatabaseService) -> Agent:
    agent = await AgentService(db).get_by_id(agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    if agent.user_id != user_id:
        raise HTTPException(status_code=403, detail="Only the agent's owner can see this")
    return agent


@router.get("/{agent_id}/versions")
async def list_versions(
    agent_id: UUID,
    db: DatabaseService = Depends(get_database_service),
    user_id: UUID = Depends(get_current_user_id),
) -> list[dict]:
    await _own_agent(agent_id, user_id, db)
    return await AgentService(db).get_versions(agent_id)


@router.get("/{agent_id}/intelligence")
async def get_intelligence(
    agent_id: UUID,
    db: DatabaseService = Depends(get_database_service),
    user_id: UUID = Depends(get_current_user_id),
) -> dict:
    await _own_agent(agent_id, user_id, db)
    return await agent_insights(db, agent_id)


@router.get("/{agent_id}/experiments")
async def list_experiments(
    agent_id: UUID,
    db: DatabaseService = Depends(get_database_service),
    user_id: UUID = Depends(get_current_user_id),
) -> list[dict]:
    await _own_agent(agent_id, user_id, db)
    return (await db.table("experiments").select("*").eq("agent_id", str(agent_id)).order(
        "created_at", desc=True
    ).range(0, 19).execute()).data


class ExperimentRequest(BaseModel):
    version_a: int = Field(..., ge=1)
    version_b: int | None = Field(None, ge=1)  # a saved version...
    draft_instructions: str | None = Field(None, min_length=1, max_length=STRATEGY_MAX_LENGTH)  # ...or an unsaved draft

    @model_validator(mode="after")
    def one_challenger(self):
        if (self.version_b is None) == (self.draft_instructions is None):
            raise ValueError("Give either version_b or draft_instructions")
        if self.version_b == self.version_a:
            raise ValueError("Pick two different versions")
        return self


@router.post("/{agent_id}/experiments", status_code=201)
async def run_experiment(
    agent_id: UUID,
    body: ExperimentRequest,
    db: DatabaseService = Depends(get_database_service),
    user_id: UUID = Depends(get_current_user_id),
) -> dict:
    settings = get_settings()
    agent = await _own_agent(agent_id, user_id, db)
    service = AgentService(db)

    versions = {v["version"]: v for v in await service.get_versions(agent_id)}
    if body.version_a not in versions or (body.version_b is not None and body.version_b not in versions):
        raise HTTPException(status_code=404, detail="Strategy version not found for this agent")
    strategies = {"a": (f"Version {body.version_a}", versions[body.version_a]["auction_instructions"])}
    strategies["b"] = (
        (f"Version {body.version_b}", versions[body.version_b]["auction_instructions"])
        if body.version_b is not None else ("Draft", body.draft_instructions)
    )

    cost = settings.experiment_cost
    # shortcut: two runs at once can both pass this check, add a DB guard if it matters
    if agent.credits < cost:
        raise HTTPException(status_code=409, detail=f"An experiment costs {cost} credits and {agent.name} has {agent.credits}.")
    if not await ai_budget.try_experiment(db, str(user_id)):
        raise HTTPException(status_code=429, detail="Daily experiment limit reached. Try again tomorrow.")
    if not await service.adjust(agent_id, credits=-cost):
        raise HTTPException(status_code=404, detail="Agent not found")

    try:
        result = await experiment_service.run(db, agent, strategies, settings.experiment_auctions)
    except Exception as e:
        await service.adjust(agent_id, credits=cost)  # refund: the run produced nothing
        if isinstance(e, experiment_service.NoAuctionsToReplay):
            raise HTTPException(status_code=409, detail=f"{e} Your credits were refunded.")
        logger.error(f"Experiment for agent {agent_id} failed: {e!r}")
        raise HTTPException(status_code=502, detail="The experiment couldn't run. Your credits were refunded.")

    row = (await db.table("experiments").insert({
        "agent_id": str(agent_id),
        "version_a": body.version_a,
        "version_b": body.version_b,
        "draft_instructions": body.draft_instructions,
        "cost": cost,
        "result": result,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }).execute()).data[0]
    return {**row, "credits_left": agent.credits - cost}
