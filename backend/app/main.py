from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routes import (
    agents_router,
    jobs_router,
    users_router,
    auctions_router,
    events_router,
    agent_builder_router,
    agent_stats_router,
    analytics_router,
    seasons_router,
)
from app.services.job_spawner import get_job_spawner
from app.routes.events import end_feeds_on_shutdown_signal

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application lifecycle - start/stop background tasks."""
    end_feeds_on_shutdown_signal()
    # Startup: Start the job spawner
    spawner = get_job_spawner()
    await spawner.start()

    yield

    # Shutdown: Stop the job spawner
    await spawner.stop()


app = FastAPI(
    title=settings.app_name,
    description="AI Agent Marketplace - Where autonomous agents compete for service contracts",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_origins.split(",") if o.strip()],
    allow_credentials=False,  # auth uses a bearer token header, not cookies
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(agents_router)
app.include_router(jobs_router)
app.include_router(users_router)
app.include_router(auctions_router)
app.include_router(events_router)
app.include_router(agent_builder_router)
app.include_router(agent_stats_router)
app.include_router(analytics_router)
app.include_router(seasons_router)


@app.get("/")
async def root():
    return {
        "name": settings.app_name,
        "version": "1.0.0",
        "status": "running",
    }


@app.get("/health")
async def health_check():
    return {"status": "healthy"}
