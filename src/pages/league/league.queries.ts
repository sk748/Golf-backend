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

import { useQuery, type UseQueryResult } from '@tanstack/react-query';

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
export function useScoreboard(): UseQueryResult<Scoreboard> {
  return useQuery({
    queryKey: ['league', 'scoreboard'],
    queryFn: () => api.get<Scoreboard>('/api/league/scoreboard'),
    staleTime: 60 * 1000,
  });
}

// GET /api/public/league/scoreboard — NO auth required; powers the logged-out
// landing-page hero.
export function usePublicScoreboard(): UseQueryResult<Scoreboard> {
  return useQuery({
    queryKey: ['league', 'scoreboard', 'public'],
    queryFn: () => api.get<Scoreboard>('/api/public/league/scoreboard'),
    staleTime: 60 * 1000,
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
