import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Trophy, MessageSquare, Lock } from 'lucide-react';
import { Layout } from '@/components/layout';
import { CountdownTimer, LiveIndicator, SpecialtyBadge } from '@/components/ui';
import { NegotiationTranscript } from '@/components/auction';
import { auctionsAPI } from '@/lib/api';
import { sseClient } from '@/lib/sse';
import { cn, formatTimeAgo } from '@/lib/utils';
import type { AgentOutcomeKind, AuctionBreakdown } from '@/types';

const OUTCOME_STYLES: Record<AgentOutcomeKind, { label: string; className: string }> = {
  won: { label: 'Won', className: 'bg-accent-green/10 text-accent-green' },
  lost: { label: 'Lost', className: 'bg-accent-red/10 text-accent-red' },
  sealed: { label: 'Sealed bid', className: 'bg-accent-felt/20 text-accent-felt' },
  passed: { label: 'Passed', className: 'bg-background-tertiary text-text-muted' },
  no_winner: { label: 'No winner', className: 'bg-background-tertiary text-text-muted' },
};

export function AuctionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<AuctionBreakdown | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setData(await auctionsAPI.getBreakdown(id));
      setError(null);
    } catch {
      setError('Auction not found');
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  // Refresh when this auction gets a bid, closes, or its negotiation moves. Checks every event: events from
  // several auctions often arrive together, and watching only the latest one missed this auction's updates
  useEffect(() => {
    if (!sseClient.isConnected) sseClient.connect();
    return sseClient.subscribe('all', (event) => {
      if ((event.data as { auction_id?: string } | undefined)?.auction_id === id) load();
    });
  }, [id, load]);

  if (error) {
    return (
      <Layout>
        <div className="p-6">
          <Link to="/auctions" className="btn-ghost mb-4 inline-flex"><ArrowLeft className="mr-1 h-4 w-4" />Live arena</Link>
          <p className="text-text-muted">{error}</p>
        </div>
      </Layout>
    );
  }

  if (!data) {
    return (
      <Layout>
        <div className="p-6 space-y-4">
          <div className="card h-28 animate-pulse" />
          <div className="card h-64 animate-pulse" />
        </div>
      </Layout>
    );
  }

  const { auction, work_cost, decisions, agents, negotiation } = data;
  const isLive = auction.status === 'active';

  return (
    <Layout>
      <div className="p-6 max-w-5xl">
        <Link to="/auctions" className="btn-ghost mb-4 inline-flex">
          <ArrowLeft className="mr-1 h-4 w-4" />
          Live arena
        </Link>

        {/* Header */}
        <div className="card mb-6">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <SpecialtyBadge specialty={auction.job_specialty} size="sm" />
            {isLive ? (
              <>
                <LiveIndicator label="Live" />
                <CountdownTimer endTime={auction.ends_at} size="sm" onExpire={() => setTimeout(load, 8000)} />
              </>
            ) : (
              <span className="text-xs text-text-muted">
                {auction.status === 'closed' ? 'Closed' : 'Cancelled'}
                {auction.closed_at && ` ${formatTimeAgo(auction.closed_at)}`}
              </span>
            )}
          </div>
          <h1 className="text-2xl font-bold text-text-primary mb-1">{auction.job_title}</h1>
          <p className="text-text-secondary mb-4">{auction.job_description}</p>
          <div className="flex flex-wrap gap-6 text-sm">
            <div><span className="text-text-muted">Budget </span><span className="font-medium text-text-primary">{auction.job_base_price}</span></div>
            <div><span className="text-text-muted">Work cost </span><span className="font-medium text-text-primary">about {work_cost}, private to each agent, +10% per running job</span></div>
            <div><span className="text-text-muted">Bids </span><span className="font-medium text-text-primary">{auction.bid_count}</span></div>
            {auction.winning_agent_name && auction.winning_agent_id && (
              <div className="flex items-center gap-1">
                <Trophy className="h-4 w-4 text-ink" />
                <Link to={`/agents/${auction.winning_agent_id}`} className="inline-block py-0.5 font-medium text-text-primary hover:text-accent-felt">
                  {auction.winning_agent_name}
                </Link>
                {auction.price_paid !== null && auction.price_paid !== auction.winning_amount ? (
                  <>
                    <span className="text-text-muted">won with a bid of</span>
                    <span className="font-medium text-text-primary">{auction.winning_amount},</span>
                    <span className="text-text-muted">paid</span>
                    <span className="font-medium text-text-primary" title="Second price: the runner-up's bid">{auction.price_paid}</span>
                  </>
                ) : (
                  <>
                    <span className="text-text-muted">won at</span>
                    <span className="font-medium text-text-primary">{auction.winning_amount}</span>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {isLive && (
          <div className="card mb-6 flex items-center gap-3 border-accent-felt/40">
            <Lock className="h-5 w-5 text-accent-felt" />
            <p className="text-sm text-text-secondary">
              Sealed auction: each agent gets one bid and can't see the others. Amounts and reasoning are revealed when the auction closes.
            </p>
          </div>
        )}

        {/* Only jobs that went to a negotiation; updates live through the feed (events carry auction_id) */}
        {auction.negotiated && negotiation && (
          <NegotiationTranscript negotiation={negotiation} agentName={auction.winning_agent_name} />
        )}

        {/* Why each agent won or lost */}
        <div className="card mb-6">
          <h2 className="font-semibold text-text-primary mb-4">{isLive ? 'Who has made their move' : 'Why each agent won or lost'}</h2>
          {agents.length === 0 ? (
            <p className="text-sm text-text-muted">No agent has made a move yet.</p>
          ) : (
            <div className="space-y-3">
              {agents.map((a) => (
                <div key={a.agent_id} className="p-3 rounded-lg bg-background-tertiary/50">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <Link to={`/agents/${a.agent_id}`} className="inline-block py-0.5 font-medium text-text-primary hover:text-accent-felt">
                      {a.agent_name}
                    </Link>
                    <span className={cn('rounded px-1.5 py-0.5 text-xs font-medium', OUTCOME_STYLES[a.outcome].className)}>
                      {OUTCOME_STYLES[a.outcome].label}
                    </span>
                    {a.best_bid !== null && <span className="text-sm text-text-muted">bid {a.best_bid}</span>}
                    {a.work_cost !== null && <span className="text-sm text-text-muted">· cost {a.work_cost}</span>}
                  </div>
                  <p className="text-sm text-text-primary">{a.explanation}</p>
                  {a.last_reasoning && (
                    <p className="text-sm text-text-secondary mt-1 italic">"{a.last_reasoning}"</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Every decision in order */}
        <div className="card">
          <h2 className="font-semibold text-text-primary mb-4 flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-text-muted" />
            Decision timeline
          </h2>
          {decisions.length === 0 ? (
            <p className="text-sm text-text-muted">No decisions recorded for this auction.</p>
          ) : (
            <ol className="space-y-3">
              {decisions.map((d) => (
                <li key={d.id} className={cn('border-l pl-3', d.decision_type === 'bid' ? 'border-accent-felt' : 'border-border opacity-70')}>
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-medium text-text-primary">{d.agent_name}</span>
                    <span className={d.decision_type === 'bid' ? 'text-accent-felt font-medium' : 'text-text-muted'}>
                      {d.decision_type === 'bid' ? (d.bid_amount === null ? 'sealed bid' : `bid ${d.bid_amount}`) : 'passed'}
                    </span>
                    <span className="text-xs text-text-muted">{new Date(d.created_at).toLocaleTimeString()}</span>
                  </div>
                  <p className="text-sm text-text-secondary">{d.reasoning}</p>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </Layout>
  );
}
