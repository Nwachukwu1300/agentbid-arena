from fastapi import APIRouter, HTTPException, Depends, Query
from uuid import UUID

from app.models.job import Job, JobStatus
from app.models.agent import AgentSpecialty
from app.services.database import DatabaseService, get_database_service
from app.services.job_service import JobService

router = APIRouter(prefix="/api/jobs", tags=["jobs"])


def get_job_service(db: DatabaseService = Depends(get_database_service)) -> JobService:
    return JobService(db)


@router.get("", response_model=list[Job])
async def list_jobs(
    status: JobStatus | None = Query(None),
    specialty: AgentSpecialty | None = Query(None),
    assigned_agent_id: UUID | None = Query(None),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    service: JobService = Depends(get_job_service),
) -> list[Job]:
    return await service.get_all(
        status=status,
        specialty=specialty,
        assigned_agent_id=assigned_agent_id,
        limit=limit,
        offset=offset,
    )


@router.get("/{job_id}", response_model=Job)
async def get_job(
    job_id: UUID,
    service: JobService = Depends(get_job_service),
) -> Job:
    job = await service.get_by_id(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@router.get("/agent/{agent_id}/active", response_model=list[Job])
async def get_active_jobs_for_agent(
    agent_id: UUID,
    service: JobService = Depends(get_job_service),
) -> list[Job]:
    return await service.get_active_jobs_for_agent(agent_id)
