// TanStack Query hooks + display helpers for tournament SCORING — the
// score-entry (admin/coach) and leaderboard (all roles) views. All reads/writes
// go through the shared api client (CLAUDE.md §2); query keys mirror the
// resource. THE BACKEND OWNS ALL SCORING MATH: net, Stableford points, ranks
// and positions are computed server-side and only DISPLAYED here. The only
// arithmetic the frontend ever does is summing raw strokes for a live entry
// total — never net / Stableford / handicap.
//
// Canonical shapes are NOT in the locked src/types/api.ts (do not modify that
// file), so the feature-local interfaces below define them. They mirror the
// backend (app/tournaments/controllers.py leaderboard + submit_score,
// app/courses/models.py Hole) as serialized: enums dump as strings, ints as
// numbers.

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';

import { api } from '../../lib/api';
import type {
  ScoringBasis,
  TournamentFormat,
} from './tournaments.queries';

// ── Domain types (feature-local) ──────────────────────────────────────────────

// One ranked golfer in a division. `rank` is a number (ties share a rank);
// render ties with a leading "T" via rankDisplay(). gross/net/stableford_points
// are nullable depending on the format and basis.
export interface LeaderboardRow {
  entry_id: number;
  junior_id: number;
  name: string;
  gross: number | null;
  net: number | null;
  stableford_points: number | null;
  holes_played: number | null;
  rank: number;
}

export interface LeaderboardDivision {
  division_id: number | null;
  division: string; // "Overall" when ungrouped
  rows: LeaderboardRow[];
}

export interface LeaderboardResponse {
  basis: ScoringBasis;
  divisions: LeaderboardDivision[];
}

export type ScoreStatus = 'pending' | 'submitted' | 'verified';

// A persisted tournament score (one per entry). `position` is the numeric rank
// last computed by the leaderboard; null until the leaderboard has been read.
export interface TournamentScore {
  id: number;
  entry_id: number;
  holes_played: number;
  gross_score: number;
  net_score: number | null;
  stableford_points: number | null;
  position: number | null;
  status: ScoreStatus | string;
  round_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface Hole {
  id: number;
  course_id: number;
  hole_number: number;
  par: number;
  stroke_index: number;
  white_yards: number;
  created_at: string;
  updated_at: string;
}

// The POST /scores response: the score dump + the computed extras the backend
// tacks on (course_handicap always; new_handicap_index only for counting
// events). All authoritative — never recomputed here.
export interface SubmitScoreResult extends TournamentScore {
  course_handicap: number;
  new_handicap_index?: number;
}

export interface HoleScoreInput {
  hole_number: number;
  strokes: number;
}

// Provide gross_score OR hole_scores (Stableford REQUIRES hole_scores — gated
// in the UI). gross_score defaults server-side to the sum of hole strokes.
export interface SubmitScoreInput {
  entry_id: number;
  holes_played?: number;
  hole_scores?: HoleScoreInput[];
  gross_score?: number;
  status?: string;
}

// ── Query hooks ────────────────────────────────────────────────────────────────

// GET /api/tournaments/:id/leaderboard — any signed-in role. Ranking + ties are
// done server-side.
export function useLeaderboard(
  tournamentId: number,
): UseQueryResult<LeaderboardResponse> {
  return useQuery({
    queryKey: ['tournament', tournamentId, 'leaderboard'],
    queryFn: () =>
      api.get<LeaderboardResponse>(
        `/api/tournaments/${tournamentId}/leaderboard`,
      ),
    enabled: Number.isFinite(tournamentId) && tournamentId > 0,
  });
}

// GET /api/tournament-scores?tournament_id=:id — used to prefill the entry grid
// and show which entries already have a score.
export function useTournamentScores(
  tournamentId: number,
): UseQueryResult<TournamentScore[]> {
  return useQuery({
    queryKey: ['tournament', tournamentId, 'scores'],
    queryFn: () =>
      api.get<TournamentScore[]>('/api/tournament-scores', {
        tournament_id: tournamentId,
      }),
    enabled: Number.isFinite(tournamentId) && tournamentId > 0,
  });
}

// GET /api/holes?course_id= — par + stroke index for the scorecard (display
// only). Enabled only once we know the course.
export function useCourseHoles(
  courseId?: number | null,
): UseQueryResult<Hole[]> {
  return useQuery({
    queryKey: ['course', courseId, 'holes'],
    queryFn: () =>
      api.get<Hole[]>('/api/holes', { course_id: courseId as number }),
    enabled: courseId != null && Number.isFinite(courseId),
  });
}

// ── Mutation ─────────────────────────────────────────────────────────────────

// POST /api/tournaments/:id/scores (admin/coach). On success invalidate the
// leaderboard + scores for this tournament and the entries cache (positions and
// derived stats can change).
export function useSubmitScore(
  tournamentId: number,
): UseMutationResult<SubmitScoreResult, Error, SubmitScoreInput> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SubmitScoreInput) =>
      api.post<SubmitScoreResult>(
        `/api/tournaments/${tournamentId}/scores`,
        input,
      ),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: ['tournament', tournamentId, 'leaderboard'],
      });
      qc.invalidateQueries({
        queryKey: ['tournament', tournamentId, 'scores'],
      });
      qc.invalidateQueries({ queryKey: ['tournament-entries'] });
    },
  });
}

// ── Display helpers (formatting / column choice — no scoring math) ────────────

export interface LeaderboardColumn {
  key: 'gross' | 'net' | 'stableford_points';
  label: string;
}

// Which score columns a leaderboard should show, derived from the tournament's
// format + scoring basis. Stableford leads with Points; stroke/match play show
// Gross, plus Net when the basis includes net. Backend ranks accordingly.
export function leaderboardColumns(
  format: TournamentFormat,
  basis: ScoringBasis,
): LeaderboardColumn[] {
  if (format === 'stableford') {
    return [{ key: 'stableford_points', label: 'Points' }];
  }
  const cols: LeaderboardColumn[] = [{ key: 'gross', label: 'Gross' }];
  if (basis === 'net' || basis === 'both') {
    cols.push({ key: 'net', label: 'Net' });
  }
  return cols;
}

// Rank label with ties: a rank that appears more than once in the division is
// shown as "T<rank>" (e.g. two players on rank 3 → "T3"). Pass the division's
// rows so we can detect repeats. Display only — the rank itself is the
// backend's.
export function rankDisplay(rank: number, rows: LeaderboardRow[]): string {
  const tied = rows.filter((r) => r.rank === rank).length > 1;
  return tied ? `T${rank}` : String(rank);
}

// Read a row's value for a chosen column, formatted for display ("—" when the
// backend left it null for this format/basis).
export function columnValue(
  row: LeaderboardRow,
  key: LeaderboardColumn['key'],
): string {
  const value = row[key];
  return value == null ? '—' : String(value);
}
