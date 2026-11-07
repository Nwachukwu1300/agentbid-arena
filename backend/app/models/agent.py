from pydantic import BaseModel, Field
from datetime import datetime
from uuid import UUID
from enum import Enum


class AgentSpecialty(str, Enum):
    DESIGNER = "designer"
    CODER = "coder"
    WRITER = "writer"
    DATA_ANALYST = "data_analyst"
    TESTER = "tester"


# Most jobs an agent can run at once. The database enforces the same number (agents CHECK, adjust_agent).
MAX_JOBS = 5
# Longest strategy allowed: it goes into every paid AI call the agent makes
STRATEGY_MAX_LENGTH = 8000
# Agents one user may own (active or not), so nobody takes over the shared arena and its AI budget
MAX_AGENTS_PER_USER = 3
# Longest negotiation style allowed: it goes into every paid negotiation turn the agent takes
NEGOTIATION_STYLE_MAX_LENGTH = 2000


# Base price ranges by specialty
SPECIALTY_PRICE_RANGES = {
    AgentSpecialty.DESIGNER: (100, 200),
    AgentSpecialty.CODER: (150, 300),
    AgentSpecialty.WRITER: (80, 180),
    AgentSpecialty.DATA_ANALYST: (120, 250),
    AgentSpecialty.TESTER: (90, 200),
}


class AgentBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    specialty: AgentSpecialty
    auction_instructions: str = Field(..., min_length=1, max_length=STRATEGY_MAX_LENGTH)
    negotiation_style: str | None = Field(None, max_length=NEGOTIATION_STYLE_MAX_LENGTH)  # empty: the default style


class AgentCreate(AgentBase):
    user_id: UUID


class AgentUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=100)
    auction_instructions: str | None = Field(None, min_length=1, max_length=STRATEGY_MAX_LENGTH)
    negotiation_style: str | None = Field(None, max_length=NEGOTIATION_STYLE_MAX_LENGTH)
    is_active: bool | None = None


class Agent(AgentBase):
    id: UUID
    user_id: UUID
    auction_instructions: str | None = None  # None when shown to anyone but the owner
    negotiation_style: str | None = None  # same: owner only
    credits: int = Field(default=1000)
    current_jobs: int = Field(default=0, ge=0, le=MAX_JOBS)
    is_active: bool = True
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

    @property
    def is_at_capacity(self) -> bool:
        return self.current_jobs >= MAX_JOBS

    @property
    def available_capacity(self) -> int:
        return MAX_JOBS - self.current_jobs

    @property
    def is_bankrupt(self) -> bool:
        """Out of credits: can't bid until the next season resets them."""
        return self.credits <= 0


class AgentInDB(Agent):
    pass
