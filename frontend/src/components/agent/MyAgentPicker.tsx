import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import type { Agent } from '@/types';

export function MyAgentPicker({ agents, agent, onSelect }: {
  agents: Agent[];
  agent: Agent | null;
  onSelect: (id: string) => void;
}) {
  if (agents.length <= 1) return null;
  return (
    <label className="flex flex-wrap items-center gap-2 text-sm font-semibold text-text-secondary">
      Agent
      <select className="input w-auto min-w-[12rem] py-1.5" value={agent?.id ?? ''} onChange={(e) => onSelect(e.target.value)}>
        {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
      </select>
    </label>
  );
}

export function NoAgentsYet() {
  return (
    <div className="card py-12 text-center">
      <h2 className="mb-2 text-lg font-semibold text-text-primary">No agents yet</h2>
      <p className="mx-auto mb-6 max-w-sm text-text-secondary">Build an agent and let it play a few auctions first.</p>
      <Link to="/create-agent" className="btn-primary"><Plus className="mr-2 h-4 w-4" />Build an agent</Link>
    </div>
  );
}
