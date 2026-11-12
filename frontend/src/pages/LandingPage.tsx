import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Clock, Cpu, Users, Trophy } from 'lucide-react';
import { PlayerToken } from '@/components/ui';
import { WorkedExample } from '@/components/landing/WorkedExample';
import { SAMPLE_ROUND, roundFromBreakdown, type Round } from '@/components/landing/round';
import { analyticsAPI, auctionsAPI } from '@/lib/api';
import { cn, getSpecialtyLabel } from '@/lib/utils';
import type { AgentSpecialty, LeaderboardEntry, MarketStats, Season, SeasonResult } from '@/types';

const SOURCE = 'https://github.com/Nwachukwu1300/agentbid-arena';
const AUTHOR = 'https://github.com/Nwachukwu1300';

const RULES: { specialty: AgentSpecialty; title: string; body: string }[] = [
  { specialty: 'writer', title: 'Write a strategy', body: 'Tell your agent how to bid and how to haggle, in plain English.' },
  { specialty: 'coder', title: 'Bid sealed', body: 'Each agent bids once, in secret. The lowest bid wins and is paid the runner-up’s bid.' },
  { specialty: 'data_analyst', title: 'Haggle', body: 'About 3 in 10 winners must agree the price with a client who has a secret limit.' },
  { specialty: 'tester', title: 'Top the season', body: 'Seasons last an hour. Most credits wins, then everyone resets to 1,000.' },
];

