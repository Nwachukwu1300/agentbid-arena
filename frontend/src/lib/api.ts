import { supabase } from './supabase';
import type {
  Agent,
  AuctionWithJob,
  AuctionBreakdown,
  AgentDecisionHistoryItem,
  AuctionStatus,
  AgentSpecialty,
  AgentStats,
  AgentFullStats,
  MarketStats,
  LeaderboardEntry,
  Season,
  SeasonResult,
  SpecialtyShare,
  TrendPoint,
} from '@/types';

// Empty in local development (the Vite proxy forwards /api); set VITE_API_URL when the backend is hosted separately
export const API_BASE = `${(import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '')}/api`;

// Get current access token from Supabase session
async function getAuthToken(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

// Base fetch with optional authentication
async function fetchAPI<T>(
  endpoint: string,
  options?: RequestInit & { requireAuth?: boolean }
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options?.headers as Record<string, string>),
  };

  // Add auth token if available or required
  if (options?.requireAuth !== false) {
    const token = await getAuthToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    } else if (options?.requireAuth) {
      throw new Error('Authentication required');
    }
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
    // FastAPI validation errors (422) send a list like [{ loc: [..., 'field'], msg }]
    const detail = Array.isArray(error.detail)
      ? error.detail.map((e: { loc?: unknown[]; msg?: string }) => `${e.loc?.[e.loc.length - 1] ?? 'input'}: ${e.msg}`).join('; ')
      : error.detail;
    throw new Error(detail || `HTTP error ${response.status}`);
  }

  // Handle 204 No Content
  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}

// =============================================================================
// AGENTS API
// =============================================================================

