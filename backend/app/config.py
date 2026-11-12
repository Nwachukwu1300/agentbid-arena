import hashlib
import hmac

from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # Supabase Configuration
    supabase_url: str
    supabase_key: str
    supabase_service_role_key: str | None = None

    # OpenAI Configuration
    openai_api_key: str
    openai_model: str = "gpt-4o-mini"  # Cost-effective for agent decisions
    openai_max_tokens: int = 256
    openai_temperature: float = 0.7  # Some creativity in reasoning

    # Application Settings
    app_name: str = "AgentBid"
    debug: bool = False
    # Comma-separated frontend URLs allowed to call the API from a browser
    cors_origins: str = "http://localhost:3000,http://localhost:5173"

    # Agent Defaults
    default_agent_credits: int = 1000

    # Job Settings
    job_completion_duration_seconds: int = 300  # 5 minutes

    # Auction Settings
    auction_min_duration_seconds: int = 90
    auction_max_duration_seconds: int = 120
    job_spawn_interval_seconds: int = 30

    # Arena economy
    work_cost_ratio: float = 0.5  # delivering a job costs this share of its budget...
    workload_cost_step: float = 0.10  # ...plus this much more per job the agent is already running
    # Each agent's cost for each job varies by up to this much either way, known only to that agent. Without it
    # every rival has the same cost, so everyone bids cost + 1 and wins pay almost nothing.
    private_cost_spread: float = 0.2
    # Key for private costs. IDs are public, so an unkeyed hash would let anyone compute rivals' costs.
    # Falls back to the OpenAI key, which is already a server-only secret.
    private_cost_secret: str | None = None
    # "second_price": the winner is paid the runner-up's bid (steady profits, bidding your cost is best).
    # "first_price": the winner is paid its own bid, with no "minimum profitable bid" hint (bidding is a gamble).
    payment_rule: str = "second_price"
    # The game's own agents (scripts/seed_agents.py) belong to this user. They are not a player trying to inflate
    # a price, so the same-owner rule for the second price doesn't apply to them.
    house_user_id: str = "00000000-0000-0000-0000-000000000001"
    season_duration_seconds: int = 3600
    season_cycle_length: int = 20  # the shown season count restarts at 1 after this many

    # Daily caps on paid AI calls
    ai_daily_agent_calls: int = 3000  # whole arena; agents pass once it is reached
    ai_daily_builder_calls_per_user: int = 30
    ai_daily_negotiation_calls: int = 2000  # whole arena; winners keep their bid once it is reached
    ai_daily_experiments_per_user: int = 10  # each run makes about 2 x experiment_auctions AI calls

    # Experiments: replay strategy versions on recent closed auctions (never part of live play)
    experiment_cost: int = 20  # season credits taken from the agent per run
    experiment_auctions: int = 10  # closed auctions replayed per run

    # Negotiation after the auction (all tunables in one place)
    negotiation_share: float = 0.3  # chance a winning bid goes to a negotiation with the client
    # Client's secret top price is drawn between these shares of the budget. The low end sits below most agents'
    # costs (40-60% of budget), so some clients can't afford the job and walking away is the right call.
    client_max_low_ratio: float = 0.45
    client_max_high_ratio: float = 1.2
    agent_max_offer_ratio: float = 2.0  # agents can't ask more than this share of the budget
    negotiation_max_turns: int = 6  # messages in total, client first
    negotiation_turn_interval_seconds: int = 4  # pacing, so people can watch live
    negotiation_max_message_chars: int = 400
    no_deal_penalty: int = 0  # credits lost when the agent walks away or turns run out

    def work_cost(self, base_price: int, jobs_running: int = 0, agent_id=None, auction_id=None) -> int:
        """Credits it costs this agent to deliver a job. Winner's profit = bid - work cost.

        With agent_id and auction_id, includes that agent's private cost factor for that auction.
        """
        factor = self.private_cost_factor(agent_id, auction_id) if agent_id and auction_id else 1.0
        return round(base_price * self.work_cost_ratio * (1 + self.workload_cost_step * jobs_running) * factor)

    def private_cost_factor(self, agent_id, auction_id) -> float:
        """Stable per agent and auction, between 1 - spread and 1 + spread, so the prompt, the stored bid and
        the explanations all agree without storing it."""
        key = (self.private_cost_secret or self.openai_api_key).encode()
        digest = hmac.new(key, f"{agent_id}:{auction_id}".encode(), hashlib.sha256).digest()
        unit = int.from_bytes(digest[:8], "big") / 2**64  # uniform in [0, 1)
        return 1 + self.private_cost_spread * (2 * unit - 1)

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache
def get_settings() -> Settings:
    return Settings()
