from uuid import UUID
from datetime import datetime, timezone

from app.models.job import JobCreate, JobUpdate, Job, JobStatus
from app.models.agent import AgentSpecialty
from app.services.database import DatabaseService


class JobService:
    def __init__(self, db: DatabaseService):
        self.db = db
        self.table = db.table("jobs")

    async def create(self, job_data: JobCreate) -> Job:
        now = datetime.now(timezone.utc).isoformat()
        data = {
            "title": job_data.title,
            "description": job_data.description,
            "specialty": job_data.specialty.value,
            "base_price": job_data.base_price,
            "status": JobStatus.PENDING.value,
            "assigned_agent_id": None,
            "winning_bid": None,
            "created_at": now,
            "completed_at": None,
        }

        result = await self.table.insert(data).execute()
        return self._to_job(result.data[0])

    async def get_by_id(self, job_id: UUID) -> Job | None:
        result = await self.table.select("*").eq("id", str(job_id)).execute()
        if not result.data:
            return None
        return self._to_job(result.data[0])

    async def get_all(
        self,
        status: JobStatus | None = None,
        specialty: AgentSpecialty | None = None,
        assigned_agent_id: UUID | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> list[Job]:
        query = self.table.select("*")

        if status is not None:
            query = query.eq("status", status.value)
        if specialty is not None:
            query = query.eq("specialty", specialty.value)
        if assigned_agent_id is not None:
            query = query.eq("assigned_agent_id", str(assigned_agent_id))

        result = await query.order("created_at", desc=True).range(offset, offset + limit - 1).execute()
        return [self._to_job(row) for row in result.data]

    async def update(self, job_id: UUID, job_data: JobUpdate) -> Job | None:
        existing = await self.get_by_id(job_id)
        if not existing:
            return None

        update_data = {}

        if job_data.title is not None:
            update_data["title"] = job_data.title
        if job_data.description is not None:
            update_data["description"] = job_data.description
        if job_data.status is not None:
            update_data["status"] = job_data.status.value
        if job_data.assigned_agent_id is not None:
            update_data["assigned_agent_id"] = str(job_data.assigned_agent_id)
        if job_data.winning_bid is not None:
            update_data["winning_bid"] = job_data.winning_bid

        if not update_data:
            return existing

        result = await self.table.update(update_data).eq("id", str(job_id)).execute()
        if not result.data:
            return None
        return self._to_job(result.data[0])

    async def assign_to_agent(
        self,
        job_id: UUID,
        agent_id: UUID,
        winning_bid: int,
        work_cost: int | None = None,
    ) -> Job | None:
        result = await self.table.update({
            "assigned_agent_id": str(agent_id),
            "winning_bid": winning_bid,
            "work_cost": work_cost,
            # Work starts as soon as the job is won (a negotiation, if any, moves this to the deal)
            "status": JobStatus.IN_PROGRESS.value,
            "started_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", str(job_id)).execute()

        if not result.data:
            return None
        return self._to_job(result.data[0])

    async def complete_job(self, job_id: UUID) -> Job | None:
        """Mark a running job completed. None if it was already completed, so it is only ever paid once."""
        result = await self.table.update({
            "status": JobStatus.COMPLETED.value,
            "completed_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", str(job_id)).eq("status", JobStatus.IN_PROGRESS.value).execute()

        if not result.data:
            return None
        return self._to_job(result.data[0])

    async def start_auction(self, job_id: UUID) -> Job | None:
        result = await self.table.update({
            "status": JobStatus.IN_AUCTION.value,
        }).eq("id", str(job_id)).execute()

        if not result.data:
            return None
        return self._to_job(result.data[0])

    async def get_active_jobs_for_agent(self, agent_id: UUID) -> list[Job]:
        result = await self.table.select("*").eq(
            "assigned_agent_id", str(agent_id)
        ).in_(
            "status", [JobStatus.ASSIGNED.value, JobStatus.IN_PROGRESS.value]
        ).execute()
        return [self._to_job(row) for row in result.data]

    def _to_job(self, data: dict) -> Job:
        return Job(
            id=data["id"],
            title=data["title"],
            description=data["description"],
            specialty=AgentSpecialty(data["specialty"]),
            base_price=data["base_price"],
            status=JobStatus(data["status"]),
            assigned_agent_id=data.get("assigned_agent_id"),
            winning_bid=data.get("winning_bid"),
            work_cost=data.get("work_cost"),
            negotiated=data.get("negotiated") or False,
            started_at=data.get("started_at"),
            created_at=data["created_at"],
            completed_at=data.get("completed_at"),
        )
