import asyncio
import json
import signal
import threading
from datetime import datetime, timezone
from typing import AsyncGenerator

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse

from app.services.event_manager import EventManager, get_event_manager

router = APIRouter(prefix="/api/events", tags=["events"])


# Set when the server is told to stop, so open live feeds end and the server can shut down.
shutting_down = threading.Event()


def end_feeds_on_shutdown_signal() -> None:
    """Uvicorn waits for open connections to close before it shuts down, and a live feed never closes
    on its own, so a connected browser kept the server from stopping. Uvicorn installs its signal
    handlers before the app loads, so wrap them at app startup (call from the lifespan)."""
    if threading.current_thread() is not threading.main_thread():
        return  # signal handlers can only be changed from the main thread
    for sig in (signal.SIGINT, signal.SIGTERM):
        previous = signal.getsignal(sig)

        def handler(signum, frame, previous=previous):
            shutting_down.set()
            if callable(previous):
                previous(signum, frame)

        signal.signal(sig, handler)


PING_SECONDS = 15  # the browser treats ~45s of silence as a dead connection and reconnects


async def event_generator(
    event_manager: EventManager,
) -> AsyncGenerator[str, None]:
    """Generate SSE events from the event queue, with a heartbeat, until the client or server goes away."""
    queue: asyncio.Queue = asyncio.Queue(maxsize=200)  # a stalled client drops events instead of growing memory
    await event_manager.subscribe(queue)

    try:
        yield format_sse_event("connected", {"status": "connected", "timestamp": datetime.now(timezone.utc).isoformat()})

        idle = 0.0
        while not shutting_down.is_set():
            try:
                # Short waits so a shutdown is noticed within a second
                event = await asyncio.wait_for(queue.get(), timeout=1.0)
                yield format_sse_event(event["type"], event["data"])
                idle = 0.0
            except asyncio.TimeoutError:
                idle += 1.0
                if idle >= PING_SECONDS:
                    # A named event (not a comment) so the browser can see the connection is alive
                    yield format_sse_event("ping", {})
                    idle = 0.0
    except asyncio.CancelledError:
        pass
    finally:
        await event_manager.unsubscribe(queue)


def format_sse_event(event_type: str, data: dict) -> str:
    """Format an event for SSE."""
    json_data = json.dumps(data, default=str)
    return f"event: {event_type}\ndata: {json_data}\n\n"


@router.get("/stream")
async def event_stream(
    event_manager: EventManager = Depends(get_event_manager),
):
    """
    Server-Sent Events endpoint for real-time updates.

    Events include:
    - auction_created: New auction started
    - bid_placed: Agent placed a bid (includes reasoning)
    - auction_closed: Auction ended with results
    - agent_decision: Agent made a decision
    """
    return StreamingResponse(
        event_generator(event_manager),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # Disable buffering for nginx
        },
    )
