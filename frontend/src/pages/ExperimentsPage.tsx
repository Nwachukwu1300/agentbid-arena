import { useEffect, useState } from 'react';
import { FlaskConical, Lock } from 'lucide-react';
import { Layout } from '@/components/layout';
import { MyAgentPicker, NoAgentsYet, useMyAgentSelection } from '@/components/agent';
import { intelligenceAPI } from '@/lib/api';
import { cn, formatTimeAgo } from '@/lib/utils';
import type { Experiment, ReplayRun, StrategyVersion } from '@/types';

const COST = 20; // mirrors experiment_cost in backend/app/config.py
const OUTCOME = { won: 'Won', lost: 'Lost', passed: 'Passed', over_budget: 'Over budget' } as const;

function RunCell({ run }: { run: ReplayRun }) {
  return (
    <td className="py-2 pr-4">
      <span className="font-semibold text-text-primary">{run.bid ?? '–'}</span>{' '}
      <span className={cn('text-xs font-medium', run.outcome === 'won' ? 'text-accent-green' : 'text-text-muted')}>
        {OUTCOME[run.outcome]}
      </span>
      {run.outcome === 'won' && (
        <span className={cn('ml-1 text-xs', run.profit < 0 ? 'text-accent-red' : 'text-text-secondary')}>
          ({run.profit >= 0 ? '+' : ''}{run.profit})
        </span>
      )}
    </td>
  );
}

