import asyncio
import threading
from datetime import datetime, timezone
from uuid import UUID


class EventManager:
    """Manages SSE event broadcasting to connected clients.

    Subscribers live on the API server's event loop; events are published from the game loop's
    own thread, so each event is handed to the subscriber's loop thread-safely.
    """

    def __init__(self):
        self._subscribers: dict[asyncio.Queue, asyncio.AbstractEventLoop] = {}
        self._lock = threading.Lock()

    async def subscribe(self, queue: asyncio.Queue) -> None:
        """Add a subscriber queue (owned by the calling event loop)."""
        with self._lock:
            self._subscribers[queue] = asyncio.get_running_loop()

    async def unsubscribe(self, queue: asyncio.Queue) -> None:
        """Remove a subscriber queue."""
        with self._lock:
            self._subscribers.pop(queue, None)

    async def publish(self, event_type: str, data: dict) -> None:
        """Publish an event to all subscribers."""
        event = {
            "type": event_type,
            "data": {
                **data,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            },
        }

        with self._lock:
            subscribers = list(self._subscribers.items())
        for queue, loop in subscribers:
            try:
                loop.call_soon_threadsafe(_offer, queue, event)
            except RuntimeError:
                pass  # that subscriber's loop has shut down

    async def publish_auction_created(
        self,
        auction_id: UUID,
        job_title: str,
        job_specialty: str,
        job_base_price: int,
        ends_at: str,
    ) -> None:
        """Publish auction created event."""
        await self.publish("auction_created", {
            "auction_id": str(auction_id),
            "job_title": job_title,
            "job_specialty": job_specialty,
            "job_base_price": job_base_price,
            "ends_at": ends_at,
        })

    async def publish_bid_placed(
        self,
        auction_id: UUID,
        bid_id: UUID,
        agent_id: UUID,
        agent_name: str,
        agent_specialty: str,
    ) -> None:
        """Publish that an agent submitted a sealed bid (amount stays hidden until close)."""
        await self.publish("bid_placed", {
            "auction_id": str(auction_id),
            "bid_id": str(bid_id),
            "agent_id": str(agent_id),
            "agent_name": agent_name,
            "agent_specialty": agent_specialty,
        })

    async def publish_auction_closed(
        self,
        auction_id: UUID,
        job_id: UUID,
        job_title: str,
        winner_agent_id: UUID | None,
        winner_agent_name: str | None,
        winning_bid: int | None,
        total_bids: int,
        status: str,
        price_paid: int | None = None,
    ) -> None:
        """Publish auction closed event."""
        await self.publish("auction_closed", {
            "auction_id": str(auction_id),
            "job_id": str(job_id),
            "job_title": job_title,
            "winner_agent_id": str(winner_agent_id) if winner_agent_id else None,
            "winner_agent_name": winner_agent_name,
            "winning_bid": winning_bid,
            "price_paid": price_paid,  # second price: what the winner will be paid
            "total_bids": total_bids,
            "status": status,
        })

    async def publish_season_ended(self, number: int, standings: list[dict]) -> None:
        """Publish the final top of a finished season."""
        await self.publish("season_ended", {
            "season_number": number,
            "winner_agent_name": standings[0]["agent_name"] if standings else None,
            "winner_credits": standings[0]["credits"] if standings else None,
            "top3": standings[:3],
        })

    @property
    def subscriber_count(self) -> int:
        """Get the number of active subscribers."""
        return len(self._subscribers)


def _offer(queue: asyncio.Queue, event: dict) -> None:
    try:
        queue.put_nowait(event)
    except asyncio.QueueFull:
        pass  # client not consuming fast enough


# Singleton instance
_event_manager: EventManager | None = None


def get_event_manager() -> EventManager:
    """Get the singleton event manager instance."""
    global _event_manager
    if _event_manager is None:
        _event_manager = EventManager()
    return _event_manager
