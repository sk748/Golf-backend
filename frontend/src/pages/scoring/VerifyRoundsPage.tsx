// VERIFY ROUNDS — the staff queue of player-entered rounds awaiting
// verification (route /verify-rounds; admin + coach + committee, route guard
// wired in App.tsx by the integrator — plus an in-page defence gate here).
// Verifying a counting round makes the backend recompute the player's handicap
// index; we only DISPLAY the returned value (never WHS math here). The verify
// endpoint is idempotent, so a double-click can't double-apply.

import { useMemo, useState } from 'react';
import {
  CheckCircle2,
  ClipboardCheck,
  Loader2,
  ShieldAlert,
} from 'lucide-react';

import { ApiError } from '../../lib/api';
import { cn } from '../../lib/cn';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { GlassCard } from '../../components/ui/GlassCard';
import { useAuth } from '../../auth/useAuth';
import { usePlayerUsers } from '../coach/coach-evaluations.queries';
import {
  usePendingRounds,
  useVerifyRound,
  type RoundRow,
} from './round-entry.queries';

const ALLOWED_ROLES = ['admin', 'coach', 'committee'] as const;

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return fallback;
}

function fullDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

// Shortened uuid fallback when a name can't be resolved (never fabricate one).
function shortId(id: string | null): string {
  if (!id) return '—';
  return `${id.slice(0, 8)}…`;
}

export function VerifyRoundsPage() {
  const { user } = useAuth();
  const allowed =
    user != null &&
    (ALLOWED_ROLES as readonly string[]).includes(user.role);

  const pending = usePendingRounds();
  const players = usePlayerUsers();
  const verify = useVerifyRound();

  const [verifyingId, setVerifyingId] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  // user_id -> full_name from the cached players list (['users',{role:'player'}]).
  const nameByUserId = useMemo(
    () => new Map((players.data ?? []).map((u) => [u.id, u.full_name])),
    [players.data],
  );

  const nameFor = (userId: string | null): string =>
    (userId && nameByUserId.get(userId)?.trim()) || shortId(userId);

  function handleVerify(round: RoundRow) {
    setVerifyingId(round.id);
    setFeedback(null);
    verify.mutate(round.id, {
      onSuccess: (result) => {
        const who = nameFor(round.user_id);
        setFeedback(
          result.new_handicap_index != null
            ? `Round verified — ${who}'s handicap index updated to ${result.new_handicap_index}.`
            : `Round verified for ${who}.`,
        );
      },
      onSettled: () => setVerifyingId(null),
    });
  }

  // In-page defence gate: route guards are wired by the integrator, but never
  // render the queue (or request it twice) for an out-of-role deep link.
  if (!allowed) {
    return (
      <div className="mx-auto max-w-3xl animate-fade-in-up">
        <GlassCard className="mt-6 px-6 py-16 text-center" data-testid="verify-rounds-denied">
          <ShieldAlert className="mx-auto h-10 w-10 text-slate/60" aria-hidden />
          <p className="mt-4 text-base font-bold text-silver">
            This page is for coaches, committee members and admins
          </p>
          <p className="mt-1 text-sm text-slate">
            Round verification is handled by the coaching team.
          </p>
        </GlassCard>
      </div>
    );
  }

  const rounds = pending.data ?? [];

  return (
    <div className="mx-auto max-w-4xl animate-fade-in-up">
      <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-azure">
        Scoring
      </p>
      <h1 className="mt-1 text-2xl font-black text-silver sm:text-3xl">
        Verify rounds
      </h1>
      <p className="mt-2 max-w-2xl text-sm text-slate">
        Player-entered rounds wait here until a coach confirms them. Verifying a
        counting round updates the player&apos;s handicap index.
      </p>

      {feedback ? (
        <p
          className="mt-4 flex items-center gap-2 rounded-xl bg-emerald-500/10 p-3 text-sm font-bold text-emerald-300"
          data-testid="verify-feedback"
        >
          <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
          {feedback}
        </p>
      ) : null}

      {verify.isError ? (
        <p
          role="alert"
          className="mt-4 rounded-xl bg-red-500/15 p-3 text-sm text-red-400"
          data-testid="verify-error"
        >
          {errorMessage(verify.error, 'Could not verify the round. Please try again.')}
        </p>
      ) : null}

      <div className="mt-6">
        {pending.isLoading ? (
          <div className="flex items-center gap-3 py-12 text-sm text-slate">
            <Loader2 className="h-5 w-5 animate-spin text-azure" aria-hidden />
            Loading pending rounds…
          </div>
        ) : pending.isError ? (
          <div
            role="alert"
            className="rounded-xl bg-red-500/15 p-4 text-sm text-red-400"
            data-testid="pending-error"
          >
            {errorMessage(pending.error, 'Could not load the verification queue.')}
          </div>
        ) : rounds.length === 0 ? (
          <GlassCard className="px-6 py-16 text-center" data-testid="pending-empty">
            <ClipboardCheck className="mx-auto h-10 w-10 text-slate/60" aria-hidden />
            <p className="mt-4 text-base font-bold text-silver">
              No rounds waiting for verification.
            </p>
            <p className="mt-1 text-sm text-slate">
              New player-entered rounds will appear here.
            </p>
          </GlassCard>
        ) : (
          <GlassCard className="overflow-hidden" data-testid="pending-queue">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">
                  Pending rounds with player, date, gross score, differential,
                  handicap flag and entered-by.
                </caption>
                <thead>
                  <tr className="border-b border-white/5 text-xs uppercase tracking-wider text-slate">
                    <th scope="col" className="px-4 py-3 font-bold">
                      Player
                    </th>
                    <th scope="col" className="px-4 py-3 font-bold">
                      Date
                    </th>
                    <th scope="col" className="px-4 py-3 text-right font-bold">
                      Gross
                    </th>
                    <th scope="col" className="px-4 py-3 text-right font-bold">
                      Differential
                    </th>
                    <th scope="col" className="px-4 py-3 font-bold">
                      Handicap
                    </th>
                    <th scope="col" className="px-4 py-3 font-bold">
                      Entered by
                    </th>
                    <th scope="col" className="px-4 py-3">
                      <span className="sr-only">Verify</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rounds.map((round) => {
                    const busy = verifyingId === round.id && verify.isPending;
                    return (
                      <tr
                        key={round.id}
                        data-testid={`pending-round-${round.id}`}
                        className={cn(
                          'border-b border-white/5 last:border-0',
                          'transition-colors hover:bg-azure/5',
                        )}
                      >
                        <td className="px-4 py-3 font-semibold text-silver">
                          {nameFor(round.user_id)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-silver">
                          {fullDate(round.date_played)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right font-mono font-bold text-silver">
                          {round.gross_score}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right font-mono text-silver">
                          {round.score_differential ?? '—'}
                        </td>
                        <td className="px-4 py-3">
                          {round.counts_toward_handicap ? (
                            <Badge tone="azure">Counts</Badge>
                          ) : (
                            <Badge tone="slate">Practice</Badge>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-slate">
                          {nameFor(round.entered_by)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button
                            type="button"
                            size="sm"
                            disabled={verify.isPending}
                            onClick={() => handleVerify(round)}
                            data-testid={`verify-round-${round.id}`}
                          >
                            {busy ? (
                              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                            ) : (
                              <CheckCircle2 className="h-4 w-4" aria-hidden />
                            )}
                            Verify
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </GlassCard>
        )}
      </div>
    </div>
  );
}