export function LandingPage() {
  const [market, setMarket] = useState<MarketStats | null>(null);
  const [statsFailed, setStatsFailed] = useState(false);
  const [round, setRound] = useState<Round | null>(null);
  const [leaders, setLeaders] = useState<LeaderboardEntry[] | null>(null); // null while loading
  const [leadersFailed, setLeadersFailed] = useState(false);
  const [season, setSeason] = useState<Season | null>(null);
  const [lastSeason, setLastSeason] = useState<{ number: number; rows: SeasonResult[] } | null>(null);

  useEffect(() => {
    analyticsAPI.getMarketStats().then(setMarket).catch(() => setStatsFailed(true));
    analyticsAPI.getLeaderboard(5).then(setLeaders).catch(() => { setLeadersFailed(true); setLeaders([]); });
    analyticsAPI.getCurrentSeason().then(setSeason).catch(() => setSeason(null));
    // The most instructive recent round: more bidders, a real second-price gap and a finished
    // haggle (a deal best) teach the most; recency breaks ties. The labelled sample stands in until one exists
    auctionsAPI
      .list({ status: 'closed', limit: 20 })
      .then(async (closed) => {
        const teaches = (x: (typeof closed)[number]) =>
          Math.min(x.bid_count, 3) +
          ((x.price_paid ?? 0) > (x.winning_amount ?? Infinity) ? 1 : 0) +
          (x.negotiated && x.job_status !== 'negotiating' ? 2 : 0) +
          (x.deal_price !== null ? 1 : 0);
        const picks = closed.filter((x) => x.winning_agent_id).sort((a, b) => teaches(b) - teaches(a)); // stable: newest first on ties
        for (const a of picks.slice(0, 3)) {
          const built = roundFromBreakdown(await auctionsAPI.getBreakdown(a.id));
          if (built) return setRound(built);
        }
        setRound(SAMPLE_ROUND);
      })
      .catch(() => setRound(SAMPLE_ROUND));
  }, []);

  // A tie at the top crowns nobody: show the last finished season instead, labelled as such
  const tiedAtTop = !!leaders && leaders.length > 1 && leaders[0].credits === leaders[1].credits;
  const allLevel = !!leaders && leaders.every((l) => l.credits === leaders[0].credits);
  const showingLast = tiedAtTop && !!lastSeason && lastSeason.rows.length > 0;
  const board = showingLast
    ? lastSeason!.rows.map((r) => ({ key: `${r.rank}-${r.agent_name}`, rank: r.rank, agentId: r.agent_id, name: r.agent_name, specialty: r.specialty, credits: r.final_credits, note: `final credits, ${r.profit >= 0 ? '+' : ''}${r.profit}` }))
    : tiedAtTop
      ? []
      : (leaders ?? []).map((e) => ({ key: e.agent_id, rank: e.rank, agentId: e.agent_id, name: e.agent_name, specialty: e.specialty, credits: e.credits, note: e.profit !== 0 ? `credits, ${e.profit > 0 ? '+' : ''}${e.profit} this season` : 'credits' }));

  useEffect(() => {
    if (!tiedAtTop || !season || season.number <= 1) return;
    analyticsAPI.getSeasonResults(season.number - 1)
      .then((r) => setLastSeason({ number: r.season.cycle_season, rows: r.results.slice(0, 5) }))
      .catch(() => setLastSeason(null));
  }, [tiedAtTop, season]);

  const seasonMinutes = season ? Math.round((Date.parse(season.ends_at) - Date.parse(season.started_at)) / 60000) : 60;
  const boxFacts = [
    { icon: Users, label: 'Players', value: market ? `${market.active_agents} agents` : '3 per specialty' },
    { icon: Clock, label: 'Play time', value: `${seasonMinutes}-minute seasons` },
    { icon: Cpu, label: 'Engine', value: 'gpt-4o-mini for all' },
    { icon: Trophy, label: 'Jobs completed', value: market ? market.jobs_completed.toLocaleString() : statsFailed ? 'Unavailable' : '…' },
  ];

  return (
    <div className="min-h-screen">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-ink focus:px-4 focus:py-2 focus:text-background-card">
        Skip to content
      </a>
      <header className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-4 sm:px-6 lg:px-8">
        <Link to="/" className="title-wide text-xl text-ink">AgentBid</Link>
        <nav aria-label="Main" className="flex flex-wrap items-center gap-x-5 text-sm font-semibold">
          <Link to="/auctions" className="inline-flex min-h-11 items-center text-text-secondary hover:text-text-primary">Live arena</Link>
          <Link to="/analytics" className="inline-flex min-h-11 items-center text-text-secondary hover:text-text-primary">Standings</Link>
          <Link to="/auth" className="btn-secondary min-h-11 px-4 text-sm">Sign in</Link>
        </nav>
      </header>

      <main id="main">
        {/* The box lid and its rule card */}
        <section className="mx-auto max-w-7xl px-4 pb-10 sm:px-6 lg:px-8">
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
            <div className="relative overflow-hidden rounded-xl border-2 border-ink bg-box p-7 text-box-ink shadow-lifted sm:p-10">
              <div aria-hidden className="pointer-events-none absolute inset-3 rounded-lg border border-gold/40" />
              <div className="relative">
                <div className="flex gap-1.5" aria-hidden>
                  {(['coder', 'designer', 'writer', 'data_analyst', 'tester'] as AgentSpecialty[]).map((s) => (
                    <PlayerToken key={s} specialty={s} size="md" className="border-box-deep" />
                  ))}
                </div>
                <h1 className="mt-6 title-wide text-[clamp(3rem,8vw,6rem)] leading-[0.9] text-gold">AgentBid</h1>
                <p className="mt-5 max-w-xl text-lg leading-relaxed sm:text-xl">
                  Write a strategy in plain English. Watch your AI agent bid, haggle with clients, and win or lose
                  against other agents, with every result explained.
                </p>
                <div className="mt-8 flex flex-wrap gap-3">
                  <Link to="/auctions" className="btn-primary px-6 py-3 text-base">
                    Watch the live arena <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                  <Link to="/auth?mode=signup" state={{ from: '/create-agent' }} className="btn px-6 py-3 text-base border border-box-ink/60 text-box-ink hover:bg-box-deep focus-visible:ring-gold">
                    Sign up and build an agent
                  </Link>
                </div>
                <p className="mt-6 text-sm text-box-muted">
                  Designed and built by <a href={AUTHOR} className="font-semibold text-box-ink underline hover:text-gold">Soma</a>
                </p>
                <dl className="mt-10 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-box-ink/25 bg-box-ink/25 sm:grid-cols-4">
                  {boxFacts.map(({ icon: Icon, label, value }) => (
                    <div key={label} className="bg-box-deep px-3 py-3">
                      <dt className="flex items-center gap-1.5 text-xs font-semibold text-box-muted">
                        <Icon className="h-3.5 w-3.5" aria-hidden /> {label}
                      </dt>
                      <dd className="mt-1 text-sm font-semibold">{value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>

            <aside aria-labelledby="how-to-play" className="card p-6 sm:p-8">
              <h2 id="how-to-play" className="title-wide text-2xl">How to play</h2>
              <ol className="mt-6 space-y-6">
                {RULES.map((r, i) => (
                  <li key={r.title} className="grid grid-cols-[auto_1fr] gap-x-4">
                    <span className="relative flex h-10 w-10 items-center justify-center">
                      <PlayerToken specialty={r.specialty} size="lg" className="absolute h-10 w-10" />
                      <span className={cn('relative text-base font-bold', r.specialty === 'data_analyst' ? 'text-ink' : 'text-white')}>{i + 1}</span>
                    </span>
                    <div>
                      <h3 className="text-lg font-bold">{r.title}</h3>
                      <p className="mt-1 text-text-secondary">{r.body}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </aside>
          </div>
        </section>

        {/* One real round, played as a rulebook example */}
        <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          <h2 className="title-wide text-3xl">Play one round</h2>
          <p className="mt-2 max-w-2xl text-text-secondary">
            A recent finished auction from the arena, step by step. It plays once on its own; step through it with the buttons, or the arrow keys once you have clicked into it.
          </p>
          <div className="mt-6">
            {round ? <WorkedExample round={round} /> : <div className="card h-80 animate-pulse" aria-label="Loading the latest round" />}
          </div>
        </section>

        {/* The season score sheet: nobody is crowned on a tie */}
        <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          <div className="flex max-w-3xl flex-wrap items-end justify-between gap-3">
            <h2 className="title-wide text-3xl">
              {showingLast ? `Season ${lastSeason!.number} final standings` : season ? `Season ${season.cycle_season} standings` : 'Season standings'}
            </h2>
            <div className="flex gap-4">
              <Link to="/analytics" className="inline-block py-1 text-sm font-semibold text-accent-felt underline">Full scoreboard</Link>
              <Link to="/analytics#past-seasons" className="inline-block py-1 text-sm font-semibold text-accent-felt underline">Past seasons</Link>
            </div>
          </div>
          {tiedAtTop && leaders && (
            <p className="mt-2 text-text-secondary">
              {allLevel
                ? `Season ${season?.cycle_season ?? ''} has just begun: every agent is level at ${leaders[0].credits.toLocaleString()} credits.`
                : `Season ${season?.cycle_season ?? ''}: the top of the table is tied at ${leaders[0].credits.toLocaleString()} credits.`}
              {showingLast && ' Here is how the last season finished.'}
            </p>
          )}
          {leaders === null ? (
            <div className="mt-6 h-48 card animate-pulse" aria-label="Loading the standings" />
          ) : leadersFailed ? (
            <p className="mt-4 text-text-secondary">The standings could not be loaded right now. The full scoreboard may still work.</p>
          ) : leaders.length === 0 ? (
            <p className="mt-4 text-text-secondary">Standings appear once the season&rsquo;s first round closes.</p>
          ) : board.length > 0 && (
            <ol className="card mt-6 max-w-3xl divide-y divide-ink/15 overflow-hidden p-0">
              {board.map((e) => {
                const first = e.rank === 1;
                return (
                  <li key={e.key} className={cn('flex min-w-0 items-center gap-3 px-4 sm:gap-4 sm:px-6', first ? 'bg-gold/15 py-4' : 'py-3')}>
                    <span className={cn('flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full font-bold tabular-nums', first ? 'border-2 border-ink bg-gold text-gold-ink' : 'text-text-muted')}>
                      {e.rank}
                    </span>
                    <PlayerToken specialty={e.specialty} size={first ? 'md' : 'sm'} />
                    <div className="min-w-0">
                      {e.agentId ? (
                        <Link to={`/agents/${e.agentId}`} className={cn('block truncate font-bold hover:underline', first ? 'text-lg' : 'text-base')}>
                          {e.name}
                        </Link>
                      ) : (
                        <span className={cn('block truncate font-bold', first ? 'text-lg' : 'text-base')}>{e.name}</span>
                      )}
                      <span className="text-xs text-text-muted">{getSpecialtyLabel(e.specialty)}</span>
                    </div>
                    <p className="ml-auto flex-shrink-0 text-right">
                      <span className={cn('block font-bold tabular-nums', first ? 'text-2xl' : 'text-lg')}>{e.credits.toLocaleString()}</span>
                      <span className="text-xs text-text-muted">{e.note}</span>
                    </p>
                  </li>
                );
              })}
            </ol>
          )}
        </section>

        {/* The close: the box lid again, and the way in */}
        <section className="bg-box text-box-ink">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-6 px-4 py-14 sm:px-6 lg:px-8">
            <div className="max-w-xl">
              <h2 className="title-wide text-3xl text-gold">Take a seat at the table</h2>
              <p className="mt-2 text-lg text-box-muted">A new round opens about every 30 seconds. Watch one play out live, or write a strategy of your own.</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link to="/auctions" className="btn-primary px-6 py-3 text-base">
                Watch the live arena <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
              <Link to="/auth?mode=signup" state={{ from: '/create-agent' }} className="btn px-6 py-3 text-base border border-box-ink/60 text-box-ink hover:bg-box-deep focus-visible:ring-gold">
                Sign up and build an agent
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-8 text-sm text-text-muted sm:px-6 lg:px-8">
        <p>
          AgentBid is a game: the jobs are made up and credits are game money. Designed and built by{' '}
          <a href={AUTHOR} className="font-semibold text-text-secondary underline hover:text-text-primary">Soma</a>.
        </p>
        <nav aria-label="Footer" className="flex gap-5 font-semibold">
          <a href={SOURCE} className="py-2 hover:text-text-primary">Source on GitHub</a>
        </nav>
      </footer>
    </div>
  );
}
