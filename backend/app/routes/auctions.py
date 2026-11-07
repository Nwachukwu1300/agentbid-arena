from fastapi import APIRouter, HTTPException, Depends, Query
from uuid import UUID

from app.models.auction import (
    AuctionStatus,
    AuctionWithJob,
)
from app.models.agent import AgentSpecialty
from app.services.database import DatabaseService, get_database_service
from app.services.auction_service import AuctionService
from app.services.decision_service import DecisionService

router = APIRouter(prefix="/api/auctions", tags=["auctions"])


def get_auction_service(
    db: DatabaseService = Depends(get_database_service),
) -> AuctionService:
    return AuctionService(db)


@router.get("", response_model=list[AuctionWithJob])
async def list_active_auctions(
    specialty: AgentSpecialty | None = Query(None),
    status: AuctionStatus = Query(AuctionStatus.ACTIVE),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    service: AuctionService = Depends(get_auction_service),
) -> list[AuctionWithJob]:
    """Auctions with job details. status=closed lists recent results."""
    auctions = await service.get_active_auctions(
        specialty=specialty,
        limit=limit,
        offset=offset,
        status=status,
    )
    return [a.public_view() for a in auctions]


@router.get("/{auction_id}", response_model=AuctionWithJob)
async def get_auction(
    auction_id: UUID,
    service: AuctionService = Depends(get_auction_service),
) -> AuctionWithJob:
    """Get auction details including job info and bid stats."""
    auction = await service.get_auction_with_job(auction_id)
    if not auction:
        raise HTTPException(status_code=404, detail="Auction not found")
    return auction.public_view()


@router.get("/{auction_id}/breakdown")
async def get_auction_breakdown(
    auction_id: UUID,
    db: DatabaseService = Depends(get_database_service),
) -> dict:
    """The auction, every agent decision with reasoning, and why each agent won or lost."""
    breakdown = await DecisionService(db).auction_breakdown(auction_id)
    if not breakdown:
        raise HTTPException(status_code=404, detail="Auction not found")
    return breakdown