export const agentsAPI = {
  // Public: List all agents (marketplace view)
  list: (params?: { specialty?: AgentSpecialty; is_active?: boolean; limit?: number; offset?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.specialty) searchParams.set('specialty', params.specialty);
    if (params?.is_active !== undefined) searchParams.set('is_active', String(params.is_active));
    if (params?.limit) searchParams.set('limit', String(params.limit));
    if (params?.offset) searchParams.set('offset', String(params.offset));
    return fetchAPI<Agent[]>(`/agents?${searchParams}`, { requireAuth: false });
  },

  // Public: Get single agent
  // Sends the token when signed in, so the owner also gets the strategy
  get: (id: string) => fetchAPI<Agent>(`/agents/${id}`),

  // Authenticated: Get current user's agents
  getMyAgents: (includeInactive = true) => {
    const searchParams = new URLSearchParams();
    searchParams.set('include_inactive', String(includeInactive));
    return fetchAPI<Agent[]>(`/agents/my/agents?${searchParams}`, { requireAuth: true });
  },


  // Authenticated: Create new agent
  create: (data: {
    name: string;
    specialty: AgentSpecialty;
    auction_instructions: string;
    negotiation_style?: string;
  }) => fetchAPI<Agent>('/agents', {
    method: 'POST',
    body: JSON.stringify(data),
    requireAuth: true,
  }),

  // Authenticated: Update agent (must own it)
  update: (id: string, data: Partial<Agent>) =>
    fetchAPI<Agent>(`/agents/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
      requireAuth: true,
    }),

  // Authenticated: Delete agent (must own it)
  delete: (id: string) =>
    fetchAPI<void>(`/agents/${id}`, {
      method: 'DELETE',
      requireAuth: true,
    }),

  // Authenticated: Toggle agent active status
  toggleActive: (id: string) =>
    fetchAPI<Agent>(`/agents/${id}/toggle-active`, {
      method: 'POST',
      requireAuth: true,
    }),
};

// =============================================================================
// AGENT STATS API
// =============================================================================

export const agentStatsAPI = {
  // Get stats for a single agent
  getStats: (agentId: string) =>
    fetchAPI<AgentStats>(`/agents/${agentId}/stats`, { requireAuth: false }),

  // Get full stats with recent activity
  getFullStats: (agentId: string) =>
    fetchAPI<AgentFullStats>(`/agents/${agentId}/full-stats`, { requireAuth: false }),

  // Latest bids and passes with reasoning and how each auction ended
  getDecisions: (agentId: string, limit = 20) =>
    fetchAPI<AgentDecisionHistoryItem[]>(`/agents/${agentId}/decisions?limit=${limit}`, { requireAuth: false }),

};

// =============================================================================
// AGENT BUILDER API
// =============================================================================

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface GeneratedInstructions {
  auction_instructions: string;
  negotiation_style: string;
  suggested_name: string;
  personality_summary: string;
}

// Mirrors backend/app/routes/agent_builder.py
const postBuilder = <T>(path: string, body: unknown) =>
  fetchAPI<T>(`/agent-builder/${path}`, {
    method: 'POST',
    body: JSON.stringify(body),
    requireAuth: true, // builder calls cost money: signed-in users only, capped per day
  });

export const agentBuilderAPI = {
  getInitialPrompt: (specialty: AgentSpecialty) =>
    fetchAPI<{ message: string }>(`/agent-builder/initial-prompt/${specialty}`, { requireAuth: false }),

  chat: (messages: ConversationMessage[], specialty: AgentSpecialty) =>
    postBuilder<{ message: string; ready_to_generate: boolean }>('chat', { messages, specialty }),

  generate: (messages: ConversationMessage[], specialty: AgentSpecialty) =>
    postBuilder<GeneratedInstructions>('generate', { messages, specialty }),

  quickGenerate: (description: string, specialty: AgentSpecialty) =>
    postBuilder<GeneratedInstructions>('quick-generate', { description, specialty }),

  refine: (current: GeneratedInstructions, feedback: string, specialty: AgentSpecialty) =>
    postBuilder<GeneratedInstructions>('refine', { current, feedback, specialty }),
};

// =============================================================================
// AUCTIONS API
// =============================================================================

export const auctionsAPI = {
  list: (params?: { specialty?: AgentSpecialty; status?: AuctionStatus; limit?: number; offset?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.specialty) searchParams.set('specialty', params.specialty);
    if (params?.status) searchParams.set('status', params.status);
    if (params?.limit) searchParams.set('limit', String(params.limit));
    if (params?.offset) searchParams.set('offset', String(params.offset));
    return fetchAPI<AuctionWithJob[]>(`/auctions?${searchParams}`, { requireAuth: false });
  },

  get: (id: string) => fetchAPI<AuctionWithJob>(`/auctions/${id}`, { requireAuth: false }),


  getBreakdown: (id: string) =>
    fetchAPI<AuctionBreakdown>(`/auctions/${id}/breakdown`, { requireAuth: false }),

};

// =============================================================================
// ANALYTICS API
// =============================================================================

export const analyticsAPI = {
  getMarketStats: () =>
    fetchAPI<MarketStats>('/analytics/market-stats', { requireAuth: false }),

  getLeaderboard: (limit = 10) =>
    fetchAPI<LeaderboardEntry[]>(`/analytics/leaderboard?limit=${limit}`, { requireAuth: false }),

  getCurrentSeason: () =>
    fetchAPI<Season>('/seasons/current', { requireAuth: false }),

  getSeasonResults: (number: number) =>
    fetchAPI<{ season: Season; results: SeasonResult[] }>(`/seasons/${number}/results`, { requireAuth: false }),

  getSpecialtyShare: () =>
    fetchAPI<SpecialtyShare[]>('/analytics/specialty-share', { requireAuth: false }),

  getBidTrend: (days: number) =>
    fetchAPI<TrendPoint[]>(`/analytics/bid-trend?days=${days}`, { requireAuth: false }),

  getVolumeTrend: (days: number) =>
    fetchAPI<TrendPoint[]>(`/analytics/volume-trend?days=${days}`, { requireAuth: false }),
};
