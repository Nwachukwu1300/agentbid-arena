from fastapi import APIRouter, HTTPException, Depends, Query
from uuid import UUID

from app.models.agent import Agent, AgentBase, PublicAgent, AgentCreate, AgentUpdate, AgentSpecialty, MAX_AGENTS_PER_USER
from app.services.database import DatabaseService, get_database_service
from app.services.agent_service import AgentService
from app.auth import get_current_user_id, get_optional_user_id

router = APIRouter(prefix="/api/agents", tags=["agents"])


def get_agent_service(db: DatabaseService = Depends(get_database_service)) -> AgentService:
    return AgentService(db)


def for_viewer(agent: Agent, viewer_id: UUID | None) -> Agent | PublicAgent:
    """Strategies are a competitive secret: only the owner sees the bidding strategy, negotiation style and owner id."""
    if viewer_id == agent.user_id:
        return agent
    return PublicAgent(**agent.model_dump(exclude={"user_id", "auction_instructions", "negotiation_style"}))


# =============================================================================
# PUBLIC ENDPOINTS (No authentication required)
# =============================================================================

@router.get("", response_model=list[PublicAgent])
async def list_agents(
    specialty: AgentSpecialty | None = Query(None),
    is_active: bool | None = Query(None),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    service: AgentService = Depends(get_agent_service),
    viewer_id: UUID | None = Depends(get_optional_user_id),
) -> list[Agent]:
    """List all agents in the marketplace (public; strategies only for their owner)."""
    agents = await service.get_all(
        specialty=specialty,
        is_active=is_active,
        limit=limit,
        offset=offset,
    )
    return [for_viewer(a, viewer_id) for a in agents]


@router.get("/{agent_id}", response_model=PublicAgent)
async def get_agent(
    agent_id: UUID,
    service: AgentService = Depends(get_agent_service),
    viewer_id: UUID | None = Depends(get_optional_user_id),
) -> Agent:
    """Get a single agent by ID (public; strategy only for its owner)."""
    agent = await service.get_by_id(agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    return for_viewer(agent, viewer_id)


# =============================================================================
# AUTHENTICATED ENDPOINTS (Require valid JWT token)
# =============================================================================

@router.get("/my/agents", response_model=list[Agent])
async def get_my_agents(
    include_inactive: bool = Query(False, description="Include paused/inactive agents"),
    service: AgentService = Depends(get_agent_service),
    current_user_id: UUID = Depends(get_current_user_id),
) -> list[Agent]:
    """
    Get current user's agents only (authenticated endpoint).
    Used for the user's personal dashboard.
    """
    agents = await service.get_by_user_id(current_user_id)
    if not include_inactive:
        agents = [a for a in agents if a.is_active]
    return agents


@router.post("", response_model=Agent, status_code=201)
async def create_agent(
    agent_data: AgentBase,
    service: AgentService = Depends(get_agent_service),
    current_user_id: UUID = Depends(get_current_user_id),
) -> Agent:
    """
    Create a new agent for the current user (authenticated endpoint).
    The user_id is automatically set to the authenticated user.
    """
    # shortcut: two simultaneous creates can both pass this check; fine for a soft cap, use a DB trigger if it must be exact
    if len(await service.get_by_user_id(current_user_id)) >= MAX_AGENTS_PER_USER:
        raise HTTPException(status_code=409, detail=f"You can have at most {MAX_AGENTS_PER_USER} agents. Delete one to make room.")

    # The body carries no user_id: the owner is always the authenticated user
    return await service.create(AgentCreate(**agent_data.model_dump(), user_id=current_user_id))


@router.put("/{agent_id}", response_model=Agent)
async def update_agent(
    agent_id: UUID,
    agent_data: AgentUpdate,
    service: AgentService = Depends(get_agent_service),
    current_user_id: UUID = Depends(get_current_user_id),
) -> Agent:
    """
    Update an agent (authenticated endpoint).
    Users can only update their own agents.
    """
    # Check ownership
    agent = await service.get_by_id(agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    if agent.user_id != current_user_id:
        raise HTTPException(status_code=403, detail="You don't have permission to update this agent")

    updated_agent = await service.update(agent_id, agent_data)
    if not updated_agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    return updated_agent


@router.delete("/{agent_id}", status_code=204)
async def delete_agent(
    agent_id: UUID,
    service: AgentService = Depends(get_agent_service),
    current_user_id: UUID = Depends(get_current_user_id),
) -> None:
    """
    Delete an agent (authenticated endpoint).
    Users can only delete their own agents.
    """
    # Check ownership
    agent = await service.get_by_id(agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    if agent.user_id != current_user_id:
        raise HTTPException(status_code=403, detail="You don't have permission to delete this agent")
    if agent.current_jobs > 0:
        # Deleting now would orphan running jobs and open negotiations, and silently drop their payouts
        raise HTTPException(status_code=409, detail=(
            f"This agent still has {agent.current_jobs} job(s) running or in negotiation. "
            "Pause it, and delete it once its work is done."
        ))

    deleted = await service.delete(agent_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Agent not found")


@router.post("/{agent_id}/toggle-active", response_model=Agent)
async def toggle_agent_active(
    agent_id: UUID,
    service: AgentService = Depends(get_agent_service),
    current_user_id: UUID = Depends(get_current_user_id),
) -> Agent:
    """
    Toggle an agent's active status (pause/resume).
    Users can only toggle their own agents.
    """
    agent = await service.get_by_id(agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    if agent.user_id != current_user_id:
        raise HTTPException(status_code=403, detail="You don't have permission to modify this agent")

    update_data = AgentUpdate(is_active=not agent.is_active)
    updated_agent = await service.update(agent_id, update_data)
    if not updated_agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    return updated_agent


# =============================================================================
# ADMIN/INTERNAL ENDPOINTS (Should be protected in production)
# =============================================================================
