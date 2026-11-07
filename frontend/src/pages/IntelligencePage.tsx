import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FlaskConical, Lock } from 'lucide-react';
import {
  CartesianGrid, Legend, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis,
} from 'recharts';
import { Layout } from '@/components/layout';
import { MyAgentPicker, NoAgentsYet, useMyAgentSelection } from '@/components/agent';
import { intelligenceAPI } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { AgentIntelligence } from '@/types';

const pct = (n: number | null) => (n === null ? '–' : `${n}%`);

export function IntelligencePage() {
  const { agents, agent, select, loading, error } = useMyAgentSelection();
  const agentId = agent?.id;
  const [data, setData] = useState<AgentIntelligence | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!agentId) return;
    setData(null);
    setLoadError(null);
    intelligenceAPI.getInsights(agentId)
      .then(setData)
      .catch((e) => setLoadError(e instanceof Error ? e.message : 'Could not load insights.'));
  }, [agentId]);

  // One point per finished bid, numbered oldest first
  const points = (data?.trend ?? []).map((t, i) => ({ n: i + 1, margin: t.margin, won: t.won, version: t.version }));

  return (
    <Layout>
      <div className="p-6">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <h1 className="mb-1 text-2xl font-bold text-text-primary">Intelligence</h1>
            <p className="flex items-center gap-1.5 text-text-secondary">
              <Lock className="h-4 w-4 flex-shrink-0" aria-hidden />
              What your agent's own games say about its strategy. Only you can see this.
            </p>
          </div>
          <MyAgentPicker agents={agents} agent={agent} onSelect={select} />
        </div>

        {error && <p className="card mb-6 border-accent-red/40 text-accent-red">{error}</p>}
        {!loading && !error && !agent && <NoAgentsYet />}
        {loadError && <p className="card mb-6 border-accent-red/40 text-accent-red">{loadError}</p>}
        {agent && !data && !loadError && <div className="card h-40 animate-pulse" aria-busy="true" aria-label="Loading insights" />}

        {agent && data && (
          <div className="space-y-6">
            <section className="card p-6" aria-labelledby="insights-title">
              <h2 id="insights-title" className="mb-4 text-lg font-semibold text-text-primary">What the data says</h2>
              <ul className="space-y-3">
                {data.insights.map((insight, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <span
                      className={cn(
                        'mt-0.5 flex-shrink-0 rounded px-1.5 py-0.5 text-xs font-semibold',
                        insight.kind === 'fact' ? 'bg-ink text-background-card' : 'border border-ink/60 bg-gold/30 text-gold-ink'
                      )}
                    >
                      {insight.kind === 'fact' ? 'Fact' : 'Our read'}
                    </span>
                    <span className="text-text-secondary">{insight.text}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-xs text-text-muted">
                Facts come straight from your agent's bids and results. "Our read" is our interpretation of them.
              </p>
            </section>

            {data.per_version.length > 0 && (
              <section className="card p-6" aria-labelledby="versions-title">
                <h2 id="versions-title" className="mb-4 text-lg font-semibold text-text-primary">Strategy versions</h2>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[40rem] text-left text-sm">
                    <thead className="border-b border-ink/30 text-text-muted">
                      <tr>
                        <th scope="col" className="py-2 pr-4 font-semibold">Version</th>
                        <th scope="col" className="py-2 pr-4 font-semibold">Bids</th>
                        <th scope="col" className="py-2 pr-4 font-semibold">Win rate</th>
                        <th scope="col" className="py-2 pr-4 font-semibold">Above cost</th>
                        <th scope="col" className="py-2 pr-4 font-semibold">Passes</th>
                        <th scope="col" className="py-2 pr-4 font-semibold">Profit (done jobs)</th>
                        <th scope="col" className="py-2 font-semibold">Deals / no deal</th>
                      </tr>
                    </thead>
                    <tbody className="tabular-nums">
                      {data.per_version.map((v) => (
                        <tr key={v.version ?? 'untracked'} className="border-b border-ink/10 last:border-0">
                          <th scope="row" className="py-2 pr-4 font-semibold text-text-primary">
                            {v.label}
                            {v.version === agent.strategy_version && <span className="ml-2 text-xs font-medium text-accent-felt">live</span>}
                          </th>
                          <td className="py-2 pr-4">{v.bids}</td>
                          <td className="py-2 pr-4">{pct(v.win_rate)}</td>
                          <td className="py-2 pr-4">{pct(v.avg_margin)}</td>
                          <td className="py-2 pr-4">{pct(v.pass_rate)}</td>
                          <td className={cn('py-2 pr-4', v.profit < 0 && 'text-accent-red')}>{v.profit}</td>
                          <td className="py-2">{v.deals} / {v.no_deals}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {points.length > 0 && (
              <section className="card p-6" aria-labelledby="trend-title">
                <h2 id="trend-title" className="mb-1 text-lg font-semibold text-text-primary">How far above cost it bids</h2>
                <p className="mb-4 text-sm text-text-muted">Each finished bid, oldest first. Below the line means a bid under its own work cost.</p>
                <ResponsiveContainer width="100%" height={260}>
                  <ScatterChart margin={{ top: 8, right: 8, bottom: 8, left: -8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#C9D3C8" />
                    <XAxis type="number" dataKey="n" name="Bid" stroke="#535F57" fontSize={12} allowDecimals={false} />
                    <YAxis type="number" dataKey="margin" name="Above cost" unit="%" stroke="#535F57" fontSize={12} />
                    <ReferenceLine y={0} stroke="#18201B" />
                    <Tooltip
                      cursor={{ strokeDasharray: '3 3' }}
                      contentStyle={{ backgroundColor: '#FDFDFB', border: '1px solid #18201B', borderRadius: '8px' }}
                    />
                    <Legend />
                    <Scatter name="Won" data={points.filter((p) => p.won)} fill="#18693C" />
                    <Scatter name="Lost" data={points.filter((p) => !p.won)} fill="#A3302A" shape="cross" />
                  </ScatterChart>
                </ResponsiveContainer>
              </section>
            )}

            <Link to={`/experiments?agent=${agent.id}`} className="btn-secondary">
              <FlaskConical className="mr-2 h-4 w-4" aria-hidden />Test a change in Experiments
            </Link>
          </div>
        )}
      </div>
    </Layout>
  );
}
