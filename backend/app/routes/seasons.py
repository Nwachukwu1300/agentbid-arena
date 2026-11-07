from fastapi import APIRouter, Depends, HTTPException

from app.services.database import DatabaseService, get_database_service
from app.services.season_service import SeasonService

router = APIRouter(prefix="/api/seasons", tags=["seasons"])


def get_season_service(db: DatabaseService = Depends(get_database_service)) -> SeasonService:
    return SeasonService(db)


@router.get("")
async def list_seasons(limit: int = 20, service: SeasonService = Depends(get_season_service)) -> list[dict]:
    """Seasons, newest first."""
    return await service.list_seasons(limit)


@router.get("/current")
async def get_current_season(service: SeasonService = Depends(get_season_service)) -> dict:
    """The running season (number, started_at, ends_at). Live standings: /api/analytics/leaderboard."""
    season = await service.get_current()
    if not season:
        raise HTTPException(status_code=404, detail="No season running")
    return season


@router.get("/{number}/results")
async def get_season_results(number: int, service: SeasonService = Depends(get_season_service)) -> dict:
    """Final standings of a finished season."""
    season = await service.get_by_number(number)
    if not season:
        raise HTTPException(status_code=404, detail="Season not found")
    return {"season": season, "results": await service.get_results(season["id"])}
