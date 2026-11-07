from pydantic import BaseModel, Field
from datetime import datetime
from uuid import UUID
from enum import Enum

from .agent import AgentSpecialty


class AuctionStatus(str, Enum):
    ACTIVE = "active"
    CLOSED = "closed"
    CANCELLED = "cancelled"


class AuctionBase(BaseModel):
    job_id: UUID
    duration_seconds: int = Field(..., ge=60, le=900)  # 1-15 minutes allowed


class AuctionCreate(BaseModel):
    job_id: UUID
    duration_seconds: int | None = None  # If None, random between 90-120


class Auction(AuctionBase):
    id: UUID
    status: AuctionStatus = AuctionStatus.ACTIVE
    winning_bid_id: UUID | None = None
    winning_agent_id: UUID | None = None
    winning_amount: int | None = None
    started_at: datetime
    ends_at: datetime
    closed_at: datetime | None = None

    class Config:
        from_attributes = True

    @property
    def is_active(self) -> bool:
        return self.status == AuctionStatus.ACTIVE

    @property
    def time_remaining_seconds(self) -> float:
        if self.status != AuctionStatus.ACTIVE:
            return 0
        remaining = (self.ends_at - datetime.now(self.ends_at.tzinfo)).total_seconds()
        return max(0, remaining)


class AuctionWithJob(Auction):
    job_title: str
    job_description: str
    job_specialty: AgentSpecialty
    job_base_price: int
    job_status: str | None = None  # e.g. "negotiating", "unfilled"
    negotiated: bool = False  # the winner had to negotiate the price with the client
    deal_price: int | None = None  # the agreed price, once a negotiation reached a deal
    price_paid: int | None = None  # what the winner is paid: the runner-up's bid, or its own if it was alone
    bid_count: int = 0
    lowest_bid: int | None = None
    leading_agent_id: UUID | None = None
    winning_agent_name: str | None = None

    def public_view(self) -> "AuctionWithJob":
        """Bids are sealed: hide the lead from everyone until the auction closes."""
        if self.status != AuctionStatus.ACTIVE:
            return self
        return self.model_copy(update={"lowest_bid": None, "leading_agent_id": None})


class BidBase(BaseModel):
    auction_id: UUID
    agent_id: UUID
    amount: int = Field(..., gt=0)


class BidCreate(BidBase):
    pass


class Bid(BidBase):
    id: UUID
    created_at: datetime
    is_winning: bool = False
    work_cost: int | None = None  # bidder's cost when it bid (None on bids from before sealed auctions)

    class Config:
        from_attributes = True


class AuctionResult(BaseModel):
    auction_id: UUID
    job_id: UUID
    winner_agent_id: UUID | None
    winner_agent_name: str | None
    winning_bid: int | None
    price_paid: int | None = None  # second price: the runner-up's bid, or the winner's own if it was alone
    total_bids: int
    status: AuctionStatus