function Result({ experiment }: { experiment: Experiment }) {
  const { summary, why, auctions } = experiment.result;
  const best = summary.a.profit === summary.b.profit ? null : summary.a.profit > summary.b.profit ? 'a' : 'b';
  return (
    <section className="space-y-6" aria-labelledby="result-title">
      <h2 id="result-title" className="text-lg font-semibold text-text-primary">
        {summary.a.label} vs {summary.b.label}
        <span className="ml-2 text-sm font-normal text-text-muted">{formatTimeAgo(experiment.created_at)}</span>
      </h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {(['a', 'b'] as const).map((key) => {
          const s = summary[key];
          return (
            <div key={key} className={cn('card', best === key && 'border-2 border-accent-green')}>
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="font-semibold text-text-primary">{s.label}</span>
                {best === key && <span className="rounded bg-accent-green/10 px-1.5 py-0.5 text-xs font-semibold text-accent-green">Earned more</span>}
              </div>
              <p className={cn('text-2xl font-bold tabular-nums', s.profit < 0 ? 'text-accent-red' : 'text-text-primary')}>
                {s.profit >= 0 ? '+' : ''}{s.profit} credits
              </p>
              <p className="mt-1 text-sm text-text-secondary">
                {s.wins} won · {s.losses} lost · {s.passes} passed
                {s.avg_margin !== null && <> · bids {s.avg_margin}% above cost</>}
              </p>
            </div>
          );
        })}
      </div>

      <div className="card p-6">
        <h3 className="mb-3 font-semibold text-text-primary">Why</h3>
        <ul className="list-disc space-y-1.5 pl-5 text-text-secondary">
          {why.map((line, i) => <li key={i}>{line}</li>)}
        </ul>
      </div>

      <div className="card p-6">
        <h3 className="mb-3 font-semibold text-text-primary">Auction by auction</h3>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead className="border-b border-ink/30 text-text-muted">
              <tr>
                <th scope="col" className="py-2 pr-4 font-semibold">Job</th>
                <th scope="col" className="py-2 pr-4 font-semibold">Budget</th>
                <th scope="col" className="py-2 pr-4 font-semibold">Your cost</th>
                <th scope="col" className="py-2 pr-4 font-semibold">Best rival</th>
                <th scope="col" className="py-2 pr-4 font-semibold">{summary.a.label}</th>
                <th scope="col" className="py-2 pr-4 font-semibold">{summary.b.label}</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {auctions.map((row) => (
                <tr key={row.auction_id} className="border-b border-ink/10 last:border-0">
                  <th scope="row" className="max-w-[14rem] truncate py-2 pr-4 font-medium text-text-primary" title={row.job_title}>{row.job_title}</th>
                  <td className="py-2 pr-4">{row.budget}</td>
                  <td className="py-2 pr-4">{row.work_cost}</td>
                  <td className="py-2 pr-4">{row.best_rival_bid}</td>
                  <RunCell run={row.runs.a} />
                  <RunCell run={row.runs.b} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <details className="mt-4">
          <summary className="cursor-pointer text-sm font-semibold text-accent-felt">Show the agent's reasoning</summary>
          <div className="mt-3 space-y-3">
            {auctions.map((row) => (
              <div key={row.auction_id} className="rounded-lg bg-background-tertiary p-3 text-sm">
                <p className="mb-1 font-medium text-text-primary">{row.job_title}</p>
                <p className="text-text-secondary"><span className="font-semibold">{summary.a.label}:</span> {row.runs.a.reasoning}</p>
                <p className="text-text-secondary"><span className="font-semibold">{summary.b.label}:</span> {row.runs.b.reasoning}</p>
              </div>
            ))}
          </div>
        </details>
      </div>
    </section>
  );
}

export function ExperimentsPage() {
  const { agents, agent, select, patchAgent, loading, error } = useMyAgentSelection();
  const agentId = agent?.id;
  const [versions, setVersions] = useState<StrategyVersion[]>([]);
  const [history, setHistory] = useState<Experiment[]>([]);
  const [shown, setShown] = useState<Experiment | null>(null);
  const [versionA, setVersionA] = useState<number | null>(null);
  const [mode, setMode] = useState<'version' | 'draft'>('draft');
  const [versionB, setVersionB] = useState<number | null>(null);
  const [draft, setDraft] = useState('');
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);

  useEffect(() => {
    if (!agentId) return;
    setShown(null);
    setRunError(null);
    Promise.all([intelligenceAPI.getVersions(agentId), intelligenceAPI.listExperiments(agentId)])
      .then(([v, h]) => {
        setVersions(v);
        setHistory(h);
        setShown(h[0] ?? null);
        setVersionA(v[0]?.version ?? null); // newest first
        setVersionB(v[1]?.version ?? null);
        setMode(v.length > 1 ? 'version' : 'draft');
        setDraft(v[0]?.auction_instructions ?? '');
      })
      .catch((e) => setRunError(e instanceof Error ? e.message : 'Could not load experiments.'));
  }, [agentId]);

  const canAfford = !!agent && agent.credits >= COST;
  const ready = versionA !== null && (mode === 'draft' ? draft.trim().length > 0 : versionB !== null && versionB !== versionA);

  const run = async () => {
    if (!agent || versionA === null) return;
    setRunning(true);
    setRunError(null);
    try {
      const result = await intelligenceAPI.runExperiment(agent.id, mode === 'draft'
        ? { version_a: versionA, draft_instructions: draft }
        : { version_a: versionA, version_b: versionB ?? undefined });
      setHistory((prev) => [result, ...prev]);
      setShown(result);
      if (result.credits_left !== undefined) patchAgent(agent.id, { credits: result.credits_left });
    } catch (e) {
      setRunError(e instanceof Error ? e.message : 'The experiment failed.');
    } finally {
      setRunning(false);
    }
  };

  const label = (e: Experiment) => `Version ${e.version_a} vs ${e.version_b ? `Version ${e.version_b}` : 'Draft'}`;

  return (
    <Layout>
      <div className="p-6">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0 max-w-2xl">
            <h1 className="mb-1 text-2xl font-bold text-text-primary">Experiments</h1>
            <p className="text-text-secondary">
              Replay two strategies on the same recent auctions, against the bids rivals really made.
              Live play only sees the {COST}-credit fee.
            </p>
          </div>
          <MyAgentPicker agents={agents} agent={agent} onSelect={select} />
        </div>

        {error && <p className="card mb-6 border-accent-red/40 text-accent-red">{error}</p>}
        {!loading && !error && !agent && <NoAgentsYet />}

        {agent && (
          <div className="space-y-6">
            <section className="card p-6" aria-labelledby="setup-title">
              <h2 id="setup-title" className="mb-4 text-lg font-semibold text-text-primary">Set up a run</h2>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <label className="block text-sm font-semibold text-text-secondary">
                  Strategy A
                  <select
                    className="input mt-1 font-normal"
                    value={versionA ?? ''}
                    onChange={(e) => setVersionA(Number(e.target.value))}
                  >
                    {versions.map((v) => (
                      <option key={v.version} value={v.version}>
                        Version {v.version}{v.version === agent.strategy_version ? ' (live)' : ''}
                      </option>
                    ))}
                  </select>
                </label>

                <fieldset>
                  <legend className="text-sm font-semibold text-text-secondary">Strategy B</legend>
                  <div className="mt-1 flex gap-4 text-sm">
                    <label className="flex items-center gap-1.5">
                      <input type="radio" name="b-mode" checked={mode === 'draft'} onChange={() => setMode('draft')} />
                      A draft
                    </label>
                    <label className={cn('flex items-center gap-1.5', versions.length < 2 && 'opacity-50')}>
                      <input type="radio" name="b-mode" checked={mode === 'version'} disabled={versions.length < 2} onChange={() => setMode('version')} />
                      A saved version
                    </label>
                  </div>
                  {mode === 'version' && (
                    <select
                      aria-label="Strategy B version"
                      className="input mt-2"
                      value={versionB ?? ''}
                      onChange={(e) => setVersionB(Number(e.target.value))}
                    >
                      {versions.filter((v) => v.version !== versionA).map((v) => (
                        <option key={v.version} value={v.version}>Version {v.version}</option>
                      ))}
                    </select>
                  )}
                </fieldset>
              </div>

              {mode === 'draft' && (
                <label className="mt-4 block text-sm font-semibold text-text-secondary">
                  Draft strategy (not saved, not used in live play)
                  <textarea
                    className="input mt-1 h-40 resize-y font-normal"
                    value={draft}
                    maxLength={8000}
                    onChange={(e) => setDraft(e.target.value)}
                  />
                </label>
              )}

              <div className="mt-4 flex flex-wrap items-center gap-4">
                <button className="btn-primary" onClick={run} disabled={!ready || !canAfford || running}>
                  <FlaskConical className="mr-2 h-4 w-4" aria-hidden />
                  {running ? 'Replaying auctions…' : `Run for ${COST} credits`}
                </button>
                <p className="text-sm text-text-muted" aria-live="polite">
                  {running
                    ? 'This takes about 15 seconds.'
                    : `Costs ${COST} of ${agent.name}'s season credits (has ${agent.credits}).`}
                  {!canAfford && !running && ' Not enough credits until the next season.'}
                </p>
              </div>
              {runError && <p className="mt-3 text-sm text-accent-red" role="alert">{runError}</p>}
              <p className="mt-4 flex items-center gap-1.5 text-xs text-text-muted">
                <Lock className="h-3.5 w-3.5" aria-hidden />Only you can see your experiments.
              </p>
            </section>

            {shown && <Result experiment={shown} />}

            {history.length > 1 && (
              <section className="card p-6" aria-labelledby="history-title">
                <h2 id="history-title" className="mb-3 text-lg font-semibold text-text-primary">Past runs</h2>
                <ul className="space-y-1">
                  {history.map((e) => (
                    <li key={e.id}>
                      <button
                        onClick={() => setShown(e)}
                        className={cn(
                          'flex w-full flex-wrap justify-between gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-background-hover',
                          shown?.id === e.id && 'bg-background-tertiary font-semibold'
                        )}
                      >
                        <span>{label(e)}</span>
                        <span className="text-text-muted">
                          {e.result.summary.a.profit} vs {e.result.summary.b.profit} · {formatTimeAgo(e.created_at)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}
