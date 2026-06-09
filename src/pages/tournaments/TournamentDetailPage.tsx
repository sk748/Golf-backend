// Tournament detail — SHARED across all roles, strictly read-only. Shows the
// event header, eligibility rules, divisions, and description. No register /
// RSVP / score / edit actions here (later, role-specific passes). No role branch.

import { useParams, Link } from 'react-router-dom';
import {
  ArrowLeft,
  CalendarDays,
  Flag,
  Layers,
  Loader2,
  Scale,
  ShieldCheck,
  Trophy,
  UserCheck,
} from 'lucide-react';

import { ApiError } from '../../lib/api';
import { Badge } from '../../components/ui/Badge';
import { GlassCard } from '../../components/ui/GlassCard';
import {
  divisionBasisLabel,
  eligibilitySummary,
  formatDateRange,
  formatLabel,
  scoringBasisLabel,
  statusLabel,
  statusTone,
  useTournament,
  useTournamentDivisions,
  type TournamentDivision,
} from './tournaments.queries';

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Something went wrong loading this tournament.';
}

function BackLink() {
  return (
    <Link
      to="/tournaments"
      className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate transition-colors hover:text-azure focus:outline-none focus-visible:ring-2 focus-visible:ring-azure/50 rounded"
      data-testid="tournament-back-link"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden />
      All tournaments
    </Link>
  );
}

// ── Eligibility ─────────────────────────────────────────────────────────────

function rangeText(min: number | null, max: number | null): string | null {
  if (min != null && max != null) return min === max ? `${min}` : `${min} – ${max}`;
  if (min != null) return `${min}+`;
  if (max != null) return `up to ${max}`;
  return null;
}

function hiText(min: number | null, max: number | null): string | null {
  if (min != null && max != null)
    return `${min.toFixed(1)} – ${max.toFixed(1)}`;
  if (max != null) return `≤ ${max.toFixed(1)}`;
  if (min != null) return `≥ ${min.toFixed(1)}`;
  return null;
}

function EligibilityRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <dt className="text-sm text-slate">{label}</dt>
      <dd className="text-sm font-semibold text-silver">{value}</dd>
    </div>
  );
}

interface EligibilityFields {
  age_min: number | null;
  age_max: number | null;
  level_min: number | null;
  level_max: number | null;
  handicap_min: number | null;
  handicap_max: number | null;
  handicap_required: boolean;
}

function EligibilityPanel({ t }: { t: EligibilityFields }) {
  const ages = rangeText(t.age_min, t.age_max);
  const levels = rangeText(t.level_min, t.level_max);
  const hi = hiText(t.handicap_min, t.handicap_max);
  const anyRule =
    ages != null || levels != null || hi != null || t.handicap_required;

  return (
    <GlassCard className="overflow-hidden">
      <div className="flex items-center gap-2 border-b border-white/5 px-5 py-4">
        <ShieldCheck className="h-4 w-4 text-azure" aria-hidden />
        <h2 className="text-sm font-bold uppercase tracking-widest text-azure">
          Eligibility
        </h2>
      </div>
      <div className="px-5 py-2">
        {!anyRule ? (
          <p className="py-6 text-sm text-slate" data-testid="eligibility-open">
            Open to all juniors — no age, level, or handicap restrictions.
          </p>
        ) : (
          <dl className="divide-y divide-white/5" data-testid="eligibility-rules">
            {ages && <EligibilityRow label="Ages" value={ages} />}
            {levels && <EligibilityRow label="Levels" value={levels} />}
            {hi && <EligibilityRow label="Handicap index" value={hi} />}
            <EligibilityRow
              label="Handicap required"
              value={t.handicap_required ? 'Yes' : 'No'}
            />
          </dl>
        )}
      </div>
    </GlassCard>
  );
}

// ── Divisions ─────────────────────────────────────────────────────────────────

function divisionCriteria(d: TournamentDivision): string {
  const parts: string[] = [];
  const ages = rangeText(d.age_min, d.age_max);
  if (ages) parts.push(`Ages ${ages}`);
  const levels = rangeText(d.level_min, d.level_max);
  if (levels) parts.push(`Levels ${levels}`);
  const hi = hiText(d.handicap_min, d.handicap_max);
  if (hi) parts.push(`HI ${hi}`);
  if (d.gender) {
    parts.push(d.gender.charAt(0).toUpperCase() + d.gender.slice(1));
  }
  return parts.length ? parts.join(' · ') : 'No criteria set';
}

