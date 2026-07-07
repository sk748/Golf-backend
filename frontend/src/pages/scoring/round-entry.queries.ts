// TanStack Query hooks + feature-local types for ROUND ENTRY & VERIFICATION
// (general WHS rounds, not tournament scoring). All server I/O goes through the
// shared api client (CLAUDE.md §2). THE FRONTEND NEVER COMPUTES WHS MATH —
// differential / handicap index come from the API response only; the one piece
// of arithmetic allowed in this feature is summing hole strokes into a gross
// total (plain arithmetic, not WHS).
//
// ENVELOPE EXCEPTION — POST /api/scores/sync returns its payload at the TOP
// LEVEL (`{ success, scorecard, new_handicap_index, differential }`, no `data`
// wrapper — like the auth routes). The shared client unwraps `.data` only when
// a `data` key is present and otherwise returns the parsed body untouched
// (src/lib/api.ts request()), so a plain api.post works here; we just type the
// response as the raw shape. GET /api/rounds and POST /api/rounds/:id/verify
// use the standard `{ data, count }` envelope and unwrap normally.

import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';

import { api } from '../../lib/api';
import type { Round } from '../../types/api';

// ── Feature-local types ───────────────────────────────────────────────────────
// The locked src/types/api.ts Round predates verification; the backend now also
// serializes status / counts_toward_handicap / entered_by / verified_by /
// verified_date on every round row (app/rounds/models.py). Extend locally —
// never edit the locked file.

export type RoundStatus = 'pending' | 'verified';

export interface RoundRow extends Round {
  status: RoundStatus | string;
  counts_toward_handicap: boolean;
  entered_by: string | null;
  verified_by: string | null;
  verified_date: string | null;
}

// Rounds rendered from the locked Round type may or may not carry the new
// fields depending on which endpoint produced them — widen additively for the
// pending/practice badges on player views (do NOT touch the locked type).
export type RoundWithVerification = Round & {
  status?: RoundStatus | string;
  counts_toward_handicap?: boolean;
};

export function isPendingRound(round: Round): boolean {
  return (round as RoundWithVerification).status === 'pending';
}

export function isPracticeRound(round: Round): boolean {
  return (round as RoundWithVerification).counts_toward_handicap === false;
}

// POST /api/scores/sync body (app/rounds/controllers.py sync_score).
// user_id is staff-only targeting (coach/admin submitting for a player); a
// player sending someone else's id gets 403, so players simply omit it.
export interface SyncScoreInput {
  tee_set_id: number;
  gross_score: number;
  holes_played?: 9 | 18; // default 18
  date_played?: string; // ISO YYYY-MM-DD, no future; default today
  counts_toward_handicap?: boolean; // default true; false = practice round
  pcc?: number;
  user_id?: string;
}

// POST /api/scores/sync 201 response — TOP-LEVEL (no data envelope, see the
// header comment). new_handicap_index is null while the round is pending or
// practice-only (the index is untouched until verification of a counting round).
export interface SyncScoreResult {
  success: boolean;
  scorecard: {
    id: number;
    gross_score: number;
    score_differential: number;
    course_name: string;
    tee_color: string;
    date_played: string;
    status: RoundStatus;
    counts_toward_handicap: boolean;
  };
  new_handicap_index: number | null;
  differential: number;
}

// POST /api/rounds/:id/verify response (standard envelope, unwrapped): the
// round dump plus the recomputed index (null when the round doesn't count or
// was already verified — the endpoint is idempotent).
export interface VerifyRoundResult extends RoundRow {
  new_handicap_index: number | null;
}

// ── Shared invalidation ───────────────────────────────────────────────────────
// A submitted/verified round changes: the rounds lists (['rounds'] and its
// filtered variants like ['rounds', { status: 'pending' }] — prefix-matched)
// and the handicap history, cached at ['users', <id>, 'handicap-history']
// (player-games.queries). The user id varies (staff submit for juniors), so
// match any key containing the 'handicap-history' segment.

function invalidateRoundData(qc: QueryClient): void {
  void qc.invalidateQueries({ queryKey: ['rounds'] });
  void qc.invalidateQueries({
    predicate: (query) => query.queryKey.includes('handicap-history'),
  });
}

// ── Hooks ─────────────────────────────────────────────────────────────────────

// POST /api/scores/sync — submit a round. Player-entered rounds come back
// status 'pending' (verified by staff before the index moves); staff-entered
// rounds are 'verified' immediately and, when counting, return the new index.
export function useSubmitRound(): UseMutationResult<
  SyncScoreResult,
  Error,
  SyncScoreInput
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: SyncScoreInput) =>
      api.post<SyncScoreResult>('/api/scores/sync', body),
    onSuccess: () => invalidateRoundData(qc),
  });
}

// GET /api/rounds?status=pending — the verification queue (admin/coach/
// committee; players are auto-scoped to their own rounds backend-side).
export function usePendingRounds(): UseQueryResult<RoundRow[]> {
  return useQuery({
    queryKey: ['rounds', { status: 'pending' }],
    queryFn: () => api.get<RoundRow[]>('/api/rounds', { status: 'pending' }),
  });
}

// POST /api/rounds/:id/verify — verify a pending round; recomputes the player's
// index when the round counts. Idempotent on already-verified rounds.
export function useVerifyRound(): UseMutationResult<
  VerifyRoundResult,
  Error,
  number
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (roundId: number) =>
      api.post<VerifyRoundResult>(`/api/rounds/${roundId}/verify`),
    onSuccess: () => invalidateRoundData(qc),
  });
}

// ── Optional per-hole detail ──────────────────────────────────────────────────
// After a successful sync, the per-hole grid (when fully used) is persisted as
// individual hole-score rows so the scorecard modal can show them. Best-effort
// by design: the round is already saved — never block or fail the submit on
// these. round_id = SyncScoreResult.scorecard.id.

export interface HoleStrokesInput {
  hole_number: number;
  strokes: number;
}

export async function submitHoleScores(
  roundId: number,
  holes: HoleStrokesInput[],
): Promise<void> {
  await Promise.allSettled(
    holes.map((h) =>
      api.post('/api/hole-scores', {
        round_id: roundId,
        hole_number: h.hole_number,
        strokes: h.strokes,
      }),
    ),
  );
}
