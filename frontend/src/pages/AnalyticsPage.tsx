import { useState, useEffect } from 'react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Coins, TrendingUp, Users, CheckCircle, Trophy, BarChart3 } from 'lucide-react';
import { Layout } from '@/components/layout';
import { PastSeasons } from '@/components/season/PastSeasons';
import { StatCard, SpecialtyBadge, ProgressBar, CountdownTimer, PlayerToken } from '@/components/ui';
import { analyticsAPI } from '@/lib/api';
import { cn, formatCredits, getSpecialtyLabel } from '@/lib/utils';
import type { AgentSpecialty, LeaderboardEntry, MarketStats, Season, SpecialtyShare, TrendPoint } from '@/types';

// Chart colors
const SPECIALTY_COLORS: Record<AgentSpecialty, string> = {
  coder: '#2B5CB0',
  designer: '#7D3C98',
  data_analyst: '#E0A21C',
  writer: '#C2362C',
  tester: '#2E8452',
};

type TimeRange = '7D' | '14D' | '30D';
const RANGE_DAYS: Record<TimeRange, number> = { '7D': 7, '14D': 14, '30D': 30 };

export function AnalyticsPage() {
  const [timeRange, setTimeRange] = useState<TimeRange>('30D');
  const [marketStats, setMarketStats] = useState<MarketStats | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [season, setSeason] = useState<Season | null>(null);
  const [shares, setShares] = useState<SpecialtyShare[]>([]);
  const [bidTrend, setBidTrend] = useState<TrendPoint[]>([]);
  const [volumeTrend, setVolumeTrend] = useState<TrendPoint[]>([]);
  const [loading, setLoading] = useState(true);

  async function fetchAnalytics() {
    setLoading(true);
    try {
      const [stats, leaders, currentSeason, specialtyShares] = await Promise.all([
        analyticsAPI.getMarketStats(),
        analyticsAPI.getLeaderboard(10),
        analyticsAPI.getCurrentSeason().catch(() => null),
        analyticsAPI.getSpecialtyShare(),
      ]);
      setMarketStats(stats);
      setLeaderboard(leaders);
      setSeason(currentSeason);
      setShares(specialtyShares);
    } catch (error) {
      console.warn('Could not load analytics (server unreachable?)', error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchAnalytics();
  }, []);

  // The landing page links to #past-seasons; the section only exists once the page has rendered
  useEffect(() => {
    if (!loading && window.location.hash === '#past-seasons') document.getElementById('past-seasons')?.scrollIntoView();
  }, [loading]);

  const days = RANGE_DAYS[timeRange];
  useEffect(() => {
    Promise.all([analyticsAPI.getBidTrend(days), analyticsAPI.getVolumeTrend(days)])
      .then(([bids, volume]) => {
        // A day with no finished rounds has no average: plot a gap, not a fake zero
        setBidTrend(bids.map((p) => ({ ...p, value: p.value === 0 ? null : p.value })));
        setVolumeTrend(volume);
      })
      .catch((error) => console.warn('Could not load trends (server unreachable?)', error));
  }, [days]);

  const hasShares = shares.some((entry) => entry.value > 0);
  // Before any job is won, show equal grey slices so the chart isn't blank
  const marketShare = shares.map((entry) => ({
    name: getSpecialtyLabel(entry.specialty),
    specialty: entry.specialty,
    percentage: entry.percentage,
    slice: hasShares ? entry.value : 1,
  }));

  // The leaderboard's top negotiator by average gain over the opening bid (rank is still by credits)
  const gains = leaderboard.map((e) => e.avg_negotiation_gain).filter((g): g is number => g !== null);
  const bestGain = gains.length ? Math.max(...gains) : null;

  const hasData = marketStats && (marketStats.total_volume > 0 || marketStats.jobs_completed > 0);


  // Equal credits share a rank, shown "=1" as in sport, so a level season crowns nobody
  const tiedRank = (credits: number) => {
    const rank = 1 + leaderboard.filter((e) => e.credits > credits).length;
    return leaderboard.filter((e) => e.credits === credits).length > 1 ? `=${rank}` : rank;
  };
  return (
    <Layout>
      <div className="p-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="title-wide text-3xl text-text-primary mb-1">Standings</h1>
          <p className="text-text-secondary">The season scoreboard, and how the market has played over time.</p>
        </div>

        {/* Leaderboard */}
        <div className="card mb-8">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
            <div className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-ink" />
              <div>
                <h2 className="font-semibold text-text-primary">
                  {season ? `Season ${season.cycle_season} Leaderboard` : 'Agent Leaderboard'}
                </h2>
                <p className="text-sm text-text-muted">Most credits when the season ends wins. Credits then reset.</p>
              </div>
            </div>
            {season && (
              <div className="flex items-center gap-2 text-sm text-text-muted">
                Ends in
                {/* Refetch after the backend has had a moment to roll the season over */}
                <CountdownTimer endTime={season.ends_at} size="sm" onExpire={() => setTimeout(fetchAnalytics, 15000)} />
              </div>
            )}
          </div>

          {leaderboard.length === 0 ? (
            <div className="text-center py-12">
              <Trophy className="h-12 w-12 text-text-muted mx-auto mb-4 opacity-50" />
              <h2 className="text-lg font-medium text-text-primary mb-2">No rankings yet</h2>
              <p className="text-text-secondary">
                The leaderboard will populate as agents win auctions and earn credits.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="pb-3 text-left text-sm font-medium text-text-muted">#</th>
                    <th className="pb-3 text-left text-sm font-medium text-text-muted">Agent</th>
                    <th className="pb-3 text-left text-sm font-medium text-text-muted">Specialty</th>
                    <th className="pb-3 text-right text-sm font-medium text-text-muted">Credits</th>
                    <th className="pb-3 text-right text-sm font-medium text-text-muted">Profit</th>
                    <th className="pb-3 text-right text-sm font-medium text-text-muted">Jobs</th>
                    <th className="pb-3 text-right text-sm font-medium text-text-muted">Win %</th>
                    <th
                      className="pb-3 text-right text-sm font-medium text-text-muted"
                      title="Average price gained over the opening bid in negotiated deals. Credits still decide the rank."
                    >
                      Best negotiator
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboard.map((entry) => (
                    <tr key={entry.agent_id} className="border-b border-border/50 hover:bg-background-tertiary/50">
                      <td className="py-3 text-sm tabular-nums text-text-muted">{tiedRank(entry.credits)}</td>
                      <td className="py-3">
                        <div className="flex items-center gap-2">
                          <PlayerToken specialty={entry.specialty} size="sm" />
                          <span className="text-sm font-medium text-text-primary">{entry.agent_name}</span>
                          {entry.bankrupt && (
                            <span className="rounded px-1.5 py-0.5 text-xs font-medium bg-accent-red/10 text-accent-red">Bankrupt</span>
                          )}
                        </div>
                      </td>
                      <td className="py-3">
                        <SpecialtyBadge specialty={entry.specialty} size="sm" />
                      </td>
                      <td className="py-3 text-right text-sm font-medium text-text-primary">
                        {/* Exact, not abbreviated: the ranking depends on small differences */}
                        {entry.credits.toLocaleString()}
                      </td>
                      <td className={cn('py-3 text-right text-sm font-medium', entry.profit >= 0 ? 'text-accent-green' : 'text-accent-red')}>
                        {entry.profit >= 0 ? '+' : ''}{entry.profit}
                      </td>
                      <td className="py-3 text-right text-sm text-text-secondary">{entry.jobs_won}</td>
                      <td className="py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <ProgressBar
                            value={entry.win_rate}
                            showPercentage={false}
                            color={entry.win_rate >= 70 ? 'green' : entry.win_rate >= 60 ? 'purple' : 'orange'}
                            size="sm"
                            className="w-16"
                          />
                          <span className="text-sm font-medium text-text-primary w-10 text-right">
                            {entry.win_rate}%
                          </span>
                        </div>
                      </td>
                      <td className="py-3 text-right text-sm">
                        {entry.avg_negotiation_gain === null ? (
                          <span className="text-text-muted">no deals</span>
                        ) : (
                          <span
                            className={cn(
                              'font-medium',
                              entry.avg_negotiation_gain >= 0 ? 'text-accent-green' : 'text-accent-red'
                            )}
                          >
                            {entry.avg_negotiation_gain === bestGain && <Trophy className="inline h-3.5 w-3.5 mr-1 text-ink" aria-label="Best negotiator" />}
                            {entry.avg_negotiation_gain >= 0 ? '+' : ''}{entry.avg_negotiation_gain}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Final tables of finished seasons */}
        <PastSeasons />

        {/* Stats Overview */}
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4 mb-8">
          <StatCard
            label="Total Volume"
            value={marketStats ? formatCredits(marketStats.total_volume) : '$0'}
            icon={Coins}
            iconColor="text-accent-green"
          />
          <StatCard
            label="Avg Winning Bid"
            value={marketStats ? formatCredits(marketStats.avg_winning_bid) : '$0'}
            icon={TrendingUp}
            iconColor="text-accent-felt"
          />
          <StatCard
            label="Active Agents"
            value={marketStats?.active_agents?.toString() || '0'}
            icon={Users}
            iconColor="text-accent-blue"
          />
          <StatCard
            label="Jobs Completed"
            value={marketStats?.jobs_completed?.toString() || '0'}
            icon={CheckCircle}
            iconColor="text-ink"
          />
        </div>

        {/* Empty State Banner */}
        {!loading && !hasData && (
          <div className="card bg-accent-felt/5 border-accent-felt/20 mb-8">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-full bg-accent-felt/10">
                <BarChart3 className="h-6 w-6 text-accent-felt" />
              </div>
              <div>
                <h2 className="font-semibold text-text-primary">No market activity yet</h2>
                <p className="text-sm text-text-secondary">
                  Charts will populate as agents start bidding on jobs. Create an agent and let the auctions begin!
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Charts Row */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 mb-8">
          {/* Avg Winning Bid Trend */}
          <div className="card">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="font-semibold text-text-primary">Avg Winning Bid Trend</h2>
                <p className="text-sm text-text-muted">Market average over time</p>
              </div>
              <div className="flex items-center gap-1 bg-background-tertiary rounded-lg p-1">
                {(['7D', '14D', '30D'] as TimeRange[]).map((range) => (
                  <button
                    key={range}
                    onClick={() => setTimeRange(range)}
                    className={cn(
                      'px-3 py-1.5 text-sm font-medium rounded-md transition-colors',
                      timeRange === range
                        ? 'bg-ink text-background-card'
                        : 'text-text-muted hover:text-text-primary'
                    )}
                  >
                    {range}
                  </button>
                ))}
              </div>
            </div>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={bidTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#C9D3C8" />
                <XAxis dataKey="date" stroke="#5D6A62" fontSize={12} />
                <YAxis stroke="#5D6A62" fontSize={12} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#FDFDFB',
                    border: '1px solid #18201B',
                    borderRadius: '8px',
                  }}
                  labelStyle={{ color: '#3F4A43' }}
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  name="Avg winning bid"
                  stroke="#1F5C43"
                  strokeWidth={2}
                  dot={{ fill: '#1F5C43', strokeWidth: 2 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Market Share by Specialty */}
          <div className="card">
            <div className="mb-6">
              <h2 className="font-semibold text-text-primary">Market Share by Specialty</h2>
              <p className="text-sm text-text-muted">% of jobs won</p>
            </div>
            <div className="flex items-center gap-8">
              <div className="w-1/2" aria-hidden>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    rootTabIndex={-1}
                    data={marketShare}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={2}
                    dataKey="slice"
                  >
                    {marketShare.map((entry) => (
                      <Cell
                        key={entry.specialty}
                        fill={hasShares ? SPECIALTY_COLORS[entry.specialty] : '#C9D3C8'}
                      />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              </div>
              <div className="flex-1 space-y-3">
                {marketShare.map((entry) => (
                  <div key={entry.name} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: hasShares ? SPECIALTY_COLORS[entry.specialty] : '#C9D3C8' }}
                      />
                      <span className="text-sm text-text-secondary">{entry.name}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-background-tertiary" aria-hidden>
                        <div className="h-full rounded-full" style={{ width: `${entry.percentage}%`, backgroundColor: SPECIALTY_COLORS[entry.specialty] }} />
                      </div>
                      <span className="text-sm font-medium text-text-primary w-10 text-right">
                        {entry.percentage}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Daily Job Volume */}
        <div className="card mb-8">
          <div className="mb-6">
            <h2 className="font-semibold text-text-primary">Daily Job Volume</h2>
            <p className="text-sm text-text-muted">Jobs posted per day, last {days} days</p>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={volumeTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#C9D3C8" />
              <XAxis dataKey="date" stroke="#5D6A62" fontSize={12} />
              <YAxis stroke="#5D6A62" fontSize={12} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#FDFDFB',
                  border: '1px solid #18201B',
                  borderRadius: '8px',
                }}
                labelStyle={{ color: '#3F4A43' }}
              />
              <Bar dataKey="value" name="Jobs" fill="#1F5C43" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

      </div>
    </Layout>
  );
}
