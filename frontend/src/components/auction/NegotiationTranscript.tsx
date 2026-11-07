import { Bot, Briefcase, MessagesSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Negotiation, NegotiationMessage } from '@/types';

const END_REASONS: Record<NonNullable<Negotiation['end_reason']>, string> = {
  accepted: 'Offer accepted',
  agent_walked: 'The agent walked away',
  client_walked: 'The client walked away',
  max_turns: 'Ran out of messages',
  season_ended: 'The season ended first',
};

function moveLabel(m: NegotiationMessage) {
  if (m.action === 'accept') return `accepts ${m.offer}`;
  if (m.action === 'walk_away') return 'walks away';
  return `offers ${m.offer}`;
}

/** Chat-style replay of the winner haggling with the client. Secrets appear only once it has ended. */
export function NegotiationTranscript({ negotiation, agentName }: { negotiation: Negotiation; agentName: string | null }) {
  const n = negotiation;
  const live = n.status === 'active';
  const status = live ? 'Negotiating' : n.status === 'deal' ? `Deal at ${n.final_price}` : 'No deal';

  return (
    <div className="card mb-6">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
        <h2 className="font-semibold text-text-primary flex items-center gap-2">
          <MessagesSquare className="h-4 w-4 text-text-muted" />
          Price negotiation
        </h2>
        <span
          className={cn(
            'rounded px-2 py-0.5 text-xs font-medium',
            live && 'bg-accent-felt/20 text-accent-felt animate-pulse',
            n.status === 'deal' && 'bg-accent-green/10 text-accent-green',
            n.status === 'no_deal' && 'bg-accent-red/10 text-accent-red'
          )}
        >
          {status}
        </span>
      </div>
      <p className="text-sm text-text-muted mb-4">
        The client wanted to talk price before work started. Opening price {n.opening_price} (the auction price), work
        cost {n.work_cost}.
      </p>

      <div className="space-y-3">
        {n.messages.length === 0 && live && <p className="text-sm text-text-muted">The client is reading the offer...</p>}
        {n.messages.map((m) => {
          const isAgent = m.speaker === 'agent';
          return (
            <div key={m.turn_number} className={cn('flex gap-3', isAgent && 'flex-row-reverse')}>
              <div
                className={cn(
                  'flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center',
                  isAgent ? 'bg-accent-felt/20' : 'bg-accent-blue/20'
                )}
                aria-hidden
              >
                {isAgent ? <Bot className="h-4 w-4 text-accent-felt" /> : <Briefcase className="h-4 w-4 text-accent-blue" />}
              </div>
              <div
                className={cn(
                  'rounded-lg px-4 py-2 max-w-[80%]',
                  isAgent ? 'bg-accent-felt/10' : 'bg-background-tertiary'
                )}
              >
                <p className="text-xs text-text-muted mb-1">
                  {isAgent ? agentName ?? 'Agent' : 'Client'} ·{' '}
                  <span className="font-medium text-text-primary">{moveLabel(m)}</span>
                  {m.was_fallback && ' · automatic (no usable reply)'}
                </p>
                <p className="text-sm text-text-primary whitespace-pre-wrap">{m.message}</p>
              </div>
            </div>
          );
        })}
      </div>

      {!live && (
        <div className="mt-4 p-3 rounded-lg bg-background-tertiary/50 text-sm">
          <p className="text-text-primary mb-1">{n.explanation}</p>
          <p className="text-text-muted">
            {n.end_reason && `${END_REASONS[n.end_reason]}. `}
            Client's secret limit: <span className="text-text-primary font-medium">{n.client_max_price}</span>
            {' · '}personality: <span className="text-text-primary font-medium capitalize">{n.client_personality}</span>
          </p>
        </div>
      )}
    </div>
  );
}
