// TanStack Query hooks + local types for the JUNIOR LEAGUE (inter-club team
// match-play). DISPLAY ONLY in this pass — reads + a public scoreboard feed for
// the logged-out landing page; no create/edit mutations yet.
//
// All scoring (points, results, standings, margins) is computed server-side and
// authoritative — these hooks fetch, type and shape for display only.
//
// GET /api/public/league/scoreboard is deliberately UNAUTHENTICATED (the api
// client just has no token to attach when logged out) — it powers the public
// landing-page scoreboard hero. GET /api/league/scoreboard is the same shape but
// auth-scoped, for the in-app dashboards.

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';

import { api } from '../../lib/api';

// ── Types (local — the backend contract for this module; NOT in src/types) ──────

export type LeagueStatus = 'draft' | 'active' | 'completed' | 'archived';
export type FixtureStatus =
  | 'scheduled'
  | 'in_progress'
  | 'completed'
  | 'cancelled';
export type FixtureResult = 'home_win' | 'away_win' | 'halved' | 'pending';
export type PairingFormat = 'singles' | 'foursomes' | 'fourball';

export interface League {
  id: number;
  name: string;
  year: number | null;
  status: LeagueStatus;
  is_current: boolean;
  points_win: number;
  points_halve: number;
  points_loss: number;
  description: string | null;
  teams?: Team[];
}

export interface Team {
  id: number;
  league_id: number;
  name: string;
  short_name: string | null;
  is_home_club: boolean;
}

export interface Standing {
  team_id: number;
  team_name: string;
  is_home_club: boolean;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  points: number;
  average: number;
}

export interface FixtureSummary {
  home_points: number;
  away_points: number;
  result: FixtureResult;
  home_team_name: string | null;
  away_team_name: string | null;
}

export interface Pairing {
  id: number;
  fixture_id: number;
  pairing_order: number | null;
  format: PairingFormat;
  home_junior_id: number | null;
  home_partner_junior_id: number | null;
  home_label: string | null;
  away_label: string | null;
  away_partner_label: string | null;
  result: FixtureResult;
  margin: string | null;
  home_junior_name: string | null;
  home_partner_junior_name: string | null;
}

export interface Fixture {
  id: number;
  league_id: number;
  round_number: number | null;
  date: string | null; // ISO YYYY-MM-DD
  location: string | null;
  home_team_id: number;
  away_team_id: number;
  status: FixtureStatus;
  event_id: number | null;
  summary: FixtureSummary;
  pairings: Pairing[];
}

// The home club's own standing plus its 1-based rank (regardless of top-5) —
// the "current position" the compact dashboard strip shows.
export interface HomeStanding extends Standing {
  rank: number;
}

// GET /api/(public/)league/scoreboard — the at-a-glance feed for the hero.
export interface Scoreboard {
  league: League | null;
  standings: Standing[]; // already capped <= 5 server-side
  home_standing: HomeStanding | null;
  next_fixture: Fixture | null;
  recent_fixture: Fixture | null;
}

// ── Reads ───────────────────────────────────────────────────────────────────

// GET /api/league/scoreboard — auth-scoped scoreboard for in-app dashboards.
// `enabled` lets callers that share a component with the public variant (the
// landing hero) keep this AUTHENTICATED request idle when logged out — firing
// it without a token 401s and bounces the visitor to /login.
export function useScoreboard(enabled = true): UseQueryResult<Scoreboard> {
  return useQuery({
    queryKey: ['league', 'scoreboard'],
    queryFn: () => api.get<Scoreboard>('/api/league/scoreboard'),
    staleTime: 60 * 1000,
    enabled,
  });
}

// GET /api/public/league/scoreboard — NO auth required; powers the logged-out
// landing-page hero. `enabled` defaults on; the hero disables it in-app so only
// one of the two scoreboard requests is ever in flight.
export function usePublicScoreboard(enabled = true): UseQueryResult<Scoreboard> {
  return useQuery({
    queryKey: ['league', 'scoreboard', 'public'],
    queryFn: () => api.get<Scoreboard>('/api/public/league/scoreboard'),
    staleTime: 60 * 1000,
    enabled,
  });
}

