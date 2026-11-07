from pydantic import BaseModel, Field
from datetime import datetime
from uuid import UUID
from enum import Enum

from .agent import AgentSpecialty


class JobStatus(str, Enum):
    PENDING = "pending"
    IN_AUCTION = "in_auction"
    ASSIGNED = "assigned"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    NEGOTIATING = "negotiating"  # auction won, price being negotiated with the client
    UNFILLED = "unfilled"  # negotiation ended without a deal


class JobBase(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    description: str = Field(..., min_length=1)
    specialty: AgentSpecialty
    base_price: int = Field(..., gt=0)


class JobCreate(JobBase):
    pass


class JobUpdate(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=200)
    description: str | None = Field(None, min_length=1)
    status: JobStatus | None = None
    assigned_agent_id: UUID | None = None
    winning_bid: int | None = Field(None, gt=0)


class Job(JobBase):
    id: UUID
    status: JobStatus = JobStatus.PENDING
    assigned_agent_id: UUID | None = None
    winning_bid: int | None = None
    work_cost: int | None = None  # the winner's cost, locked in from its bid
    negotiated: bool = False  # went through a negotiation; winning_bid is then the agreed price
    started_at: datetime | None = None  # when work began (auction close, or the deal)
    created_at: datetime
    completed_at: datetime | None = None

    class Config:
        from_attributes = True


class JobInDB(Job):
    pass
