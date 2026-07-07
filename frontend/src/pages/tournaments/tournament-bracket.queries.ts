// TanStack Query hooks + feature-local types for the MATCH-PLAY BRACKET. All
// reads/writes go through the shared api client (CLAUDE.md §2); query keys mirror
// the resource. THE BACKEND OWNS ALL BRACKET LOGIC — seeding, stroke allocation,
// and advancing the winner into the next round. The frontend only displays the
// draw and RECORDS the winner the user picks; it never computes a result.
//
// The canonical TournamentMatch shape is NOT in the locked src/types/api.ts (do
// not modify that file), so the feature-local interfaces below define it. They
// mirror the backend model (app/tournaments/models.py TournamentMatch) as
// serialized: enums dump as their string value, dates dump as ISO strings, and
// unset player/winner slots dump as null (a bye or a not-yet-known opponent).
//
// Backend contract (do NOT invent fields):
//   GET  /api/tournaments/:id/bracket
//        → { tournament_id, rounds: [{ round_number, matches: Match[] }] }
//   POST /api/tournaments/:id/generate-bracket?seed=handicap|random  → 201
//        Returns the bracket shape. Requires tournament.format === 'match_play'
//        AND ≥2 entries with status 'confirmed' (else 400 INVALID_FORMAT /
//        NOT_ENOUGH_ENTRIES). WIPES any existing bracket and re-seeds.
//   GET  /api/tournament-matches/:mid
//        → a Match plus, when both players are known: stroke_allocation (array,
//          backend-computed — passed through as-is), course_handicap_a/_b.
//   PUT  /api/tournament-matches/:mid
//        body { winner_entry_id?, result_text?, scheduled_date?, status? }
//        (admin/coach). Setting winner_entry_id (must be one of the two player
//        entry ids) marks the match completed and advances the winner into the
//        next round automatically. Returns the updated match.
//   PUT  /api/tournament-entries/:id  body { status: 'confirmed' }
//        (admin/coach/parent) — promotes a 'registered' entry so it can be
//        bracketed.

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';

import { api } from '../../lib/api';
import type { BadgeTone } from './tournaments.queries';

// ── Domain types (feature-local; canonical shape not in src/types/api.ts) ──────

export type MatchStatus = 'scheduled' | 'completed';

export interface TournamentMatch {
  id: number;
  tournament_id: number;
  round_number: number;
  bracket_position: number;
  player_a_entry_id: number | null;
  player_b_entry_id: number | null;
  winner_entry_id: number | null;
  result_text: string | null;
  scheduled_date: string | null; // ISO YYYY-MM-DD
  status: MatchStatus;
}

export interface BracketRound {
  round_number: number;
  matches: TournamentMatch[];
}

export interface Bracket {
  tournament_id: number;
  rounds: BracketRound[];
}

// GET /api/tournament-matches/:mid returns the match plus, when both players are
// known, the backend-computed stroke allocation + each side's course handicap.
// stroke_allocation is passed through as-is (display only — never recomputed).
export interface MatchDetail extends TournamentMatch {
  stroke_allocation?: unknown[];
  course_handicap_a?: number;
  course_handicap_b?: number;
}

export type BracketSeed = 'handicap' | 'random';

export interface UpdateMatchInput {
  winner_entry_id?: number;
  result_text?: string;
  scheduled_date?: string;
  status?: string;
}

// ── Query hooks ────────────────────────────────────────────────────────────────

// GET /api/tournaments/:id/bracket — the full draw (empty rounds until drawn).
export function useBracket(tournamentId: number): UseQueryResult<Bracket> {
  return useQuery({
    queryKey: ['tournament', 'bracket', tournamentId],
    queryFn: () =>
      api.get<Bracket>(`/api/tournaments/${tournamentId}/bracket`),
    enabled: Number.isFinite(tournamentId) && tournamentId > 0,
  });
}

// GET /api/tournament-matches/:mid — single match + (when both players known)
// the backend stroke allocation / course handicaps.
export function useMatchDetail(
  matchId: number,
): UseQueryResult<MatchDetail> {
  return useQuery({
    queryKey: ['tournament-match', matchId],
    queryFn: () => api.get<MatchDetail>(`/api/tournament-matches/${matchId}`),
    enabled: Number.isFinite(matchId) && matchId > 0,
  });
}

// ── Mutation hooks ────────────────────────────────────────────────────────────

// POST /api/tournaments/:id/generate-bracket?seed= — admin/coach. WIPES + reseeds
// the bracket. Invalidates the bracket query so the new draw renders.
export function useGenerateBracket(
  tournamentId: number,
): UseMutationResult<Bracket, unknown, BracketSeed | void> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (seed: BracketSeed | void) =>
      api.post<Bracket>(
        `/api/tournaments/${tournamentId}/generate-bracket?seed=${
          seed ?? 'handicap'
        }`,
      ),
    onSuccess: () => {
      void qc.invalidateQueries({
        queryKey: ['tournament', 'bracket', tournamentId],
      });
    },
  });
}

// PUT /api/tournament-matches/:mid — admin/coach. Recording a winner marks the
// match completed and (backend-side) advances them into the next round, so we
// invalidate the whole bracket as well as the single match.
export function useUpdateMatch(
  tournamentId: number,
): UseMutationResult<
  MatchDetail,
  unknown,
  { matchId: number; body: UpdateMatchInput }
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ matchId, body }) =>
      api.put<MatchDetail>(`/api/tournament-matches/${matchId}`, body),
    onSuccess: (_data, { matchId }) => {
      void qc.invalidateQueries({
        queryKey: ['tournament', 'bracket', tournamentId],
      });
      void qc.invalidateQueries({ queryKey: ['tournament-match', matchId] });
    },
  });
}

// PUT /api/tournament-entries/:id { status: 'confirmed' } — admin/coach/parent.
// Promotes a 'registered' entry so the seeding step can include it. Invalidates
// ['tournament-entries'] (the same key the roster hooks use).
export function useConfirmEntry(): UseMutationResult<unknown, unknown, number> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (entryId: number) =>
      api.put<unknown>(`/api/tournament-entries/${entryId}`, {
        status: 'confirmed',
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['tournament-entries'] });
    },
  });
}

// ── Display helpers (no scoring math) ─────────────────────────────────────────

const MATCH_STATUS_LABELS: Record<MatchStatus, string> = {
  scheduled: 'Scheduled',
  completed: 'Completed',
};

export function matchStatusLabel(status: string): string {
  return MATCH_STATUS_LABELS[status as MatchStatus] ?? status;
}

const MATCH_STATUS_TONES: Record<MatchStatus, BadgeTone> = {
  scheduled: 'azure',
  completed: 'emerald',
};

export function matchStatusTone(status: string): BadgeTone {
  return MATCH_STATUS_TONES[status as MatchStatus] ?? 'slate';
}

// Name the round from its position in the draw: the last round is the Final, the
// second-last the Semifinals, then Quarterfinals; earlier rounds fall back to
// "Round N". `totalRounds` is the count of rounds in the bracket.
export function roundLabel(roundNumber: number, totalRounds: number): string {
  const fromEnd = totalRounds - roundNumber; // 0 = final
  if (fromEnd === 0) return 'Final';
  if (fromEnd === 1) return 'Semifinals';
  if (fromEnd === 2) return 'Quarterfinals';
  return `Round ${roundNumber}`;
}
