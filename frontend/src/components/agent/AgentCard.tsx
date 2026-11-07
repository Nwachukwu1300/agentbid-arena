import { Link } from 'react-router-dom';
import { Coins, Trophy, TrendingUp, Zap, Pause, Play, Eye } from 'lucide-react';
import { Agent, AgentStats } from '@/types';
import { cn, formatCredits } from '@/lib/utils';
import { SpecialtyBadge, PlayerToken } from '@/components/ui';

interface AgentCardProps {
  agent: Agent;
  stats?: AgentStats;
  onPause?: () => void;
  onResume?: () => void;
  className?: string;
}

export function AgentCard({
  agent,
  stats = {
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
  onPause,
  onResume,
  className,
}: AgentCardProps) {
  return (
    <div
      className={cn(
        'card relative overflow-hidden',
        className
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <PlayerToken specialty={agent.specialty} size="lg" />
          <div>
            <h2 className="font-semibold text-text-primary">{agent.name}</h2>
            <SpecialtyBadge specialty={agent.specialty} size="sm" />
          </div>
        </div>
        <div className="flex items-center gap-1">
          <span
            className={cn(
              'flex items-center gap-1 text-xs font-medium',
              agent.is_active ? 'text-accent-green' : 'text-text-muted'
            )}
          >
            <span
              className={cn(
                'h-1.5 w-1.5 rounded-full',
                agent.is_active ? 'bg-accent-green' : 'bg-text-muted'
              )}
            />
            {agent.is_active ? 'Active' : 'Paused'}
          </span>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-text-muted">
            <Coins className="h-3.5 w-3.5" />
            <span className="text-xs">Earnings</span>
          </div>
          <p className="text-lg font-semibold text-text-primary">
            {formatCredits(stats.total_earnings)}
          </p>
        </div>
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-text-muted">
            <Trophy className="h-3.5 w-3.5" />
            <span className="text-xs">Jobs Won</span>
          </div>
          <p className="text-lg font-semibold text-text-primary">{stats.jobs_won}</p>
        </div>
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-text-muted">
            <TrendingUp className="h-3.5 w-3.5" />
            <span className="text-xs">Win Rate</span>
          </div>
          <p className="text-lg font-semibold text-text-primary">{stats.win_rate}%</p>
        </div>
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-text-muted">
            <Zap className="h-3.5 w-3.5" />
            <span className="text-xs">Active Bids</span>
          </div>
          <p className="text-lg font-semibold text-text-primary">{stats.active_bids}</p>
        </div>
      </div>

      {/* Credits */}
      <div className="flex items-center justify-between text-sm mb-4">
        <span className="text-text-muted">
          Balance <span className="font-semibold text-text-primary">{formatCredits(agent.credits)}</span>
        </span>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 pt-4 border-t border-border">
        <Link
          to={`/agents/${agent.id}`}
          className="flex-1 btn-secondary text-sm py-2"
        >
          <Eye className="mr-1.5 h-4 w-4" />
          View Profile
        </Link>
        <button
          onClick={agent.is_active ? onPause : onResume}
          className="btn-ghost p-2"
          title={agent.is_active ? 'Pause agent' : 'Resume agent'}
          aria-label={agent.is_active ? `Pause ${agent.name}` : `Resume ${agent.name}`}
        >
          {agent.is_active ? (
            <Pause className="h-4 w-4" />
          ) : (
            <Play className="h-4 w-4" />
          )}
        </button>
      </div>
    </div>
  );
}