// GET /api/leagues?current=true — the current league(s); list items carry no
// teams. We take the first as "the" current league.
export function useCurrentLeague(): UseQueryResult<League[]> {
  return useQuery({
    queryKey: ['league', 'current'],
    queryFn: () => api.get<League[]>('/api/leagues', { current: true }),
    staleTime: 5 * 60 * 1000,
  });
}

// GET /api/leagues/:id — a single league WITH its teams.
export function useLeague(id?: number): UseQueryResult<League> {
  return useQuery({
    queryKey: ['league', id],
    queryFn: () => api.get<League>(`/api/leagues/${id}`),
    enabled: Boolean(id),
  });
}

// GET /api/leagues/:id/standings — the full table.
export function useStandings(id?: number): UseQueryResult<Standing[]> {
  return useQuery({
    queryKey: ['league', id, 'standings'],
    queryFn: () => api.get<Standing[]>(`/api/leagues/${id}/standings`),
    enabled: Boolean(id),
  });
}

// GET /api/leagues/:id/fixtures — every fixture (the schedule).
export function useFixtures(id?: number): UseQueryResult<Fixture[]> {
  return useQuery({
    queryKey: ['league', id, 'fixtures'],
    queryFn: () => api.get<Fixture[]>(`/api/leagues/${id}/fixtures`),
    enabled: Boolean(id),
  });
}

// GET /api/fixtures/:id — one fixture with its pairings.
export function useFixture(id?: number): UseQueryResult<Fixture> {
  return useQuery({
    queryKey: ['league', 'fixture', id],
    queryFn: () => api.get<Fixture>(`/api/fixtures/${id}`),
    enabled: Boolean(id),
  });
}

// ── Display helpers (presentation only — no scoring re-implemented) ────────────

// "Live" / "Final" / "Upcoming" / "Cancelled" status chip text.
export function fixtureStatusLabel(status: FixtureStatus): string {
  switch (status) {
    case 'in_progress':
      return 'Live';
    case 'completed':
      return 'Final';
    case 'scheduled':
      return 'Upcoming';
    case 'cancelled':
      return 'Cancelled';
    default:
      return String(status);
  }
}

export function fixtureStatusTone(
  status: FixtureStatus,
): 'azure' | 'emerald' | 'gold' | 'slate' {
  switch (status) {
    case 'in_progress':
      return 'azure';
    case 'completed':
      return 'emerald';
    case 'scheduled':
      return 'gold';
    default:
      return 'slate';
  }
}

