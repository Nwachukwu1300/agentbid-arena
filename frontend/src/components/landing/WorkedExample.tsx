import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Lock, Pause, RotateCcw } from 'lucide-react';
import { PlayerToken } from '@/components/ui';
import { cn, formatTimeAgo, getSpecialtyLabel } from '@/lib/utils';
import type { Round } from './round';

const STEPS = ['The job', 'Sealed bids', 'The reveal', 'Second price', 'The client', 'Scored'] as const;
const EASE = 'ease-[cubic-bezier(0.16,1,0.3,1)]';
// Board geometry (rem): the job card sits above the row of player mats
const JOB_H = 6;
const GAP = 0.75;
// Autoplay reads at about 300 words a minute, never under 3s a step, and lingers on the key rule
const MS_PER_WORD = 200;
const MIN_STEP_MS = 3000;
const SECOND_PRICE_BONUS_MS = 1500;

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** A real round stepped through like a rulebook example: the page's signature interaction. */
export function WorkedExample({ round }: { round: Round }) {
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);
  const trackRef = useRef<HTMLElement>(null);
  const autoplayed = useRef(false);
  const narrationRef = useRef<HTMLParagraphElement>(null);
  const keepFocus = useRef(false); // the visitor was using the example when the step changed

  const last = STEPS.length - 1;
  const revealed = step >= 2;
  const scored = step === last;
  const n = round.bids.length;
  const winnerIndex = round.bids.findIndex((b) => b.won);
  const winner = round.bids[winnerIndex];
  const call = round.call;
  // A failed haggle leaves the job unfilled: the winner is paid nothing and keeps its token
  const taken = !call || call.deal;
  const finalPay = call ? (call.deal ? call.finalPrice ?? round.pricePaid : 0) : round.pricePaid;
  const profit = finalPay - winner.cost;
  // The coin starts on the mat whose bid set the price (the winner's own when nobody bid more);
  // the second-price step moves it to the winner
  const priceSetter = round.bids.findIndex((b, i) => i > winnerIndex && b.bid === round.pricePaid);
  const coinIndex = step >= 3 || priceSetter === -1 ? winnerIndex : priceSetter;
  const coinLabel = scored && call ? (call.deal ? finalPay : null) : round.pricePaid;
  const colLeft = (i: number) => `calc(${i} * ((100% - ${(n - 1) * GAP}rem) / ${n} + ${GAP}rem))`;
  const colCenter = (i: number) => `calc(${colLeft(i)} + (100% - ${(n - 1) * GAP}rem) / ${n} / 2)`;

  const go = (s: number) => {
    keepFocus.current = !!sectionRef.current?.contains(document.activeElement);
    autoplayed.current = true;
    setPlaying(false);
    setStep(Math.max(0, Math.min(last, s)));
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight') go(step + 1);
    if (e.key === 'ArrowLeft') go(step - 1);
  };

  // Play the round once when it first comes into view; any click or key takes over
  useEffect(() => {
    const el = sectionRef.current;
    if (!el || reducedMotion()) return;
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !autoplayed.current) {
        autoplayed.current = true;
        setPlaying(true);
        io.disconnect();
      }
    }, { threshold: 0.3 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!playing) return;
    if (step === last) return setPlaying(false);
    const words = narrationRef.current?.textContent?.trim().split(/\s+/).length ?? 30;
    const ms = Math.max(MIN_STEP_MS, words * MS_PER_WORD) + (step === 3 ? SECOND_PRICE_BONUS_MS : 0);
    const t = setTimeout(() => setStep((s) => s + 1), ms);
    return () => clearTimeout(t);
  }, [playing, step, last]);

  // Keep the current space of the track in view on narrow screens
  useEffect(() => {
    const track = trackRef.current;
    const current = track?.querySelector<HTMLElement>('[aria-current="step"]');
    if (!track || !current) return;
    track.scrollTo({ left: current.offsetLeft - (track.clientWidth - current.offsetWidth) / 2, behavior: reducedMotion() ? 'auto' : 'smooth' });
  }, [step]);

  // Next and Replay swap at the last step; if the visitor's focus went with the removed button,
  // hand it to the control that replaced it so the arrow keys keep working. Autoplay never moves focus.
  useEffect(() => {
    const section = sectionRef.current;
    if (!keepFocus.current || !section || section.contains(document.activeElement)) return;
    // Two copies of the controls exist (rail and phone bar); focus the one on screen
    const target = [...section.querySelectorAll<HTMLElement>(scored ? '[data-replay]' : '[data-next]')].find((el) => el.offsetParent);
    (target ?? section).focus({ preventScroll: true });
  }, [step, scored, playing]); // playing: the Pause button removes itself when pressed

  const priceSetterName = priceSetter === -1 ? null : round.bids[priceSetter].name;
  const narration = [
    <>A <strong>{getSpecialtyLabel(round.specialty)}</strong> job goes on the board with a budget of <strong>{round.budget} credits</strong>. Only {getSpecialtyLabel(round.specialty).toLowerCase()} agents may bid. Each mat shows that agent&rsquo;s private work cost; rivals never see it.</>,
    <>Each agent bids once, in secret, following its owner&rsquo;s written strategy. Nobody sees a rival&rsquo;s bid.</>,
    <>The bids are revealed. {winnerIndex === 0
      ? <>The lowest bid wins: <strong>{winner.name}</strong> at <strong>{winner.bid}</strong>.</>
      : <><strong>{winner.name}</strong> wins at <strong>{winner.bid}</strong>: the lower {winnerIndex === 1 ? 'bid came from an agent that was' : 'bids came from agents that were'} full or out of credits, so {winnerIndex === 1 ? 'it' : 'they'} couldn&rsquo;t take the job.</>}{priceSetterName && <> The gold coin on {priceSetterName}&rsquo;s bid is the price the winner will be paid; the next step explains why.</>}</>,
    round.pricePaid > winner.bid
      ? <>The winner is paid the runner-up&rsquo;s bid, not its own: <strong>{round.pricePaid} credits</strong>, against a work cost of {winner.cost}. Bidding your true cost is safe; you can&rsquo;t raise your own pay by bidding higher.{call && <> This client wants to haggle first, so {round.pricePaid} is only the opening price.</>}</>
      : <>Nobody bid above the winner, so it is paid its own bid: <strong>{round.pricePaid} credits</strong>, against a work cost of {winner.cost}.{call && <> This client wants to haggle first, so that is only the opening price.</>}</>,
    call
      ? <>The client has a secret limit and a personality; the agent follows its owner&rsquo;s negotiation style. Now the card is turned over: a <strong>{call.personality}</strong> client who would have paid up to <strong>{call.limit}</strong>. <strong>{call.outcome}</strong></>
      : <>No call this round: the job went straight to work. About 3 in 10 wins go to a negotiation with the client first.</>,
    taken
      ? <><strong>{winner.name}</strong> takes the job at <strong>{finalPay} credits</strong> against a work cost of {winner.cost}: a profit of <strong>{profit}</strong>. Below, every agent&rsquo;s result is explained.</>
      : <>No deal, so the job goes unfilled and <strong>{winner.name}</strong> earns nothing this round. Below, every agent&rsquo;s result is explained.</>,
  ];

  const controls = (
    <div className="flex flex-wrap items-center gap-2">
      {scored ? (
        <>
          <Link to="/auctions" className="btn-primary h-11 min-w-fit flex-1 whitespace-nowrap">
            Watch the live arena <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
          </Link>
          <button data-replay type="button" className="btn-secondary h-11 min-w-11 px-3 sm:px-4" onClick={() => go(0)} aria-label="Replay the round">
            <RotateCcw className="h-4 w-4 sm:mr-2" aria-hidden /><span className="hidden sm:inline">Replay</span>
          </button>
        </>
      ) : (
        <>
          <button type="button" className="btn-secondary h-11 w-11 px-0" onClick={() => go(step - 1)} disabled={step === 0} aria-label="Previous step">
            <ArrowLeft className="h-4 w-4" />
          </button>
          {playing && (
            <button type="button" className="btn-secondary h-11 w-11 px-0" onClick={() => go(step)} aria-label="Pause the round">
              <Pause className="h-4 w-4" />
            </button>
          )}
          <button data-next type="button" className="btn-primary h-11 flex-1" onClick={() => go(step + 1)}>
            Next: {STEPS[step + 1]}
            <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
          </button>
        </>
      )}
    </div>
  );

  return (
    <section
      ref={sectionRef}
      tabIndex={-1}
      aria-labelledby="example-title"
      className="card overflow-clip p-0 focus:outline-none"
      onKeyDown={onKey}
      // Clicking anywhere on the example (not just a button) lets the arrow keys drive it
      onPointerDown={(e) => {
        if (!(e.target as HTMLElement).closest('button, a, summary')) sectionRef.current?.focus({ preventScroll: true });
      }}
    >
      <header className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-ink/80 bg-background-tertiary px-5 py-4 sm:px-7">
        <h3 id="example-title" className="text-xl font-bold sm:text-2xl">
          Example: <span className="font-semibold">{round.jobTitle}</span>
        </h3>
        <p className="text-sm text-text-muted">
          {round.id
            ? <>A real round from the live arena{round.closedAt ? `, ${formatTimeAgo(round.closedAt)}` : ''}</>
            : <strong className="text-accent-red">Sample round, not live data.</strong>}
        </p>
      </header>

      {/* The round track: one row of spaces, the job's token on the current one */}
      <nav ref={trackRef} aria-label="Steps of the round" className="relative overflow-x-auto border-b border-ink/20 px-5 py-4 sm:px-7">
        <ol className="flex min-w-max items-center">
          {STEPS.map((label, i) => (
            <li key={label} className="flex items-center">
              {i > 0 && <span aria-hidden className={cn('h-0.5 w-6 sm:w-10', i <= step ? 'bg-ink' : 'bg-ink/20')} />}
              <button
                type="button"
                onClick={() => go(i)}
                aria-current={i === step ? 'step' : undefined}
                className={cn(
                  'flex min-h-11 items-center gap-2 rounded-full border px-3 text-xs font-semibold transition-colors sm:min-h-0 sm:py-1.5',
                  i === step ? 'border-ink bg-background-card text-text-primary shadow-piece' : i < step ? 'border-ink/60 bg-background-tertiary text-text-secondary' : 'border-ink/20 bg-background-card text-text-muted hover:border-ink/50'
                )}
              >
                {i === step
                  ? <PlayerToken specialty={round.specialty} size="sm" />
                  : <span className="w-4 text-center tabular-nums">{i + 1}</span>}
                {label}
              </button>
            </li>
          ))}
        </ol>
      </nav>

      <div className="grid gap-8 px-5 py-6 sm:px-7 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="min-w-0">
          {/* The board: the job card above one player mat per bidder */}
          <div className="-mx-1 overflow-x-auto px-1 pb-6">
            <div className="relative" style={{ minWidth: `${n * 7.5 + (n - 1) * GAP}rem` }}>
              <div
                className={cn(
                  'flex items-center justify-between gap-4 rounded-lg border-2 border-ink bg-background-card px-4 transition-shadow duration-500',
                  step === 0 ? 'shadow-lifted ring-2 ring-gold' : 'shadow-piece'
                )}
                style={{ height: `${JOB_H}rem` }}
              >
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-text-muted">
                    <PlayerToken specialty={round.specialty} size="xs" />
                    {getSpecialtyLabel(round.specialty)} job
                  </p>
                  <p className="mt-1 line-clamp-2 font-bold leading-snug">{round.jobTitle}</p>
                  <p className="text-sm text-text-secondary">Budget {round.budget}</p>
                </div>
                <p className={cn('flex-shrink-0 text-right text-xs font-semibold transition-[opacity,visibility] duration-500', taken && 'pr-9', scored ? 'visible opacity-100' : 'invisible opacity-0')}>
                  {taken
                    ? <>Taken by<span className="block text-sm text-text-primary">{winner.name}</span><span className="block text-accent-green">Profit {profit}</span></>
                    : <span className="text-sm text-accent-red">Unfilled: no deal</span>}
                </p>
              </div>

              <div className="mt-3 grid" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))`, gap: `${GAP}rem` }}>
                {round.bids.map((b, i) => {
                  const isWinner = revealed && b.won;
                  return (
                    <div
                      key={b.name}
                      className={cn(
                        'relative rounded-lg border bg-background-card p-3 pb-7 transition-[box-shadow,border-color] duration-500',
                        isWinner ? 'border-ink shadow-lifted ring-2 ring-gold' : 'border-ink/30'
                      )}
                    >
                      <div className="flex items-center gap-2">
                        {/* The winner's token is drawn by the travelling piece below; its seat shows as an empty ring once it leaves */}
                        {b.won
                          ? <span aria-hidden className={cn('h-4 w-4 flex-shrink-0 rounded-full border border-dashed', scored && taken ? 'border-ink/40' : 'border-transparent')} />
                          : <PlayerToken specialty={b.specialty} size="sm" />}
                        <span className="truncate text-sm font-semibold">{b.name}</span>
                      </div>
                      <p className="mt-1 text-xs text-text-muted">Work cost {b.cost}</p>
                      <div
                        className={cn(
                          'mt-3 flex h-14 items-center justify-center rounded-md border text-2xl font-bold transition-colors duration-500',
                          step === 0 && 'border-dashed border-ink/25 text-xs font-semibold text-text-muted',
                          step === 1 && 'border-ink/40 bg-[repeating-linear-gradient(135deg,#DCE4DA_0_6px,#F1F4F0_6px_12px)] text-text-muted',
                          revealed && (isWinner ? 'border-ink bg-gold text-gold-ink' : 'border-ink/30 bg-background-tertiary text-text-secondary')
                        )}
                        aria-label={step === 0 ? 'Has not bid yet' : step === 1 ? 'Sealed bid' : `Bid ${b.bid}`}
                      >
                        {step === 0 ? 'Not bid yet' : step === 1 ? <Lock className="h-5 w-5" aria-hidden /> : b.bid}
                      </div>
                      {revealed && <p className={cn('mt-2 text-xs font-semibold', isWinner ? 'text-text-primary' : 'text-text-muted')}>{isWinner ? (winnerIndex === 0 ? 'Lowest bid: wins' : 'Lowest that could take it: wins') : i < winnerIndex ? 'Couldn’t take the job' : 'Higher bid'}</p>}
                    </div>
                  );
                })}
              </div>

              {/* The winner's token: on its mat until it travels onto the job card (only if it got the job) */}
              <span
                aria-hidden
                className={cn('pointer-events-none absolute transition-[left,top] duration-700', EASE)}
                style={scored && taken
                  ? { left: 'calc(100% - 2.25rem)', top: `calc(${JOB_H / 2}rem - 0.5rem)` }
                  : { left: `calc(${colLeft(winnerIndex)} + 0.75rem)`, top: `calc(${JOB_H}rem + 0.75rem + 0.75rem + 2px)` }}
              >
                <PlayerToken specialty={winner.specialty} size="sm" />
              </span>

              {/* The price coin: what the winner is paid */}
              {step >= 2 && coinLabel !== null && (
                <div
                  aria-hidden
                  className={cn('pointer-events-none absolute -bottom-4 flex h-9 min-w-9 -translate-x-1/2 items-center justify-center rounded-full border-2 border-ink bg-gold px-2 text-xs font-bold text-gold-ink shadow-piece transition-[left] duration-700', EASE)}
                  style={{ left: colCenter(coinIndex) }}
                >
                  {coinLabel}
                </div>
              )}
            </div>
          </div>

          {step >= 4 && call && (
            <div className="mt-6 rounded-lg border border-ink/30 bg-background-tertiary p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <p className="text-sm font-bold">The client&rsquo;s card</p>
                <p className="text-sm text-text-secondary">
                  <span className="font-semibold capitalize text-text-primary">{call.personality}</span> · secret limit <strong className="text-text-primary">{call.limit}</strong>
                </p>
              </div>
              {/* The haggle as a price ladder: one rung per turn */}
              <p id="offers-label" className="mt-3 text-xs font-semibold text-text-muted">Offers, in order</p>
              <ol aria-labelledby="offers-label" className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-2 text-sm">
                {call.lines.map((l, i) => (
                  <li key={i} className="flex items-center gap-1.5">
                    {i > 0 && <ArrowRight className="h-3.5 w-3.5 text-text-muted" aria-hidden />}
                    <span className={cn('rounded-full border px-2.5 py-1 tabular-nums', l.move.startsWith('accepts') ? 'border-ink bg-gold font-bold text-gold-ink' : 'border-ink/30 bg-background-card')}>
                      <span className="font-semibold">{l.speaker === 'client' ? 'Client' : winner.name}</span> {l.move.replace(/^offers /, '')}
                    </span>
                  </li>
                ))}
              </ol>
              <p className={cn('mt-3 text-sm font-bold', call.deal ? 'text-text-primary' : 'text-accent-red')}>{call.outcome}</p>
              <details className="mt-2 text-sm">
                <summary className="cursor-pointer font-semibold text-accent-felt">Read the conversation</summary>
                <div className="mt-2 space-y-2">
                  {call.lines.map((l, i) => (
                    <p key={i}>
                      <span className="font-semibold">{l.speaker === 'client' ? 'Client' : winner.name}</span>
                      <span className="text-text-muted"> · {l.move}</span>
                      <span className="mt-0.5 block text-text-secondary">{l.text}</span>
                    </p>
                  ))}
                </div>
              </details>
            </div>
          )}

          {scored && (
            <ul className="mt-6 space-y-2">
              {round.bids.map((b) => (
                <li key={b.name} className="flex gap-3 text-sm">
                  <PlayerToken specialty={b.specialty} size="sm" className="mt-0.5" />
                  <span><strong>{b.name}.</strong> <span className="text-text-secondary">{b.explanation}</span></span>
                </li>
              ))}
              {call && (
                <li className="pl-7 text-sm text-text-secondary">
                  {call.deal
                    ? `The client would have paid up to ${call.limit}; ${winner.name} settled at ${finalPay}${call.limit > finalPay ? `, leaving ${call.limit - finalPay} on the table` : ''}.`
                    : `The client would have paid up to ${call.limit}, but no price was agreed.`}
                </li>
              )}
            </ul>
          )}
        </div>

        {/* The rulebook column: what this step means */}
        <div className="flex flex-col">
          <p ref={narrationRef} className="min-h-[7.5rem] text-base leading-relaxed text-text-secondary" aria-live={playing ? 'off' : 'polite'}>{narration[step]}</p>
          <div className="mt-auto hidden pt-4 lg:block">{controls}</div>
          {round.id && scored && (
            <Link to={`/auctions/${round.id}`} className="mt-3 text-sm font-semibold text-accent-felt underline">
              See the full round, with every decision
            </Link>
          )}
        </div>
      </div>

      {/* Phones and tablets: the controls stay under the thumb while the card is on screen */}
      <div className="sticky bottom-0 border-t border-ink/20 bg-background-card px-5 py-3 lg:hidden">{controls}</div>
    </section>
  );
}
