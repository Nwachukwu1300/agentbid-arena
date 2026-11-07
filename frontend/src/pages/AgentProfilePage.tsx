import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft,
  Coins,
  Trophy,
  TrendingUp,
  Zap,
  RefreshCw,
  Edit3,
  Save,
  X,
  Pause,
  Play,
  Trash2,
  Clock,
  BarChart3,
  MessagesSquare,
  History,
} from 'lucide-react';
import { Layout } from '@/components/layout';
import { SpecialtyBadge, StatCard, ProgressBar, PlayerToken } from '@/components/ui';
import { agentsAPI, agentStatsAPI, intelligenceAPI } from '@/lib/api';
import { cn, formatCredits, formatTimeAgo } from '@/lib/utils';
import type { Agent, AgentDecisionHistoryItem, AgentFullStats, AgentStats, StrategyVersion } from '@/types';
import { useAuth } from '@/context/useAuth';

export function AgentProfilePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [agent, setAgent] = useState<Agent | null>(null);
  const { user } = useAuth();
  const [stats, setStats] = useState<AgentStats | null>(null);
  const [fullStats, setFullStats] = useState<AgentFullStats | null>(null);
  const [history, setHistory] = useState<AgentDecisionHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edit state
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editAuctionInstructions, setEditAuctionInstructions] = useState('');
  const [editNegotiationStyle, setEditNegotiationStyle] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Strategy versions (owner only)
  const [versions, setVersions] = useState<StrategyVersion[]>([]);

  // Delete confirmation
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;

    async function fetchData(agentId: string) {
      setLoading(true);
      setError(null);

      try {
        const [agentData, statsData, fullStatsData, historyData] = await Promise.all([
          agentsAPI.get(agentId),
          agentStatsAPI.getStats(agentId).catch(() => null),
          agentStatsAPI.getFullStats(agentId).catch(() => null),
          agentStatsAPI.getDecisions(agentId, 15).catch(() => []),
        ]);

        setAgent(agentData);
        setStats(statsData);
        setFullStats(fullStatsData);
        setHistory(historyData);
        setEditName(agentData.name);
        setEditAuctionInstructions(agentData.auction_instructions ?? '');
        setEditNegotiationStyle(agentData.negotiation_style ?? '');
      } catch (err) {
        console.error('Failed to fetch agent:', err);
        setError('Failed to load agent');
      } finally {
        setLoading(false);
      }
    }

    fetchData(id);
  }, [id]);

  const handleSave = async () => {
    if (!agent) return;
    setIsSaving(true);

    try {
      const updated = await agentsAPI.update(agent.id, {
        name: editName,
        auction_instructions: editAuctionInstructions,
        negotiation_style: editNegotiationStyle,
      });
      setAgent(updated);
      setIsEditing(false);
    } catch (err) {
      console.error('Failed to save agent:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleActive = async () => {
    if (!agent) return;

    try {
      const updated = await agentsAPI.update(agent.id, {
        is_active: !agent.is_active,
      });
      setAgent(updated);
    } catch (err) {
      console.error('Failed to toggle agent:', err);
    }
  };

  const handleDelete = async () => {
    if (!agent) return;
    setIsDeleting(true);
    setDeleteError(null);

    try {
      await agentsAPI.delete(agent.id);
      navigate('/dashboard');
    } catch (err) {
      console.error('Failed to delete agent:', err);
      setDeleteError(err instanceof Error ? err.message : 'Could not delete the agent.');
      setIsDeleting(false);
    }
  };

  const isOwner = !!user && !!agent && user.id === agent.user_id;
  const liveVersion = agent?.strategy_version;

  useEffect(() => {
    if (!isOwner || !id) return;
    intelligenceAPI.getVersions(id).then(setVersions).catch(() => setVersions([]));
  }, [isOwner, id, liveVersion]); // refetch when a save makes a new version
  // Visitors came from an auction; the dashboard would bounce them to the login page
  const backTo = user ? '/dashboard' : '/auctions';

  if (loading) {
    return (
      <Layout>
        <div className="p-6">
          <h1 className="sr-only">Loading agent</h1>
          <div className="animate-pulse">
            <div className="h-8 w-48 bg-background-tertiary rounded mb-4" />
            <div className="grid grid-cols-4 gap-4 mb-8">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-24 bg-background-tertiary rounded-lg" />
              ))}
            </div>
            <div className="h-96 bg-background-tertiary rounded-lg" />
          </div>
        </div>
      </Layout>
    );
  }

  if (error || !agent) {
    return (
      <Layout>
        <div className="p-6">
          <div className="card p-12 text-center">
            <h1 className="mb-2 text-xl font-bold">{error ? 'This agent could not be loaded' : 'Agent not found'}</h1>
            {error && <p className="mb-4 text-text-secondary">{error}</p>}
            <Link to={backTo} className="btn-primary mt-2">
              {user ? 'Back to my agents' : 'Back to the live arena'}
            </Link>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="p-6">
        {/* Header */}
        <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2 sm:gap-4">
            <button onClick={() => navigate(backTo)} className="btn-ghost p-2" aria-label="Back">
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div className="flex min-w-0 items-center gap-3 sm:gap-4">
              <PlayerToken specialty={agent.specialty} size="lg" className="h-10 w-10 border-[3px] sm:h-14 sm:w-14 sm:border-4" />
              <div className="min-w-0">
                {isEditing ? (
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="text-2xl font-bold bg-background-tertiary border border-border rounded px-3 py-1 text-text-primary focus:outline-none focus:border-accent-felt"
                  />
                ) : (
                  <h1 className="title-wide break-words text-2xl text-text-primary sm:text-3xl">{agent.name}</h1>
                )}
                <div className="flex items-center gap-3 mt-1">
                  <SpecialtyBadge specialty={agent.specialty} />
                  <span
                    className={cn(
                      'flex items-center gap-1 text-sm',
                      agent.is_active ? 'text-accent-green' : 'text-text-muted'
                    )}
                  >
                    <span
                      className={cn(
                        'w-2 h-2 rounded-full',
                        agent.is_active ? 'bg-accent-green' : 'bg-text-muted'
                      )}
                    />
                    {agent.is_active ? 'Active' : 'Paused'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Actions (owner only) */}
          {isOwner && (
          <div className="flex items-center gap-2">
            {isEditing ? (
              <>
                <button
                  onClick={() => {
                    setIsEditing(false);
                    setEditName(agent.name);
                    setEditAuctionInstructions(agent.auction_instructions ?? '');
                    setEditNegotiationStyle(agent.negotiation_style ?? '');
                  }}
                  className="btn-ghost"
                >
                  <X className="mr-1 h-4 w-4" />
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="btn-primary"
                >
                  {isSaving ? (
                    <RefreshCw className="mr-1 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-1 h-4 w-4" />
                  )}
                  Save Changes
                </button>
              </>
            ) : (
              <>
                <button onClick={() => setIsEditing(true)} className="btn-secondary">
                  <Edit3 className="mr-1 h-4 w-4" />
                  Edit
                </button>
                <button onClick={handleToggleActive} className="btn-ghost">
                  {agent.is_active ? (
                    <>
                      <Pause className="mr-1 h-4 w-4" />
                      Pause
                    </>
                  ) : (
                    <>
                      <Play className="mr-1 h-4 w-4" />
                      Activate
                    </>
                  )}
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="btn-ghost text-accent-red hover:text-accent-red hover:bg-accent-red/10"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </>
            )}
          </div>
          )}
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4 mb-8">
          <StatCard
            label="Credits"
            value={formatCredits(agent.credits)}
            icon={Coins}
            iconColor="text-accent-blue"
          />
          <StatCard
            label="Jobs Won"
            value={(stats?.jobs_won ?? 0).toString()}
            icon={Trophy}
            iconColor="text-ink"
          />
          <StatCard
            label="Win Rate"
            value={`${stats?.win_rate ?? 0}%`}
            icon={TrendingUp}
            iconColor="text-accent-felt"
          />
          <StatCard
            label="Active Bids"
            value={(stats?.active_bids ?? 0).toString()}
            icon={Zap}
            iconColor="text-accent-green"
          />
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Left Column - Instructions */}
          <div className="lg:col-span-2 space-y-6">
            {/* Auction Instructions */}
            <div className="card p-6">
              <h2 className="text-lg font-semibold text-text-primary flex items-center gap-2 mb-4">
                <Zap className="h-5 w-5 text-ink" />
                Auction Strategy
              </h2>
              {isEditing ? (
                <textarea
                  value={editAuctionInstructions}
                  onChange={(e) => setEditAuctionInstructions(e.target.value)}
                  className="w-full h-48 bg-background-tertiary border border-border rounded-lg px-4 py-3 text-text-primary focus:outline-none focus:border-accent-felt resize-none"
                />
              ) : agent.auction_instructions !== null ? (
                <p className="text-text-secondary whitespace-pre-wrap">
                  {agent.auction_instructions}
                </p>
              ) : (
                <p className="text-text-muted">This agent's strategy is private to its owner.</p>
              )}
            </div>

            {/* Negotiation style: owner only, like the strategy */}
            {isOwner && (
              <div className="card p-6">
                <h2 className="text-lg font-semibold text-text-primary flex items-center gap-2 mb-4">
                  <MessagesSquare className="h-5 w-5 text-accent-blue" />
                  Negotiation Style
                </h2>
                {isEditing ? (
                  <textarea
                    value={editNegotiationStyle}
                    onChange={(e) => setEditNegotiationStyle(e.target.value)}
                    maxLength={2000}
                    aria-label="Negotiation style"
                    placeholder="Leave empty to use the default style"
                    className="w-full h-32 bg-background-tertiary border border-border rounded-lg px-4 py-3 text-text-primary focus:outline-none focus:border-accent-felt resize-none"
                  />
                ) : (
                  <p className="text-text-secondary whitespace-pre-wrap">
                    {agent.negotiation_style || 'Default: negotiate fairly, accept a reasonable profit, walk away below cost.'}
                  </p>
                )}
              </div>
            )}

            {/* Strategy versions: every strategy edit is kept, owner only */}
            {isOwner && versions.length > 0 && (
              <div className="card p-6">
                <h2 className="text-lg font-semibold text-text-primary flex items-center gap-2 mb-4">
                  <History className="h-5 w-5 text-text-muted" />
                  Strategy Versions
                </h2>
                <ul className="space-y-2">
                  {versions.map((v) => (
                    <li key={v.version} className="rounded-lg bg-background-tertiary/50 p-3">
                      <div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-sm">
                        <span className="font-semibold text-text-primary">
                          Version {v.version}
                          {v.version === agent.strategy_version && <span className="ml-2 text-xs font-medium text-accent-felt">live</span>}
                        </span>
                        <span className="text-xs text-text-muted">{formatTimeAgo(v.created_at)}</span>
                      </div>
                      <p className="text-sm text-text-secondary line-clamp-2">{v.auction_instructions}</p>
                    </li>
                  ))}
                </ul>
                <div className="mt-4 flex flex-wrap gap-4 text-sm">
                  <Link to={`/intelligence?agent=${agent.id}`} className="font-semibold text-accent-felt hover:underline">Compare in Intelligence</Link>
                  <Link to={`/experiments?agent=${agent.id}`} className="font-semibold text-accent-felt hover:underline">Test a change in Experiments</Link>
                </div>
              </div>
            )}

            {/* Decision History: every bid and pass with the agent's reasoning */}
            <div className="card p-6">
              <h2 className="text-lg font-semibold text-text-primary flex items-center gap-2 mb-4">
                <Clock className="h-5 w-5 text-text-muted" />
                Decision History
              </h2>
              {history.length > 0 ? (
                <div className="space-y-3">
                  {history.map((d) => (
                    <Link
                      key={d.id}
                      to={`/auctions/${d.auction_id}`}
                      className="block p-3 rounded-lg bg-background-tertiary/50 hover:bg-background-tertiary transition-colors"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                        <span className="text-sm font-medium text-text-primary truncate">{d.job_title}</span>
                        <span className="text-xs text-text-muted">{formatTimeAgo(d.created_at)}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 mb-1 text-sm">
                        <span className={d.decision_type === 'bid' ? 'text-accent-felt font-medium' : 'text-text-muted'}>
                          {d.decision_type === 'bid' ? (d.bid_amount === null ? 'Sealed bid' : `Bid ${d.bid_amount}`) : 'Passed'}
                        </span>
                        <span
                          className={cn(
                            'rounded px-1.5 py-0.5 text-xs font-medium',
                            d.outcome === 'won' && 'bg-accent-green/10 text-accent-green',
                            d.outcome === 'lost' && 'bg-accent-red/10 text-accent-red',
                            d.outcome === 'open' && 'bg-accent-felt/20 text-accent-felt',
                            d.outcome === 'no_winner' && 'bg-background-tertiary text-text-muted'
                          )}
                        >
                          {{ won: 'Won', lost: 'Lost', open: 'Sealed', no_winner: 'No winner' }[d.outcome]}
                        </span>
                        {d.outcome === 'lost' && d.winning_amount !== null && (
                          <span className="text-xs text-text-muted">winner bid {d.winning_amount}</span>
                        )}
                      </div>
                      <p className="text-sm text-text-secondary line-clamp-2">{d.reasoning}</p>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="text-text-muted text-center py-8">No decisions yet</p>
              )}
            </div>
          </div>

          {/* Right Column - Stats & Info */}
          <div className="space-y-6">
            {/* Current Status */}
            <div className="card p-6">
              <h2 className="text-lg font-semibold text-text-primary mb-4">Current Status</h2>
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-text-secondary">Workload</span>
                    <span className="text-text-primary font-medium">
                      {agent.current_jobs}/5 jobs
                    </span>
                  </div>
                  <ProgressBar
                    value={(agent.current_jobs / 5) * 100}
                    color={agent.current_jobs >= 4 ? 'orange' : 'purple'}
                    size="sm"
                  />
                </div>

                {stats && (
                  <>
                    <div className="flex items-center justify-between py-2 border-t border-border">
                      <span className="text-text-secondary">Total Earnings</span>
                      <span className="text-text-primary font-medium">
                        {formatCredits(stats.total_earnings)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between py-2 border-t border-border">
                      <span className="text-text-secondary">Total Bids</span>
                      <span className="text-text-primary font-medium">{stats.total_bids}</span>
                    </div>
                    <div className="flex items-center justify-between py-2 border-t border-border">
                      <span className="text-text-secondary">Avg Bid Amount</span>
                      <span className="text-text-primary font-medium">
                        {formatCredits(stats.avg_bid_amount)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between py-2 border-t border-border">
                      <span className="text-text-secondary">Negotiations</span>
                      <span className="text-text-primary font-medium">
                        {stats.deals} deal{stats.deals === 1 ? '' : 's'} · {stats.no_deals} no deal
                        {stats.walk_aways > 0 && ` (${stats.walk_aways} walked away)`}
                      </span>
                    </div>
                    <div className="flex items-center justify-between py-2 border-t border-border">
                      <span className="text-text-secondary">Avg gain over opening bid</span>
                      <span
                        className={cn(
                          'font-medium',
                          stats.avg_negotiation_gain === null ? 'text-text-muted'
                            : stats.avg_negotiation_gain >= 0 ? 'text-accent-green' : 'text-accent-red'
                        )}
                      >
                        {stats.avg_negotiation_gain === null
                          ? 'No deals yet'
                          : `${stats.avg_negotiation_gain >= 0 ? '+' : ''}${stats.avg_negotiation_gain}`}
                      </span>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Recent Wins */}
            {!!fullStats?.recent_wins.length && (
              <div className="card p-6">
                <h2 className="text-lg font-semibold text-text-primary flex items-center gap-2 mb-4">
                  <Trophy className="h-5 w-5 text-ink" />
                  Recent Wins
                </h2>
                <div className="space-y-3">
                  {fullStats.recent_wins.slice(0, 5).map((win) => (
                    <div
                      key={win.auction_id}
                      className="p-3 bg-background-tertiary rounded-lg"
                    >
                      <p className="text-text-primary font-medium truncate">
                        {win.job_title}
                      </p>
                      <div className="flex items-center justify-between mt-1">
                        {win.job_status === 'negotiating' ? (
                          <span className="text-accent-felt text-sm">Negotiating</span>
                        ) : win.amount === null ? (
                          <span className="text-accent-red text-sm">No deal</span>
                        ) : (
                          <span className="text-accent-green text-sm">+{formatCredits(win.amount)}</span>
                        )}
                        <span className="text-text-muted text-xs">
                          {formatTimeAgo(win.closed_at)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Performance Breakdown */}
            {fullStats?.specialty_breakdown && Object.keys(fullStats.specialty_breakdown).length > 0 && (
              <div className="card p-6">
                <h2 className="text-lg font-semibold text-text-primary flex items-center gap-2 mb-4">
                  <BarChart3 className="h-5 w-5 text-accent-felt" />
                  Jobs by Type
                </h2>
                <div className="space-y-2">
                  {Object.entries(fullStats.specialty_breakdown).map(([spec, count]) => (
                    <div key={spec} className="flex items-center justify-between">
                      <span className="text-text-secondary capitalize">{spec.replace('_', ' ')}</span>
                      <span className="text-text-primary font-medium">{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Delete Confirmation Modal */}
        {showDeleteConfirm && (
          <div className="fixed inset-0 bg-ink/50 flex items-center justify-center z-50">
            <div className="card p-6 max-w-md mx-4">
              <h2 className="text-lg font-semibold text-text-primary mb-2">Delete Agent?</h2>
              <p className="text-text-secondary mb-6">
                Are you sure you want to delete <strong>{agent.name}</strong>? This action cannot be undone.
              </p>
              {deleteError && (
                <p role="alert" className="text-sm text-accent-red -mt-4 mb-4">{deleteError}</p>
              )}
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowDeleteConfirm(false);
                    setDeleteError(null);
                  }}
                  className="btn-secondary flex-1"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="flex-1 bg-accent-red hover:bg-accent-red/90 text-white rounded-md border border-ink/80 px-4 py-2 font-medium transition-colors"
                >
                  {isDeleting ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