function DivisionsSection({
  divisions,
  isLoading,
  isError,
  error,
}: {
  divisions: TournamentDivision[] | undefined;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
}) {
  return (
    <GlassCard className="overflow-hidden">
      <div className="flex items-center gap-2 border-b border-white/5 px-5 py-4">
        <Layers className="h-4 w-4 text-azure" aria-hidden />
        <h2 className="text-sm font-bold uppercase tracking-widest text-azure">
          Divisions
        </h2>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-3 px-5 py-8 text-sm text-slate">
          <Loader2 className="h-5 w-5 animate-spin text-azure" aria-hidden />
          Loading divisions…
        </div>
      ) : isError ? (
        <div
          role="alert"
          className="m-5 rounded-xl bg-red-500/15 p-3 text-sm text-red-400"
          data-testid="divisions-error"
        >
          {errorMessage(error)}
        </div>
      ) : !divisions || divisions.length === 0 ? (
        <p className="px-5 py-8 text-sm text-slate" data-testid="divisions-empty">
          No divisions — one overall standing.
        </p>
      ) : (
        <ul className="divide-y divide-white/5">
          {divisions.map((d) => (
            <li
              key={d.id}
              className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"
              data-testid={`division-${d.id}`}
            >
              <div>
                <p className="font-semibold text-silver">{d.name}</p>
                <p className="mt-0.5 text-sm text-slate">
                  {divisionCriteria(d)}
                </p>
              </div>
              <Badge tone="violet" shape="pill">
                {divisionBasisLabel(d.basis)}
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </GlassCard>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export function TournamentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const tournamentId = Number(id);
  const validId = Number.isFinite(tournamentId) && tournamentId > 0;

  const query = useTournament(tournamentId);
  const divisionsQuery = useTournamentDivisions(tournamentId);
  const t = query.data;

  // Invalid / not-found id.
  if (!validId || (query.isError && query.error instanceof ApiError && query.error.status === 404)) {
    return (
      <div className="mx-auto max-w-3xl animate-fade-in-up">
        <BackLink />
        <GlassCard className="mt-6 px-6 py-16 text-center" data-testid="tournament-not-found">
          <Trophy className="mx-auto h-10 w-10 text-slate/60" aria-hidden />
          <p className="mt-4 text-base font-bold text-silver">
            Tournament not found
          </p>
          <p className="mt-1 text-sm text-slate">
            This event may have been removed, or the link is incorrect.
          </p>
        </GlassCard>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl animate-fade-in-up">
      <BackLink />

      {query.isLoading ? (
        <div className="mt-6 flex items-center gap-3 py-12 text-sm text-slate">
          <Loader2 className="h-5 w-5 animate-spin text-azure" aria-hidden />
          Loading tournament…
        </div>
      ) : query.isError ? (
        <div
          role="alert"
          className="mt-6 rounded-xl bg-red-500/15 p-4 text-sm text-red-400"
          data-testid="tournament-error"
        >
          {errorMessage(query.error)}
        </div>
      ) : t ? (
        <>
          {/* Header */}
          <div className="mt-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={statusTone(t.status)} shape="pill">
                {statusLabel(t.status)}
              </Badge>
              {t.counts_toward_handicap && (
                <Badge tone="gold" className="gap-1.5">
                  <UserCheck className="h-3.5 w-3.5" aria-hidden />
                  Counts toward handicap
                </Badge>
              )}
            </div>
            <h1 className="mt-3 text-2xl font-black text-silver">{t.name}</h1>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Badge tone="azure" className="gap-1.5">
                <Flag className="h-3.5 w-3.5" aria-hidden />
                {formatLabel(t.format)}
              </Badge>
              <Badge tone="emerald" className="gap-1.5">
                <Scale className="h-3.5 w-3.5" aria-hidden />
                {scoringBasisLabel(t.scoring_basis)}
              </Badge>
              <Badge tone="slate">
                <span className="font-mono">{t.holes}</span>&nbsp;holes
              </Badge>
              <Badge tone="slate" className="gap-1.5">
                <CalendarDays className="h-3.5 w-3.5" aria-hidden />
                {formatDateRange(t.start_date, t.end_date)}
              </Badge>
            </div>

            <p className="mt-3 text-sm text-slate">
              {eligibilitySummary(t) ?? 'Open to all juniors'}
            </p>
          </div>

          {/* Description */}
          {t.description && (
            <GlassCard className="mt-6 p-5">
              <h2 className="text-sm font-bold uppercase tracking-widest text-azure">
                About
              </h2>
              <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-silver">
                {t.description}
              </p>
            </GlassCard>
          )}

          {/* Eligibility */}
          <div className="mt-6">
            <EligibilityPanel t={t} />
          </div>

          {/* Divisions */}
          <div className="mt-6">
            <DivisionsSection
              divisions={divisionsQuery.data}
              isLoading={divisionsQuery.isLoading}
              isError={divisionsQuery.isError}
              error={divisionsQuery.error}
            />
          </div>
        </>
      ) : null}
    </div>
  );
}
