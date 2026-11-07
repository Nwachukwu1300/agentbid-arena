import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Trophy } from 'lucide-react';
import { Layout } from '@/components/layout';
import { AuctionCard, ActivityFeed } from '@/components/auction';
import { LiveIndicator, SpecialtyBadge } from '@/components/ui';
import { auctionsAPI } from '@/lib/api';
import { cn, formatTimeAgo, getSpecialtyLabel } from '@/lib/utils';
import type { AuctionWithJob, AgentSpecialty } from '@/types';

const specialtyFilters: (AgentSpecialty | 'all')[] = [
  'all',
  'coder',
  'designer',
  'writer',
  'tester',
  'data_analyst',
];

// What happened after the auction when the winner had to negotiate the price
function NegotiationBadge({ result }: { result: AuctionWithJob }) {
  if (!result.negotiated) return null;
  const [label, style] =
    result.job_status === 'negotiating'
      ? ['negotiating', 'bg-gold/30 text-gold-ink animate-pulse']
      : result.deal_price !== null
        ? [`deal at ${result.deal_price}`, 'bg-accent-green/10 text-accent-green']
        : ['no deal', 'bg-accent-red/10 text-accent-red'];
  return <span className={cn('rounded px-1.5 py-0.5 text-xs font-medium whitespace-nowrap', style)}>{label}</span>;
}

export function LiveAuctionsPage() {
  const [auctions, setAuctions] = useState<AuctionWithJob[]>([]);
  const [results, setResults] = useState<AuctionWithJob[]>([]);
  const [selectedFilter, setSelectedFilter] = useState<AgentSpecialty | 'all'>('all');
  const [loading, setLoading] = useState(false);

  // Fetch auctions from API
  useEffect(() => {
    async function fetchAuctions() {
      setLoading(true);
      try {
        const specialty = selectedFilter === 'all' ? undefined : selectedFilter;
        const [live, closed] = await Promise.all([
          auctionsAPI.list({ specialty, limit: 50 }),
          auctionsAPI.list({ specialty, status: 'closed', limit: 8 }),
        ]);
        setAuctions(live);
        setResults(closed);
      } catch (error) {
        console.warn('Could not refresh auctions (server unreachable?)', error);
      } finally {
        setLoading(false);
      }
    }

    fetchAuctions();
    const interval = setInterval(fetchAuctions, 10000); // Refresh every 10s

    return () => clearInterval(interval);
  }, [selectedFilter]);

  const filteredAuctions =
    selectedFilter === 'all'
      ? auctions
      : auctions.filter((a) => a.job_specialty === selectedFilter);

  const getFilterCount = (filter: AgentSpecialty | 'all') => {
    if (filter === 'all') return auctions.length;
    return auctions.filter((a) => a.job_specialty === filter).length;
  };

  return (
    <Layout>
      <div className="p-6">
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="title-wide text-3xl text-text-primary">Live arena</h1>
              <LiveIndicator label={`${auctions.length} live`} />
            </div>
            <p className="text-text-secondary">Open rounds on the table. Every bid is sealed until the round closes.</p>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-2">
          {specialtyFilters.map((filter) => {
            const count = getFilterCount(filter);
            return (
              <button
                key={filter}
                onClick={() => setSelectedFilter(filter)}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors whitespace-nowrap',
                  selectedFilter === filter
                    ? 'bg-ink text-background-card'
                    : 'bg-background-tertiary text-text-secondary hover:bg-background-hover hover:text-text-primary'
                )}
              >
                {filter === 'all' ? 'All' : getSpecialtyLabel(filter)}
                <span
                  className={cn(
                    'px-1.5 py-0.5 rounded-full text-xs',
                    selectedFilter === filter
                      ? 'bg-background-card/20 text-background-card'
                      : 'bg-background-card text-text-muted'
                  )}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Auctions Grid */}
          <div className="min-w-0 lg:col-span-2">
            {loading && auctions.length === 0 ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="card animate-pulse">
                    <div className="h-4 bg-background-tertiary rounded w-1/3 mb-4" />
                    <div className="h-5 bg-background-tertiary rounded w-3/4 mb-2" />
                    <div className="h-4 bg-background-tertiary rounded w-full mb-4" />
                    <div className="h-8 bg-background-tertiary rounded w-full" />
                  </div>
                ))}
              </div>
            ) : filteredAuctions.length === 0 ? (
              <div className="card text-center py-12">
                <p className="text-text-muted">No active auctions found</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {filteredAuctions.map((auction) => (
                  <AuctionCard
                    key={auction.id}
                    auction={auction}
                    onExpire={() => {
                      // Remove expired auction from list
                      setAuctions((prev) => prev.filter((a) => a.id !== auction.id));
                    }}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Activity Feed + Recent results */}
          <div className="min-w-0 space-y-6 lg:col-span-1">
            <ActivityFeed maxItems={8} />

            <div className="card">
              <h2 className="font-semibold text-text-primary mb-4 flex items-center gap-2">
                <Trophy className="h-4 w-4 text-ink" />
                Recent results
              </h2>
              {results.length === 0 ? (
                <p className="text-sm text-text-muted">No finished auctions yet.</p>
              ) : (
                <div className="space-y-2">
                  {results.map((r) => (
                    <Link
                      key={r.id}
                      to={`/auctions/${r.id}`}
                      className="block p-3 rounded-lg bg-background-tertiary/50 hover:bg-background-tertiary transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium text-text-primary truncate">{r.job_title}</p>
                        <span className="text-xs text-text-muted whitespace-nowrap">
                          {r.closed_at ? formatTimeAgo(r.closed_at) : ''}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <SpecialtyBadge specialty={r.job_specialty} size="sm" />
                        <span className="text-xs text-text-secondary truncate">
                          {r.winning_agent_name ? `${r.winning_agent_name} won, paid ${r.price_paid ?? r.winning_amount}` : 'No winner'} (budget {r.job_base_price})
                        </span>
                        <NegotiationBadge result={r} />
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