// "14 Jun 2026" / "TBD" from an ISO date.
export function fixtureDate(iso: string | null): string {
  if (!iso) return 'TBD';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'TBD';
  return d.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

// A pairing/fixture result's display tone (home_win=azure, away_win=slate,
// halved=gold, pending=hollow/outline handled by the caller).
export function resultTone(
  result: FixtureResult,
): 'azure' | 'slate' | 'gold' | 'outline' {
  switch (result) {
    case 'home_win':
      return 'azure';
    case 'away_win':
      return 'slate';
    case 'halved':
      return 'gold';
    default:
      return 'outline';
  }
}

// "1st" / "2nd" / "3rd" / "4th" … ordinal for a league position.
export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

// A short pairing label, e.g. "Foursomes" / "Singles" / "Four-ball".
export function pairingFormatLabel(format: PairingFormat): string {
  switch (format) {
    case 'singles':
      return 'Singles';
    case 'foursomes':
      return 'Foursomes';
    case 'fourball':
      return 'Four-ball';
    default:
      return String(format);
  }
}

// ── Additional read: every league (the manage-page selector) ───────────────────

// GET /api/leagues — all leagues (no `current` filter). Staff manage page lists
// these to pick which league to edit.
export function useLeagues(): UseQueryResult<League[]> {
  return useQuery({
    queryKey: ['league', 'all'],
    queryFn: () => api.get<League[]>('/api/leagues'),
    staleTime: 60 * 1000,
  });
}

// ── Mutation input types (the backend write contract for this module) ──────────

export interface CreateLeagueInput {
  name: string;
  year?: number | null;
  status?: LeagueStatus;
  is_current?: boolean;
  points_win?: number;
  points_halve?: number;
  points_loss?: number;
  description?: string | null;
}

export type UpdateLeagueInput = Partial<CreateLeagueInput>;

export interface CreateTeamInput {
  league_id: number;
  name: string;
  short_name?: string | null;
  is_home_club?: boolean;
}

export type UpdateTeamInput = Partial<Omit<CreateTeamInput, 'league_id'>>;

export interface CreateFixtureInput {
  league_id: number;
  home_team_id: number;
  away_team_id: number;
  round_number?: number | null;
  date?: string | null; // ISO YYYY-MM-DD
  location?: string | null;
  status?: FixtureStatus;
}

export type UpdateFixtureInput = Partial<Omit<CreateFixtureInput, 'league_id'>>;

export interface CreatePairingInput {
  fixture_id: number;
  pairing_order?: number | null;
  format?: PairingFormat;
  home_junior_id?: number | null;
  home_partner_junior_id?: number | null;
  home_label?: string | null;
  away_label?: string | null;
  away_partner_label?: string | null;
  result?: FixtureResult;
  margin?: string | null;
}

export type UpdatePairingInput = Partial<Omit<CreatePairingInput, 'fixture_id'>>;

// ── Mutations (admin/coach/committee; backend enforces) ────────────────────────
// All scoring/standings are recomputed server-side; every write invalidates the
// scoreboard feeds and the current-league key so dashboards refresh, plus any
// league-scoped keys the change affects.

// Invalidate the league-wide feeds + a specific league's nested keys.
function useLeagueInvalidation() {
  const qc = useQueryClient();
  return (leagueId?: number) => {
    void qc.invalidateQueries({ queryKey: ['league', 'scoreboard'] });
    void qc.invalidateQueries({ queryKey: ['league', 'scoreboard', 'public'] });
    void qc.invalidateQueries({ queryKey: ['league', 'current'] });
    void qc.invalidateQueries({ queryKey: ['league', 'all'] });
    if (leagueId != null) {
      void qc.invalidateQueries({ queryKey: ['league', leagueId] });
      void qc.invalidateQueries({ queryKey: ['league', leagueId, 'standings'] });
      void qc.invalidateQueries({ queryKey: ['league', leagueId, 'fixtures'] });
    }
  };
}

// Invalidate a single fixture's detail (its pairings) in addition to the league
// feeds — used by fixture + pairing writes, which re-derive that fixture.
function useFixtureInvalidation() {
  const invalidateLeague = useLeagueInvalidation();
  const qc = useQueryClient();
  return (fixtureId?: number, leagueId?: number) => {
    invalidateLeague(leagueId);
    if (fixtureId != null) {
      void qc.invalidateQueries({ queryKey: ['league', 'fixture', fixtureId] });
    }
  };
}

// ── Leagues ────────────────────────────────────────────────────────────────────

export function useCreateLeague(): UseMutationResult<
  League,
  Error,
  CreateLeagueInput
> {
  const invalidate = useLeagueInvalidation();
  return useMutation({
    mutationFn: (input: CreateLeagueInput) =>
      api.post<League>('/api/leagues', input),
    onSuccess: (league) => invalidate(league.id),
  });
}

export function useUpdateLeague(): UseMutationResult<
  League,
  Error,
  { id: number; body: UpdateLeagueInput }
> {
  const invalidate = useLeagueInvalidation();
  return useMutation({
    mutationFn: ({ id, body }) => api.put<League>(`/api/leagues/${id}`, body),
    onSuccess: (league) => invalidate(league.id),
  });
}

export function useDeleteLeague(): UseMutationResult<unknown, Error, number> {
  const invalidate = useLeagueInvalidation();
  return useMutation({
    mutationFn: (id: number) => api.del<unknown>(`/api/leagues/${id}`),
    onSuccess: (_data, id) => invalidate(id),
  });
}

export function useSetCurrentLeague(): UseMutationResult<League, Error, number> {
  const invalidate = useLeagueInvalidation();
  return useMutation({
    mutationFn: (id: number) =>
      api.put<League>(`/api/leagues/${id}/set-current`),
    onSuccess: (league) => invalidate(league.id),
  });
}

// ── Teams ────────────────────────────────────────────────────────────────────

export function useCreateTeam(): UseMutationResult<
  Team,
  Error,
  CreateTeamInput
> {
  const invalidate = useLeagueInvalidation();
  return useMutation({
    mutationFn: (input: CreateTeamInput) =>
      api.post<Team>('/api/league-teams', input),
    onSuccess: (team) => invalidate(team.league_id),
  });
}

export function useUpdateTeam(): UseMutationResult<
  Team,
  Error,
  { id: number; body: UpdateTeamInput }
> {
  const invalidate = useLeagueInvalidation();
  return useMutation({
    mutationFn: ({ id, body }) => api.put<Team>(`/api/league-teams/${id}`, body),
    onSuccess: (team) => invalidate(team.league_id),
  });
}

export function useDeleteTeam(): UseMutationResult<
  unknown,
  Error,
  { id: number; leagueId: number }
> {
  const invalidate = useLeagueInvalidation();
  return useMutation({
    mutationFn: ({ id }) => api.del<unknown>(`/api/league-teams/${id}`),
    onSuccess: (_data, { leagueId }) => invalidate(leagueId),
  });
}

// ── Fixtures ───────────────────────────────────────────────────────────────────

export function useCreateFixture(): UseMutationResult<
  Fixture,
  Error,
  CreateFixtureInput
> {
  const invalidate = useFixtureInvalidation();
  return useMutation({
    mutationFn: (input: CreateFixtureInput) =>
      api.post<Fixture>('/api/league-fixtures', input),
    onSuccess: (fixture) => invalidate(fixture.id, fixture.league_id),
  });
}

export function useUpdateFixture(): UseMutationResult<
  Fixture,
  Error,
  { id: number; body: UpdateFixtureInput }
> {
  const invalidate = useFixtureInvalidation();
  return useMutation({
    mutationFn: ({ id, body }) =>
      api.put<Fixture>(`/api/league-fixtures/${id}`, body),
    onSuccess: (fixture) => invalidate(fixture.id, fixture.league_id),
  });
}

export function useDeleteFixture(): UseMutationResult<
  unknown,
  Error,
  { id: number; leagueId: number }
> {
  const invalidate = useFixtureInvalidation();
  return useMutation({
    mutationFn: ({ id }) => api.del<unknown>(`/api/league-fixtures/${id}`),
    onSuccess: (_data, { id, leagueId }) => invalidate(id, leagueId),
  });
}

// ── Pairings ───────────────────────────────────────────────────────────────────
// Saving a pairing result re-computes the fixture aggregate AND the standings
// server-side, so these invalidate the fixture detail + the league feeds. The
// caller passes the owning leagueId so the standings/fixtures lists refresh.

export function useCreatePairing(): UseMutationResult<
  Pairing,
  Error,
  { input: CreatePairingInput; leagueId?: number }
> {
  const invalidate = useFixtureInvalidation();
  return useMutation({
    mutationFn: ({ input }) =>
      api.post<Pairing>('/api/league-pairings', input),
    onSuccess: (pairing, { leagueId }) =>
      invalidate(pairing.fixture_id, leagueId),
  });
}

export function useUpdatePairing(): UseMutationResult<
  Pairing,
  Error,
  { id: number; body: UpdatePairingInput; leagueId?: number }
> {
  const invalidate = useFixtureInvalidation();
  return useMutation({
    mutationFn: ({ id, body }) =>
      api.put<Pairing>(`/api/league-pairings/${id}`, body),
    onSuccess: (pairing, { leagueId }) =>
      invalidate(pairing.fixture_id, leagueId),
  });
}

export function useDeletePairing(): UseMutationResult<
  unknown,
  Error,
  { id: number; fixtureId: number; leagueId?: number }
> {
  const invalidate = useFixtureInvalidation();
  return useMutation({
    mutationFn: ({ id }) => api.del<unknown>(`/api/league-pairings/${id}`),
    onSuccess: (_data, { fixtureId, leagueId }) =>
      invalidate(fixtureId, leagueId),
  });
}
