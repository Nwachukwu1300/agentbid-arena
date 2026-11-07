// Agent types
export type AgentSpecialty = 'designer' | 'coder' | 'writer' | 'data_analyst' | 'tester';

export interface Agent {
  id: string;
  user_id: string;
  name: string;
  specialty: AgentSpecialty;
  auction_instructions: string | null; // null for anyone but the owner
  negotiation_style: string | null; // null for anyone but the owner (and when unset: the default style is used)
  credits: number;
  current_jobs: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AgentStats {
  agent_id: string;
  total_earnings: number;
  jobs_won: number;
  jobs_completed: number;
  win_rate: number;
  active_bids: number;
  total_bids: number;
  avg_bid_amount: number;
  deals: number;
  no_deals: number;
  walk_aways: number;
  avg_negotiation_gain: number | null; // average agreed price minus opening bid
}

// Mirrors AgentFullStats in backend/app/routes/agent_stats.py
export interface AgentFullStats extends AgentStats {
  // amount is the price paid (the agreed price after a negotiation), null when the negotiation failed
  recent_wins: { auction_id: string; amount: number | null; job_status: string | null; closed_at: string; job_title: string; specialty: string }[];
  specialty_breakdown: Record<string, number>;
}

// Auction types
export type AuctionStatus = 'active' | 'closed' | 'cancelled';

export interface Auction {
  id: string;
  job_id: string;
  duration_seconds: number;
  status: AuctionStatus;
  winning_bid_id: string | null;
  winning_agent_id: string | null;
  winning_amount: number | null;
  started_at: string;
  ends_at: string;
  closed_at: string | null;
}

export interface AuctionWithJob extends Auction {
  job_title: string;
  job_description: string;
  job_specialty: AgentSpecialty;
  job_base_price: number;
  job_status: string | null; // e.g. 'negotiating', 'unfilled'
  negotiated: boolean;
  deal_price: number | null; // agreed price when a negotiation reached a deal
  price_paid: number | null; // second price: the runner-up's bid, or the winner's own if it was alone
  bid_count: number;
  lowest_bid: number | null;
  leading_agent_id: string | null;
  winning_agent_name: string | null;
}

// Why agents won or lost (mirrors backend/app/services/decision_service.py)
export type DecisionKind = 'bid' | 'pass';

export interface DecisionEntry {
  id: string;
  agent_id: string;
  auction_id: string;
  decision_type: DecisionKind;
  bid_amount: number | null;
  reasoning: string;
  created_at: string;
  agent_name: string;
  agent_specialty: AgentSpecialty | null;
}

export type AgentOutcomeKind = 'won' | 'lost' | 'sealed' | 'passed' | 'no_winner';

export interface AgentOutcome {
  agent_id: string;
  agent_name: string;
  specialty: AgentSpecialty | null;
  best_bid: number | null;
  work_cost: number | null;
  last_reasoning: string | null;
  outcome: AgentOutcomeKind;
  explanation: string;
}

export interface NegotiationMessage {
  speaker: 'client' | 'agent';
  turn_number: number;
  message: string;
  offer: number | null;
  action: 'counter' | 'accept' | 'walk_away';
  was_fallback: boolean;
  created_at: string;
}

// Mirrors public_negotiation in backend/app/services/negotiation_service.py
export interface Negotiation {
  id: string;
  agent_id: string | null;
  opening_price: number;
  work_cost: number;
  status: 'active' | 'deal' | 'no_deal';
  end_reason: 'accepted' | 'agent_walked' | 'client_walked' | 'max_turns' | 'season_ended' | null;
  final_price: number | null;
  turn_count: number;
  messages: NegotiationMessage[];
  // Revealed only after the negotiation ends
  client_max_price?: number;
  client_personality?: string;
  explanation?: string;
}

export interface AuctionBreakdown {
  auction: AuctionWithJob;
  work_cost: number;
  decisions: DecisionEntry[];
  agents: AgentOutcome[];
  negotiation: Negotiation | null; // only when the winner had to negotiate
}

export interface AgentDecisionHistoryItem {
  id: string;
  auction_id: string;
  decision_type: DecisionKind;
  bid_amount: number | null;
  reasoning: string;
  created_at: string;
  job_title: string;
  job_specialty: AgentSpecialty | null;
  auction_status: AuctionStatus | null;
  winning_amount: number | null;
  outcome: 'won' | 'lost' | 'open' | 'no_winner';
}

export interface Bid {
  id: string;
  auction_id: string;
  agent_id: string;
  amount: number;
  created_at: string;
  is_winning: boolean;
}

export interface AuctionResult {
  auction_id: string;
  job_id: string;
  winner_agent_id: string | null;
  winner_agent_name: string | null;
  winning_bid: number | null;
  total_bids: number;
  status: AuctionStatus;
}

// Job types
export type JobStatus = 'pending' | 'in_auction' | 'assigned' | 'in_progress' | 'completed';

export interface Job {
  id: string;
  title: string;
  description: string;
  specialty: AgentSpecialty;
  base_price: number;
  status: JobStatus;
  assigned_agent_id: string | null;
  winning_bid: number | null;
  created_at: string;
  completed_at: string | null;
}

// SSE Event types
export type SSEEventType =
  | 'auction_created'
  | 'bid_placed'
  | 'auction_closed'
  | 'season_ended'
  | 'agent_decision'
  | 'negotiation_started'
  | 'negotiation_message'
  | 'negotiation_ended';

export interface SSEEvent {
  type: SSEEventType;
  data: unknown;
  timestamp: string;
}

export interface AuctionClosedEvent {
  result: AuctionResult;
}

// Activity feed item
export interface ActivityItem {
  id: string;
  type: SSEEventType;
  title: string;
  description: string;
  agent_name?: string;
  agent_specialty?: AgentSpecialty;
  amount?: number;
  auction_id?: string;
  timestamp: string;
}

// Stats for dashboard
// Mirrors backend/app/routes/analytics.py
export interface MarketStats {
  total_volume: number;
  avg_winning_bid: number;
  active_agents: number;
  jobs_completed: number; // auctions closed with a winner
  active_auctions: number;
}

export interface SpecialtyShare {
  specialty: AgentSpecialty;
  value: number;
  percentage: number;
}

export interface TrendPoint {
  date: string;
  value: number | null; // null: nothing happened that day
}

export interface LeaderboardEntry {
  rank: number;
  agent_id: string;
  agent_name: string;
  specialty: AgentSpecialty;
  credits: number;
  profit: number;
  jobs_won: number;
  win_rate: number;
  bankrupt: boolean;
  avg_negotiation_gain: number | null; // "best negotiator": average gain over the opening bid
}

// A finished season's frozen standings (mirrors backend season_results)
export interface SeasonResult {
  rank: number;
  agent_id: string | null;
  agent_name: string;
  specialty: AgentSpecialty;
  final_credits: number;
  profit: number;
}

export interface Season {
  id: string;
  number: number;
  status: 'active' | 'finished';
  started_at: string;
  ends_at: string;
}
