// Match-play BRACKET — shared view for all signed-in roles, with management
// controls (generate the draw, confirm entries, record results) gated to
// admin/coach. THE BACKEND OWNS ALL BRACKET LOGIC: seeding, stroke allocation,
// and advancing the winner. The frontend only renders the draw and records the
// winner the user picks — it never computes a result or who advances.
//
// Route: /tournaments/:id/bracket (wired by the parent). Non match-play events
// get a clear empty state and nothing else.

import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  CheckCircle2,
  GitFork,
  Loader2,
  Shuffle,
  Swords,
  Trophy,
  UserCheck,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';

import { ApiError, api } from '../../lib/api';
import { cn } from '../../lib/cn';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { GlassCard } from '../../components/ui/GlassCard';
import { useAuth } from '../../auth/useAuth';
import {
  formatLabel,
  statusLabel,
  statusTone,
  useTournament,
  type Tournament,
} from './tournaments.queries';
import {
  entryStatusLabel,
  entryStatusTone,
  useTournamentEntries,
  type TournamentEntry,
} from './tournament-entries.queries';
import {
  matchStatusLabel,
  matchStatusTone,
  roundLabel,
  useBracket,
  useConfirmEntry,
  useGenerateBracket,
  useUpdateMatch,
  type Bracket,
  type BracketSeed,
  type TournamentMatch,
} from './tournament-bracket.queries';

// ── Juniors name map (same pattern as TournamentEnterScoresPage) ──────────────
// GET /api/juniors (admin/coach see all) embeds full_name per row. Matches
// reference ENTRY ids, so to name a player we go entry_id → junior_id (from the
// roster) → name. Shares the ['juniors','all'] cache key used elsewhere.
//
// PRIVACY: the club-wide roster is admin/coach only. Parent/player can also reach
// this bracket route, but must NEVER request /api/juniors — so the query is gated
// via `enabled`. For non-managers the map is empty and slot names fall back to
// the `Golfer #id` / `Entry #id` labels, which is correct: they shouldn't see
// other families' children's names anyway.

interface JuniorWithName {
  id: number;
  full_name?: string;
}

function useJuniorNames(enabled: boolean): {
  nameFor: (juniorId: number) => string;
  isLoading: boolean;
  isError: boolean;
} {
  const query = useQuery({
    queryKey: ['juniors', 'all'],
    queryFn: () => api.get<JuniorWithName[]>('/api/juniors'),
    staleTime: 60 * 1000,
    enabled,
  });
  const byId = new Map<number, string>();
  for (const j of query.data ?? []) {
    if (j.full_name?.trim()) byId.set(j.id, j.full_name.trim());
  }
  return {
    nameFor: (juniorId: number) => byId.get(juniorId) ?? `Golfer #${juniorId}`,
    isLoading: query.isLoading,
    isError: query.isError,
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return fallback;
}

function generateMessage(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'INVALID_FORMAT':
        return error.message || 'Brackets are only for match-play events.';
      case 'NOT_ENOUGH_ENTRIES':
        return (
          error.message || 'At least two confirmed entries are needed to draw a bracket.'
        );
      default:
        return error.message;
    }
  }
  if (error instanceof Error) return error.message;
  return 'Could not generate the bracket. Please try again.';
}

function isManager(role: string | undefined): boolean {
  return role === 'admin' || role === 'coach';
}

function bracketIsEmpty(bracket: Bracket | undefined): boolean {
  if (!bracket) return true;
  return !bracket.rounds.some((r) => r.matches.length > 0);
}

function BackLink({ id }: { id: number }) {
  return (
    <Link
      to={`/tournaments/${id}`}
      className="inline-flex items-center gap-1.5 rounded text-sm font-semibold text-slate transition-colors hover:text-azure focus:outline-none focus-visible:ring-2 focus-visible:ring-azure/50"
      data-testid="bracket-back-link"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden />
      Back to tournament
    </Link>
  );
}

// Resolve an entry slot to a display name. null = a bye or a not-yet-known
// opponent depending on whether the match is the first round.
function slotName(
  entryId: number | null,
  entryToJunior: Map<number, number>,
  nameFor: (juniorId: number) => string,
): string | null {
  if (entryId == null) return null;
  const juniorId = entryToJunior.get(entryId);
  if (juniorId == null) return `Entry #${entryId}`;
  return nameFor(juniorId);
}

// ── Management panel (admin/coach, shown when no bracket exists yet) ────────────

