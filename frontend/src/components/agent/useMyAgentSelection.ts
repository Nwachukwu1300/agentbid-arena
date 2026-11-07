import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { agentsAPI } from '@/lib/api';
import type { Agent } from '@/types';

/** The signed-in player's agents, with the chosen one kept in the URL (?agent=id) so links and reloads keep it. */
export function useMyAgentSelection() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [params, setParams] = useSearchParams();

  useEffect(() => {
    agentsAPI.getMyAgents(true)
      .then(setAgents)
      .catch(() => setError('Could not load your agents. Try reloading the page.'))
      .finally(() => setLoading(false));
  }, []);

  const agent = agents.find((a) => a.id === params.get('agent')) ?? agents[0] ?? null;
  const select = (id: string) => setParams({ agent: id }, { replace: true });
  // Lets a page update the chosen agent locally (e.g. credits after an experiment)
  const patchAgent = (id: string, patch: Partial<Agent>) =>
    setAgents((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)));

  return { agents, agent, select, patchAgent, loading, error };
}
