import asyncio
import threading
import logging
from datetime import datetime, timezone

from app.services.database import get_database_service
from app.services.job_service import JobService
from app.services.auction_service import AuctionService
from app.services.agent_service import AgentService
from app.services.agent_intelligence import AgentIntelligenceService
from app.services.job_templates import generate_job
from app.services.season_service import SeasonService
from app.services.negotiation_service import NegotiationService
from app.services.event_manager import get_event_manager
from app.models.job import JobCreate
from app.models.auction import AuctionCreate
from app.models.agent_decision import DecisionType
from app.config import get_settings

logger = logging.getLogger(__name__)


class JobSpawner:
    """Background service that spawns jobs and manages auction lifecycle."""

    def __init__(self):
        self.settings = get_settings()
        self._running = False
        self._thread: threading.Thread | None = None
        self._loop: asyncio.AbstractEventLoop | None = None
        self._tasks: list[asyncio.Task] = []
        # Season rollover pays all running jobs then resets credits and job counts; no payout or new job may land in between
        self._payout_lock = asyncio.Lock()

    async def start(self):
        """Run the game loop on its own thread with its own event loop.

        Agent decisions make slow, blocking AI and database calls; on the API's event loop they
        froze every request (and the whole server when a connection hung).
        """
        if self._running:
            return
        self._running = True
        logger.info("Starting JobSpawner background tasks")
        self._thread = threading.Thread(target=self._run_thread, name="game-loop", daemon=True)
        self._thread.start()

    def _run_thread(self):
        self._loop = asyncio.new_event_loop()
        asyncio.set_event_loop(self._loop)
        try:
            self._loop.run_until_complete(self._run())
        finally:
            self._loop.close()

    async def _run(self):
        # Make sure a season is running before agents start earning
        try:
            await self._check_season()
        except Exception as e:
            logger.error(f"Error starting season: {e!r}")

        self._tasks = [
            asyncio.create_task(loop())
            for loop in (
                self._job_spawn_loop,
                self._auction_close_loop,
                self._job_completion_loop,
                self._agent_bidding_loop,
                self._season_loop,
                self._negotiation_loop,
            )
        ]
        await asyncio.gather(*self._tasks, return_exceptions=True)

    async def stop(self):
        """Stop the game loop and wait (briefly) for its thread to finish."""
        self._running = False
        logger.info("Stopping JobSpawner background tasks")
        if self._loop and self._loop.is_running():
            self._loop.call_soon_threadsafe(lambda: [task.cancel() for task in self._tasks])
        if self._thread:
            # A call already in flight finishes first (bounded by the client timeouts)
            await asyncio.to_thread(self._thread.join, 35)

    async def _job_spawn_loop(self):
        """Spawn a new job every 30 seconds and start an auction."""
        while self._running:
            try:
                await self._spawn_job_and_auction()
            except Exception as e:
                logger.error(f"Error spawning job: {e!r}")

            await asyncio.sleep(self.settings.job_spawn_interval_seconds)

    async def _spawn_job_and_auction(self):
        """Create a new job from template and start its auction."""
        db = await get_database_service()
        job_service = JobService(db)
        auction_service = AuctionService(db)

        # Generate random job from templates
        job_data = generate_job()
        job_create = JobCreate(
            title=job_data["title"],
            description=job_data["description"],
            specialty=job_data["specialty"],
            base_price=job_data["base_price"],
        )

        # Create the job
        job = await job_service.create(job_create)
        logger.info(f"Spawned new job: {job.title} ({job.specialty.value}) - ${job.base_price}")

        # Start auction for the job
        auction_create = AuctionCreate(job_id=job.id)
        auction = await auction_service.create_auction(auction_create)
        logger.info(f"Started auction {auction.id} for job {job.id}, ends at {auction.ends_at}")

        return auction

    async def _auction_close_loop(self):
        """Check for and close expired auctions every 5 seconds."""
        while self._running:
            try:
                async with self._payout_lock:  # no job is assigned while a season rolls over
                    await self._close_expired_auctions()
            except Exception as e:
                logger.error(f"Error closing auctions: {e!r}")

            await asyncio.sleep(5)

    async def _close_expired_auctions(self):
        """Find and close all auctions that have passed their end time."""
        db = await get_database_service()
        auction_service = AuctionService(db)

        expired = await auction_service.get_expired_auctions()
        for auction in expired:
            try:
                result = await auction_service.close_auction(auction.id)
                if result.winner_agent_id:
                    logger.info(
                        f"Auction {auction.id} closed: winner {result.winner_agent_name} "
                        f"with bid ${result.winning_bid}, paid ${result.price_paid}"
                    )
                else:
                    logger.info(f"Auction {auction.id} cancelled: no bids")
            except Exception as e:
                logger.error(f"Error closing auction {auction.id}: {e!r}")

    async def _job_completion_loop(self):
        """Check for and complete jobs after their duration expires."""
        while self._running:
            try:
                async with self._payout_lock:
                    await self._complete_expired_jobs()
            except Exception as e:
                logger.error(f"Error completing jobs: {e!r}")

            await asyncio.sleep(10)

    async def _complete_expired_jobs(self, settle_all: bool = False):
        """Complete jobs that have been in progress long enough (or all of them at season end)."""
        db = await get_database_service()
        job_service = JobService(db)
        agent_service = AgentService(db)
        auction_service = AuctionService(db)

        # Get all in-progress jobs
        from app.models.job import JobStatus
        jobs = await job_service.get_all(status=JobStatus.IN_PROGRESS, limit=500)

        now = datetime.now(timezone.utc)
        completion_duration = self.settings.job_completion_duration_seconds
        # Work starts when the job is won or its negotiation reaches a deal; older jobs fall back to
        # their auction's close time, then to created_at
        close_times = await auction_service.get_close_times([job.id for job in jobs if not job.started_at])

        for job in jobs:
            job_started = job.started_at or close_times.get(job.id, job.created_at)
            if job_started.tzinfo is None:
                job_started = job_started.replace(tzinfo=timezone.utc)

            elapsed = (now - job_started).total_seconds()

            if settle_all or elapsed >= completion_duration:
                try:
                    # Complete the job
                    completed_job = await job_service.complete_job(job.id)
                    if completed_job and completed_job.assigned_agent_id:
                        # Paid the bid, minus what the work cost (can be a loss)
                        cost = completed_job.work_cost or self.settings.work_cost(completed_job.base_price)
                        profit = (completed_job.winning_bid or 0) - cost
                        # Pay and free the job slot in one step
                        await agent_service.adjust(completed_job.assigned_agent_id, credits=profit, jobs=-1)
                        logger.info(f"Job {job.id} completed, agent profit {profit}")
                except Exception as e:
                    logger.error(f"Error completing job {job.id}: {e!r}")


    async def _negotiation_loop(self):
        """Take the next turn in every negotiation that is due (paced by next_turn_at)."""
        while self._running:
            try:
                # AI calls run outside the lock; each turn's result is applied under it
                await NegotiationService(await get_database_service()).advance_due(self._payout_lock)
            except Exception as e:
                logger.error(f"Error in negotiation loop: {e!r}")
            await asyncio.sleep(1)

    async def _season_loop(self):
        """Roll over to a new season when the current one ends."""
        while self._running:
            await asyncio.sleep(10)
            try:
                await self._check_season()
            except Exception as e:
                logger.error(f"Error in season loop: {e!r}")

    async def _check_season(self):
        """Start a season if none is running; finish and replace an expired one."""
        seasons = SeasonService(await get_database_service())
        current = await seasons.get_current()
        if current and datetime.fromisoformat(current["ends_at"]) > datetime.now(timezone.utc):
            return

        async with self._payout_lock:
            # Open negotiations end with no deal (slots released), then running work is paid out
            # so it counts toward the season it was won in
            await NegotiationService(await get_database_service()).end_all_for_season()
            await self._complete_expired_jobs(settle_all=True)
            if current:
                standings = await seasons.finish(current)
                await get_event_manager().publish_season_ended(current["number"], standings)
                logger.info(f"Season {current['number']} finished")
            new_season = await seasons.start_next()
        logger.info(f"Season {new_season['number']} started, ends at {new_season['ends_at']}")

    async def _agent_bidding_loop(self):
        """Trigger agents to bid on active auctions every 10 seconds."""
        while self._running:
            try:
                await self._trigger_agent_bids()
            except Exception as e:
                logger.error(f"Error in agent bidding loop: {e!r}")

            await asyncio.sleep(10)  # Check every 10 seconds

    async def _trigger_agent_bids(self):
        """Trigger all eligible agents to bid on all active auctions."""
        db = await get_database_service()
        auction_service = AuctionService(db)
        intelligence_service = AgentIntelligenceService(db)

        # Get all active auctions
        active_auctions = await auction_service.get_active_auctions(limit=20)

        for auction in active_auctions:
            # Only trigger bidding if auction has more than 15 seconds remaining
            if auction.time_remaining_seconds < 15:
                continue

            try:
                # Trigger agents matching the job specialty to make decisions
                decisions = await intelligence_service.trigger_all_agents_for_auction(
                    auction.id,
                    specialty_match_only=True,
                )
                bid_count = sum(1 for d in decisions if d.decision_type == DecisionType.BID)
                if bid_count > 0:
                    logger.info(
                        f"Auction {auction.id} ({auction.job_title}): "
                        f"{bid_count}/{len(decisions)} agents placed bids"
                    )
            except Exception as e:
                logger.error(f"Error triggering bids for auction {auction.id}: {e!r}")


# Global spawner instance
_spawner: JobSpawner | None = None


def get_job_spawner() -> JobSpawner:
    global _spawner
    if _spawner is None:
        _spawner = JobSpawner()
    return _spawner