function ManagementPanel({
  tournament,
  entriesQuery,
}: {
  tournament: Tournament;
  entriesQuery: ReturnType<typeof useTournamentEntries>;
}) {
  // ManagementPanel only ever renders for admin/coach (canManage), so it is
  // always allowed to load the roster.
  const names = useJuniorNames(true);
  const confirm = useConfirmEntry();
  const generate = useGenerateBracket(tournament.id);
  const [seed, setSeed] = useState<BracketSeed>('handicap');

  if (entriesQuery.isLoading || names.isLoading) {
    return (
      <div className="mt-6 flex items-center gap-3 py-12 text-sm text-slate">
        <Loader2 className="h-5 w-5 animate-spin text-azure" aria-hidden />
        Loading entries…
      </div>
    );
  }

  if (entriesQuery.isError) {
    return (
      <div
        role="alert"
        className="mt-6 rounded-xl bg-red-500/15 p-4 text-sm text-red-400"
        data-testid="bracket-entries-error"
      >
        {errorMessage(entriesQuery.error, 'Could not load entries.')}
      </div>
    );
  }

  // Withdrawn / declined entries can't take part; everything else is shown.
  const entries = (entriesQuery.data ?? []).filter(
    (e) => e.status !== 'withdrawn' && e.status !== 'declined',
  );
  const confirmedCount = entries.filter((e) => e.status === 'confirmed').length;
  const canGenerate = confirmedCount >= 2;

  return (
    <div className="mt-6 space-y-6">
      <GlassCard className="overflow-hidden" data-testid="bracket-management">
        <div className="flex items-center gap-2 border-b border-white/5 px-5 py-4">
          <UserCheck className="h-4 w-4 text-azure" aria-hidden />
          <h2 className="text-sm font-bold uppercase tracking-widest text-azure">
            Confirm entries
          </h2>
        </div>

        {entries.length === 0 ? (
          <p className="px-5 py-8 text-sm text-slate" data-testid="bracket-no-entries">
            No entries yet. Once juniors are registered, confirm them here to
            include them in the draw.
          </p>
        ) : (
          <ul className="divide-y divide-white/5">
            {entries.map((entry) => (
              <EntryConfirmRow
                key={entry.id}
                entry={entry}
                name={names.nameFor(entry.junior_id)}
                onConfirm={() => confirm.mutate(entry.id)}
                busy={confirm.isPending}
              />
            ))}
          </ul>
        )}

        {confirm.isError ? (
          <p
            role="alert"
            className="mx-5 mb-5 rounded-xl bg-red-500/15 p-3 text-sm text-red-400"
            data-testid="confirm-entry-error"
          >
            {errorMessage(confirm.error, 'Could not confirm that entry.')}
          </p>
        ) : null}
      </GlassCard>

      <GlassCard className="overflow-hidden" data-testid="bracket-generate">
        <div className="flex items-center gap-2 border-b border-white/5 px-5 py-4">
          <GitFork className="h-4 w-4 text-azure" aria-hidden />
          <h2 className="text-sm font-bold uppercase tracking-widest text-azure">
            Draw the bracket
          </h2>
        </div>
        <div className="px-5 py-5">
          <p className="text-sm text-slate">
            <span className="font-mono font-bold text-silver">
              {confirmedCount}
            </span>{' '}
            confirmed {confirmedCount === 1 ? 'entry' : 'entries'}. At least two
            are needed.
          </p>

          <div className="mt-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate">
              Seeding
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Button
                variant={seed === 'handicap' ? 'primary' : 'ghost'}
                size="sm"
                onClick={() => setSeed('handicap')}
                data-testid="seed-handicap"
              >
                Handicap seed
              </Button>
              <Button
                variant={seed === 'random' ? 'primary' : 'ghost'}
                size="sm"
                onClick={() => setSeed('random')}
                data-testid="seed-random"
              >
                <Shuffle className="h-4 w-4" aria-hidden />
                Random
              </Button>
            </div>
          </div>

          <Button
            size="md"
            className="mt-5"
            disabled={!canGenerate || generate.isPending}
            onClick={() => {
              if (!canGenerate) return;
              if (
                !window.confirm(
                  'Draw the bracket now? This replaces any existing draw.',
                )
              ) {
                return;
              }
              generate.mutate(seed);
            }}
            data-testid="generate-bracket-btn"
          >
            {generate.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <GitFork className="h-4 w-4" aria-hidden />
            )}
            Generate bracket
          </Button>

          {generate.isError ? (
            <p
              role="alert"
              className="mt-4 rounded-xl bg-red-500/15 p-3 text-sm text-red-400"
              data-testid="generate-bracket-error"
            >
              {generateMessage(generate.error)}
            </p>
          ) : null}
        </div>
      </GlassCard>
    </div>
  );
}

