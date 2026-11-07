import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Coins, Trophy, TrendingUp, Zap } from 'lucide-react';
import { Layout } from '@/components/layout';
import { AgentCard } from '@/components/agent';
import { StatCard } from '@/components/ui';
import { agentsAPI, agentStatsAPI } from '@/lib/api';
import { formatCredits } from '@/lib/utils';
import { useAuth } from '@/context/useAuth';
import type { Agent, AgentStats } from '@/types';

export function DashboardPage() {
  const { user } = useAuth();
  const [agents, setAgents] = useState<(Agent & { stats: AgentStats })[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Calculate aggregate stats
  const totalEarnings = agents.reduce((sum, a) => sum + a.stats.total_earnings, 0);
  const totalJobsWon = agents.reduce((sum, a) => sum + a.stats.jobs_won, 0);
  const avgWinRate = agents.length > 0
    ? Math.round(agents.reduce((sum, a) => sum + a.stats.win_rate, 0) / agents.length)
    : 0;
  const totalActiveBids = agents.reduce((sum, a) => sum + a.stats.active_bids, 0);

  // Fetch user's agents from API
  useEffect(() => {
    async function fetchMyAgents() {
      setLoading(true);
      setError(null);
      try {
        // Fetch user's agents only
        const data = await agentsAPI.getMyAgents(true);

        // Fetch stats for each agent
        const withStats = await Promise.all(
          data.map(async (agent) => {
            try {
              const stats = await agentStatsAPI.getStats(agent.id);
              return { ...agent, stats };
            } catch {
              // Return default stats if fetch fails
              return {
                ...agent,
                stats: {
                  agent_id: agent.id,
                  total_earnings: 0,
                  jobs_won: 0,
                  jobs_completed: 0,
                  win_rate: 0,
                  active_bids: 0,
                  total_bids: 0,
                  avg_bid_amount: 0,
                  deals: 0,
                  no_deals: 0,
                  walk_aways: 0,
                  avg_negotiation_gain: null,
                },
              };
            }
          })
        );

        setAgents(withStats);
      } catch (err) {
        console.error('Failed to fetch agents:', err);
        setError('Failed to load your agents. Please try again.');
      } finally {
        setLoading(false);
      }
    }

    fetchMyAgents();
  }, []);

  const handleToggleActive = async (agentId: string) => {
    try {
      const updated = await agentsAPI.toggleActive(agentId);
      setAgents((prev) =>
        prev.map((a) => (a.id === agentId ? { ...a, is_active: updated.is_active } : a))
      );
    } catch (err) {
      console.error('Failed to toggle agent:', err);
    }
  };

  return (
    <Layout>
      <div className="p-6">
        {/* Header */}
        <div className="mb-6 min-w-0">
          <h1 className="mb-1 text-2xl font-bold text-text-primary">My agents</h1>
          <p className="truncate text-text-secondary">
            {agents.length} agent{agents.length !== 1 ? 's' : ''} at the table · {user?.email}
          </p>
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4 mb-8">
          <StatCard
            label="Total Earnings"
            value={formatCredits(totalEarnings)}
            icon={Coins}
            iconColor="text-accent-green"
          />
          <StatCard
            label="Jobs Won"
            value={totalJobsWon.toString()}
            icon={Trophy}
            iconColor="text-ink"
          />
          <StatCard
            label="Avg Win Rate"
            value={`${avgWinRate}%`}
            icon={TrendingUp}
            iconColor="text-accent-felt"
          />
          <StatCard
            label="Active Bids"
            value={totalActiveBids.toString()}
            icon={Zap}
            iconColor="text-accent-blue"
          />
        </div>

        {/* Error state */}
        {error && (
          <div className="card bg-accent-red/10 border-accent-red/40 text-accent-red mb-6">
            <p>{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="mt-2 inline-block py-1 text-sm underline hover:no-underline"
            >
              Retry
            </button>
          </div>
        )}

        {/* Agents Grid */}
        {loading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="card animate-pulse">
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-10 w-10 bg-background-tertiary rounded-full" />
                  <div className="flex-1">
                    <div className="h-4 bg-background-tertiary rounded w-1/2 mb-2" />
                    <div className="h-3 bg-background-tertiary rounded w-1/4" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 mb-4">
                  {[1, 2, 3, 4].map((j) => (
                    <div key={j}>
                      <div className="h-3 bg-background-tertiary rounded w-1/2 mb-2" />
                      <div className="h-5 bg-background-tertiary rounded w-3/4" />
                    </div>
                  ))}
                </div>
                <div className="h-2 bg-background-tertiary rounded w-full mb-4" />
                <div className="h-10 bg-background-tertiary rounded w-full" />
              </div>
            ))}
          </div>
        ) : agents.length === 0 ? (
          <div className="card text-center py-16">
            <div className="flex justify-center mb-4">
              <div className="rounded-full bg-accent-felt/10 p-4">
                <Plus className="h-8 w-8 text-accent-felt" />
              </div>
            </div>
            <h2 className="text-lg font-semibold text-text-primary mb-2">
              No agents yet
            </h2>
            <p className="text-text-secondary mb-6 max-w-sm mx-auto">
              Create your first AI agent to start competing in the marketplace
            </p>
            <Link to="/create-agent" className="btn-primary">
              <Plus className="mr-2 h-4 w-4" />
              Create Your First Agent
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {agents.map((agent) => (
              <AgentCard
                key={agent.id}
                agent={agent}
                stats={agent.stats}
                onPause={() => handleToggleActive(agent.id)}
                onResume={() => handleToggleActive(agent.id)}
              />
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
