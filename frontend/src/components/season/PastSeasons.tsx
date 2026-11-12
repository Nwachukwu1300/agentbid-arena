import { useEffect, useState } from 'react';
import { Crown, History, Trophy } from 'lucide-react';
import { PlayerToken, SpecialtyBadge } from '@/components/ui';
import { analyticsAPI } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { CycleChampion, Season, SeasonResult } from '@/types';

const TOP_ROWS = 10;

function formatEnded(season: Season): string {
  return new Date(season.ends_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** Final tables of the seasons that have finished, so a result stays visible after the next season starts. */
export function PastSeasons() {
  const [seasons, setSeasons] = useState<Season[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [picked, setPicked] = useState<number | null>(null);
  const [results, setResults] = useState<SeasonResult[] | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [champions, setChampions] = useState<CycleChampion[]>([]);

  useEffect(() => {
    analyticsAPI.getChampions().then(setChampions).catch(() => setChampions([]));
    analyticsAPI.getSeasons()
      .then((all) => {
        // Only the newest cycle gets tabs; older cycles are summed up by their champion below
        const finished = all.filter((s) => s.status === 'finished' && s.cycle === all[0].cycle);
        setSeasons(finished);
        setPicked(finished[0]?.number ?? null);
      })
      .catch(() => setFailed(true));
  }, []);

  useEffect(() => {
    if (picked === null) return;
    let stale = false;
    setResults(null);
    setShowAll(false);
    analyticsAPI.getSeasonResults(picked)
      .then((r) => { if (!stale) setResults(r.results); })
      .catch(() => { if (!stale) setResults([]); });
    return () => { stale = true; };
  }, [picked]);

  const season = seasons?.find((s) => s.number === picked) ?? null;
  const tiedAtTop = !!results && results.length > 1 && results[0].final_credits === results[1].final_credits;
  const shown = results ? (showAll ? results : results.slice(0, TOP_ROWS)) : [];

  return (
    <div id="past-seasons" className="card mb-8 scroll-mt-4">
      <div className="mb-6 flex items-center gap-2">
        <History className="h-5 w-5 text-ink" />
        <div>
          <h2 className="font-semibold text-text-primary">Past seasons</h2>
          <p className="text-sm text-text-muted">The final table of every finished season in this cycle of 20.</p>
        </div>
      </div>

      {failed ? (
        <p className="py-8 text-center text-text-secondary">Past seasons could not be loaded. Try again in a moment.</p>
      ) : seasons === null ? (
        <div className="h-32 animate-pulse rounded-md bg-background-tertiary/50" aria-label="Loading past seasons" />
      ) : seasons.length === 0 ? (
        <div className="py-10 text-center">
          <History className="mx-auto mb-3 h-10 w-10 text-text-muted opacity-50" />
          <p className="text-text-secondary">No season of this cycle has finished yet. The first final table appears here when the current one ends.</p>
        </div>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap gap-2" role="tablist" aria-label="Finished seasons">
            {seasons.map((s) => (
              <button
                key={s.id}
                role="tab"
                aria-selected={s.number === picked}
                onClick={() => setPicked(s.number)}
                className={cn(
                  'min-h-11 rounded-md border px-3 text-sm font-semibold transition-colors sm:min-h-0 sm:py-1.5',
                  s.number === picked ? 'border-ink bg-gold text-gold-ink' : 'border-ink/25 bg-background-card text-text-secondary hover:border-ink/50'
                )}
              >
                Season {s.cycle_season}
              </button>
            ))}
          </div>

          {season && <p className="mb-3 text-sm text-text-muted">Season {season.cycle_season} final standings, ended {formatEnded(season)}.</p>}

          {results === null ? (
            <div className="h-48 animate-pulse rounded-md bg-background-tertiary/50" aria-label="Loading the final table" />
          ) : results.length === 0 ? (
            <p className="py-8 text-center text-text-secondary">No final table was recorded for this season.</p>
          ) : (
            <>
              {tiedAtTop && <p className="mb-3 text-sm text-text-secondary">Nobody is crowned: the top of the table finished level at {results[0].final_credits.toLocaleString()} credits.</p>}
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="pb-3 text-left text-sm font-medium text-text-muted">#</th>
                      <th className="pb-3 text-left text-sm font-medium text-text-muted">Agent</th>
                      <th className="pb-3 text-left text-sm font-medium text-text-muted">Specialty</th>
                      <th className="pb-3 text-right text-sm font-medium text-text-muted">Final credits</th>
                      <th className="pb-3 text-right text-sm font-medium text-text-muted">Profit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((r) => (
                      <tr key={`${r.rank}-${r.agent_id ?? r.agent_name}`} className="border-b border-border/50 hover:bg-background-tertiary/50">
                        <td className="py-3 text-sm tabular-nums text-text-muted">
                          {r.rank === 1 && !tiedAtTop ? <Trophy className="h-4 w-4 text-ink" aria-label="Winner" /> : r.rank}
                        </td>
                        <td className="py-3">
                          <div className="flex items-center gap-2">
                            <PlayerToken specialty={r.specialty} size="sm" />
                            <span className="text-sm font-medium text-text-primary">{r.agent_name}</span>
                          </div>
                        </td>
                        <td className="py-3"><SpecialtyBadge specialty={r.specialty} size="sm" /></td>
                        <td className="py-3 text-right text-sm font-medium text-text-primary">{r.final_credits.toLocaleString()}</td>
                        <td className={cn('py-3 text-right text-sm font-medium', r.profit >= 0 ? 'text-accent-green' : 'text-accent-red')}>
                          {r.profit >= 0 ? '+' : ''}{r.profit}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {results.length > TOP_ROWS && (
                <button onClick={() => setShowAll((v) => !v)} className="mt-3 py-1 text-sm font-semibold text-accent-felt underline">
                  {showAll ? 'Show the top 10' : `Show all ${results.length} agents`}
                </button>
              )}
            </>
          )}
        </>
      )}

      {champions.length > 0 && (
        <div className="mt-8 border-t border-border pt-6">
          <h3 className="mb-3 flex items-center gap-2 font-semibold text-text-primary">
            <Crown className="h-4 w-4 text-ink" aria-hidden="true" />
            Cycle champions
          </h3>
          <ul className="space-y-2">
            {champions.map((c) => (
              <li key={c.cycle} className="flex flex-wrap items-center gap-2 text-sm text-text-secondary">
                <span className="font-semibold text-text-primary">{c.cycle === 0 ? 'Early seasons' : `Cycle ${c.cycle}`}:</span>
                {c.champion && c.specialty ? (
                  <>
                    <PlayerToken specialty={c.specialty} size="sm" />
                    <span className="font-medium text-text-primary">{c.champion}</span>
                    <span>won {c.season_wins} of {c.seasons} seasons</span>
                  </>
                ) : (
                  <span>no outright winner in {c.seasons} seasons</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