function EntryConfirmRow({
  entry,
  name,
  onConfirm,
  busy,
}: {
  entry: TournamentEntry;
  name: string;
  onConfirm: () => void;
  busy: boolean;
}) {
  return (
    <li
      className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"
      data-testid={`bracket-entry-${entry.id}`}
    >
      <div className="min-w-0">
        <p className="font-semibold text-silver">{name}</p>
        <p className="mt-0.5 text-xs text-slate">Entry #{entry.id}</p>
      </div>
      <div className="flex items-center gap-3">
        <Badge tone={entryStatusTone(entry.status)}>
          {entryStatusLabel(entry.status)}
        </Badge>
        {entry.status === 'registered' ? (
          <Button
            size="sm"
            onClick={onConfirm}
            disabled={busy}
            data-testid={`confirm-entry-${entry.id}`}
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <CheckCircle2 className="h-4 w-4" aria-hidden />
            )}
            Confirm
          </Button>
        ) : null}
      </div>
    </li>
  );
}

// ── Bracket draw (all roles) ───────────────────────────────────────────────────

function BracketBoard({
  tournament,
  bracket,
  entryToJunior,
  nameFor,
  canManage,
}: {
  tournament: Tournament;
  bracket: Bracket;
  entryToJunior: Map<number, number>;
  nameFor: (juniorId: number) => string;
  canManage: boolean;
}) {
  const rounds = [...bracket.rounds].sort(
    (a, b) => a.round_number - b.round_number,
  );
  const totalRounds = rounds.length;

  return (
    <div className="mt-6 overflow-x-auto pb-2" data-testid="bracket-board">
      <div className="flex min-w-max gap-5">
        {rounds.map((round) => (
          <div
            key={round.round_number}
            className="w-72 shrink-0"
            data-testid={`bracket-round-${round.round_number}`}
          >
            <p className="mb-3 text-xs font-bold uppercase tracking-widest text-azure">
              {roundLabel(round.round_number, totalRounds)}
            </p>
            <div className="space-y-4">
              {[...round.matches]
                .sort((a, b) => a.bracket_position - b.bracket_position)
                .map((match) => (
                  <MatchCard
                    key={match.id}
                    tournament={tournament}
                    match={match}
                    roundNumber={round.round_number}
                    isFirstRound={round.round_number === rounds[0]?.round_number}
                    entryToJunior={entryToJunior}
                    nameFor={nameFor}
                    canManage={canManage}
                  />
                ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PlayerLine({
  name,
  isWinner,
  isBye,
}: {
  name: string | null;
  isWinner: boolean;
  isBye: boolean;
}) {
  const label = name ?? (isBye ? 'Bye' : 'TBD');
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-2 px-4 py-2.5',
        isWinner && 'bg-emerald-500/10',
      )}
    >
      <span
        className={cn(
          'truncate text-sm',
          name == null
            ? 'italic text-slate'
            : isWinner
              ? 'font-bold text-emerald-300'
              : 'font-semibold text-silver',
        )}
      >
        {label}
      </span>
      {isWinner ? (
        <Trophy className="h-3.5 w-3.5 shrink-0 text-gold" aria-hidden />
      ) : null}
    </div>
  );
}

function MatchCard({
  tournament,
  match,
  isFirstRound,
  entryToJunior,
  nameFor,
  canManage,
}: {
  tournament: Tournament;
  match: TournamentMatch;
  roundNumber: number;
  isFirstRound: boolean;
  entryToJunior: Map<number, number>;
  nameFor: (juniorId: number) => string;
  canManage: boolean;
}) {
  const nameA = slotName(match.player_a_entry_id, entryToJunior, nameFor);
  const nameB = slotName(match.player_b_entry_id, entryToJunior, nameFor);

  const bothKnown =
    match.player_a_entry_id != null && match.player_b_entry_id != null;
  const completed = match.status === 'completed';
  // Results can only be recorded once the event is live — mirrors the
  // score-entry page's in_progress gate. Confirming entries / drawing the
  // bracket can happen earlier; only this control waits for in_progress.
  const isLive = tournament.status === 'in_progress';
  const canRecord = canManage && isLive && bothKnown && !completed;

  return (
    <GlassCard
      tone="light"
      className="overflow-hidden"
      data-testid={`bracket-match-${match.id}`}
    >
      <div className="divide-y divide-white/5">
        <PlayerLine
          name={nameA}
          isWinner={
            match.winner_entry_id != null &&
            match.winner_entry_id === match.player_a_entry_id
          }
          isBye={isFirstRound && match.player_a_entry_id == null}
        />
        <PlayerLine
          name={nameB}
          isWinner={
            match.winner_entry_id != null &&
            match.winner_entry_id === match.player_b_entry_id
          }
          isBye={isFirstRound && match.player_b_entry_id == null}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/5 px-4 py-2.5">
        <Badge tone={matchStatusTone(match.status)} shape="pill">
          {matchStatusLabel(match.status)}
        </Badge>
        {match.result_text ? (
          <span className="font-mono text-xs font-bold text-silver">
            {match.result_text}
          </span>
        ) : null}
      </div>

      {canRecord ? (
        <RecordResult
          tournament={tournament}
          match={match}
          nameA={nameA}
          nameB={nameB}
        />
      ) : null}
    </GlassCard>
  );
}

// Inline expander to record a winner + optional result text (e.g. "3&2"). The
// backend marks the match completed and advances the winner; we just invalidate.
function RecordResult({
  tournament,
  match,
  nameA,
  nameB,
}: {
  tournament: Tournament;
  match: TournamentMatch;
  nameA: string | null;
  nameB: string | null;
}) {
  const update = useUpdateMatch(tournament.id);
  const [open, setOpen] = useState(false);
  const [winner, setWinner] = useState<number | null>(null);
  const [resultText, setResultText] = useState('');

  function submit() {
    if (winner == null) return;
    update.mutate({
      matchId: match.id,
      body: {
        winner_entry_id: winner,
        result_text: resultText.trim() || undefined,
      },
    });
  }

  if (!open) {
    return (
      <div className="border-t border-white/5 px-4 py-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setOpen(true)}
          data-testid={`record-result-${match.id}`}
        >
          <Swords className="h-4 w-4" aria-hidden />
          Record result
        </Button>
      </div>
    );
  }

  return (
    <div
      className="space-y-3 border-t border-white/5 px-4 py-4"
      data-testid={`record-result-form-${match.id}`}
    >
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-slate">
          Winner
        </p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <Button
            variant={winner === match.player_a_entry_id ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => setWinner(match.player_a_entry_id)}
            data-testid={`winner-a-${match.id}`}
          >
            <span className="truncate">{nameA ?? 'Player A'}</span>
          </Button>
          <Button
            variant={winner === match.player_b_entry_id ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => setWinner(match.player_b_entry_id)}
            data-testid={`winner-b-${match.id}`}
          >
            <span className="truncate">{nameB ?? 'Player B'}</span>
          </Button>
        </div>
      </div>

      <div>
        <label
          htmlFor={`result-text-${match.id}`}
          className="text-xs font-semibold uppercase tracking-wider text-slate"
        >
          Result (optional)
        </label>
        <input
          id={`result-text-${match.id}`}
          type="text"
          value={resultText}
          onChange={(e) => setResultText(e.target.value)}
          placeholder="e.g. 3&2"
          className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-silver focus:outline-none focus-visible:border-azure focus-visible:ring-2 focus-visible:ring-azure/40"
          data-testid={`result-input-${match.id}`}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          onClick={submit}
          disabled={winner == null || update.isPending}
          data-testid={`save-result-${match.id}`}
        >
          {update.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <CheckCircle2 className="h-4 w-4" aria-hidden />
          )}
          Save result
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setOpen(false)}
          disabled={update.isPending}
        >
          Cancel
        </Button>
      </div>

      {update.isError ? (
        <p
          role="alert"
          className="rounded-xl bg-red-500/15 p-3 text-sm text-red-400"
          data-testid={`record-result-error-${match.id}`}
        >
          {errorMessage(update.error, 'Could not save the result.')}
        </p>
      ) : null}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export function TournamentBracketPage() {
  const { id } = useParams<{ id: string }>();
  const tournamentId = Number(id);
  const validId = Number.isFinite(tournamentId) && tournamentId > 0;
  const { user } = useAuth();
  const canManage = isManager(user?.role);

  const tournamentQuery = useTournament(tournamentId);
  const bracketQuery = useBracket(tournamentId);
  const entriesQuery = useTournamentEntries(tournamentId);
  // PRIVACY: only admin/coach may request the club-wide roster. Gating via
  // `enabled` keeps the hook unconditionally called while disabling the fetch
  // for parent/player (who fall back to numeric slot labels).
  const names = useJuniorNames(canManage);
  const t = tournamentQuery.data;

  // entry_id → junior_id, so a bracket's entry slots can be resolved to names.
  const entryToJunior = useMemo(() => {
    const map = new Map<number, number>();
    for (const e of entriesQuery.data ?? []) map.set(e.id, e.junior_id);
    return map;
  }, [entriesQuery.data]);

  // Invalid / not-found id.
  if (
    !validId ||
    (tournamentQuery.isError &&
      tournamentQuery.error instanceof ApiError &&
      tournamentQuery.error.status === 404)
  ) {
    return (
      <div className="mx-auto max-w-5xl animate-fade-in-up">
        <Link
          to="/tournaments"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate hover:text-azure"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          All tournaments
        </Link>
        <GlassCard
          className="mt-6 px-6 py-16 text-center"
          data-testid="bracket-not-found"
        >
          <Swords className="mx-auto h-10 w-10 text-slate/60" aria-hidden />
          <p className="mt-4 text-base font-bold text-silver">
            Tournament not found
          </p>
        </GlassCard>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl animate-fade-in-up">
      <BackLink id={tournamentId} />

      {tournamentQuery.isLoading ? (
        <div className="mt-6 flex items-center gap-3 py-12 text-sm text-slate">
          <Loader2 className="h-5 w-5 animate-spin text-azure" aria-hidden />
          Loading tournament…
        </div>
      ) : tournamentQuery.isError ? (
        <div
          role="alert"
          className="mt-6 rounded-xl bg-red-500/15 p-4 text-sm text-red-400"
          data-testid="bracket-tournament-error"
        >
          {errorMessage(tournamentQuery.error, 'Could not load this tournament.')}
        </div>
      ) : t ? (
        <>
          <div className="mt-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={statusTone(t.status)} shape="pill">
                {statusLabel(t.status)}
              </Badge>
              <Badge tone="azure">{formatLabel(t.format)}</Badge>
            </div>
            <h1 className="mt-3 text-2xl font-black text-silver">Bracket</h1>
            <p className="mt-1 text-sm text-slate">{t.name}</p>
          </div>

          {t.format !== 'match_play' ? (
            <GlassCard
              className="mt-6 px-6 py-12 text-center"
              data-testid="bracket-not-match-play"
            >
              <Swords className="mx-auto h-10 w-10 text-slate/60" aria-hidden />
              <p className="mt-4 text-base font-bold text-silver">
                No bracket for this event
              </p>
              <p className="mt-1 text-sm text-slate">
                Brackets are only for match-play events. This is a{' '}
                {formatLabel(t.format).toLowerCase()} event.
              </p>
            </GlassCard>
          ) : (
            <BracketBody
              tournament={t}
              bracketQuery={bracketQuery}
              entriesQuery={entriesQuery}
              entryToJunior={entryToJunior}
              names={names}
              canManage={canManage}
            />
          )}
        </>
      ) : null}
    </div>
  );
}

function BracketBody({
  tournament,
  bracketQuery,
  entriesQuery,
  entryToJunior,
  names,
  canManage,
}: {
  tournament: Tournament;
  bracketQuery: ReturnType<typeof useBracket>;
  entriesQuery: ReturnType<typeof useTournamentEntries>;
  entryToJunior: Map<number, number>;
  names: ReturnType<typeof useJuniorNames>;
  canManage: boolean;
}) {
  if (bracketQuery.isLoading) {
    return (
      <div className="mt-6 flex items-center gap-3 py-12 text-sm text-slate">
        <Loader2 className="h-5 w-5 animate-spin text-azure" aria-hidden />
        Loading bracket…
      </div>
    );
  }

  if (bracketQuery.isError) {
    return (
      <div
        role="alert"
        className="mt-6 rounded-xl bg-red-500/15 p-4 text-sm text-red-400"
        data-testid="bracket-error"
      >
        {errorMessage(bracketQuery.error, 'Could not load the bracket.')}
      </div>
    );
  }

  const empty = bracketIsEmpty(bracketQuery.data);

  if (empty) {
    if (canManage) {
      return (
        <ManagementPanel tournament={tournament} entriesQuery={entriesQuery} />
      );
    }
    return (
      <GlassCard
        className="mt-6 px-6 py-12 text-center"
        data-testid="bracket-empty"
      >
        <Swords className="mx-auto h-10 w-10 text-slate/60" aria-hidden />
        <p className="mt-4 text-base font-bold text-silver">
          The bracket hasn&apos;t been drawn yet
        </p>
        <p className="mt-1 text-sm text-slate">
          Check back once the organisers have set the draw.
        </p>
      </GlassCard>
    );
  }

  return (
    <>
      {names.isError ? (
        <p className="mt-6 rounded-xl bg-amber-500/10 p-3 text-xs text-gold">
          Couldn&apos;t load golfer names — entries are shown by number.
        </p>
      ) : null}
      <BracketBoard
        tournament={tournament}
        bracket={bracketQuery.data!}
        entryToJunior={entryToJunior}
        nameFor={names.nameFor}
        canManage={canManage}
      />
    </>
  );
}
