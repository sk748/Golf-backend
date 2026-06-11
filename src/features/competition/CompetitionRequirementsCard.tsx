// CompetitionRequirementsCard — shows a junior's competition requirements for
// the current (or a given) season. Self-contained: fetches its own data by
// juniorId and renders loading / empty / error states inline.
//
// Suitable for:
//   - coach / committee view of a junior's profile
//   - parent view of their child's progress
//   - player dashboard (self)
//
// Props:
//   juniorId  — the junior's numeric id (from /api/juniors/:id or /api/juniors/me)
//   season    — optional YYYY; defaults to backend current year when omitted
//   className — optional extra Tailwind classes on the outer card

import { CheckCircle2, Circle, Loader2, TrendingUp } from 'lucide-react';

import { cn } from '../../lib/cn';
import { GlassCard } from '../../components/ui/GlassCard';
import { Badge } from '../../components/ui/Badge';
import {
  useCompetitionRequirements,
  type MandatoryRequirement,
  type EncouragedRequirement,
} from './competition.queries';
import { competitionLabel } from './competition';

// ── Props ─────────────────────────────────────────────────────────────────────

export interface CompetitionRequirementsCardProps {
  juniorId: number | null | undefined;
  season?: number;
  className?: string;
}

// ── Helper components ─────────────────────────────────────────────────────────

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-xs font-bold uppercase tracking-widest text-slate">
      {children}
    </h3>
  );
}

function MandatoryRow({ req }: { req: MandatoryRequirement }) {
  const label = competitionLabel(req.competition_type);
  // Use the first evidence item's tournament_name / source as the "where/when" detail.
  const firstEvidence = req.evidence[0] ?? null;
  const detail = firstEvidence
    ? firstEvidence.tournament_name ?? firstEvidence.source ?? null
    : null;

  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-xl px-3 py-2.5 ring-1',
        req.met
          ? 'bg-emerald-500/8 ring-emerald-500/20'
          : 'bg-white/[0.03] ring-white/8',
      )}
    >
      {req.met ? (
        <CheckCircle2
          className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400"
          aria-hidden
        />
      ) : (
        <Circle
          className="mt-0.5 h-4 w-4 shrink-0 text-slate/50"
          aria-hidden
        />
      )}
      <div className="min-w-0">
        <p
          className={cn(
            'text-sm font-semibold',
            req.met ? 'text-emerald-300' : 'text-silver',
          )}
        >
          {label}
        </p>
        {detail ? (
          <p className="mt-0.5 truncate text-xs text-slate">{detail}</p>
        ) : !req.met ? (
          <p className="mt-0.5 text-xs text-slate">Not yet completed this season</p>
        ) : null}
      </div>
    </div>
  );
}

function EncouragedRow({ req }: { req: EncouragedRequirement }) {
  const label = competitionLabel(req.competition_type);
  return (
    <div className="flex items-center gap-2.5">
      {req.met ? (
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" aria-hidden />
      ) : (
        <Circle className="h-3.5 w-3.5 shrink-0 text-slate/40" aria-hidden />
      )}
      <span
        className={cn(
          'text-sm',
          req.met ? 'text-silver' : 'text-slate',
        )}
      >
        {label}
      </span>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function CompetitionRequirementsCard({
  juniorId,
  season,
  className,
}: CompetitionRequirementsCardProps) {
  const query = useCompetitionRequirements(juniorId, season);

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (query.isLoading) {
    return (
      <GlassCard className={cn('px-5 py-5', className)}>
        <div className="flex items-center gap-3 text-sm text-slate">
          <Loader2 className="h-4 w-4 animate-spin text-azure" aria-hidden />
          Loading competition requirements…
        </div>
      </GlassCard>
    );
  }

  // ── Error ────────────────────────────────────────────────────────────────────
  if (query.isError || !query.data) {
    return (
      <GlassCard className={cn('px-5 py-5', className)}>
        <p className="text-sm text-slate">
          Competition requirements unavailable.
        </p>
      </GlassCard>
    );
  }

  const { band, level, mandatory, encouraged, competitive_rounds: cr } = query.data;
  const seasonYear = query.data.season;

  const mandatoryMet = mandatory.filter((r) => r.met).length;
  const mandatoryTotal = mandatory.length;
  const allMandatoryMet = mandatoryTotal > 0 && mandatoryMet === mandatoryTotal;

  return (
    <GlassCard className={cn('overflow-hidden', className)}>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 px-5 py-4">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-azure" aria-hidden />
          <h2 className="text-sm font-bold uppercase tracking-widest text-azure">
            Competition Requirements
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone="violet" shape="pill">
            {band} · Level {level}
          </Badge>
          <Badge tone="slate" shape="pill">
            {seasonYear}
          </Badge>
        </div>
      </div>

      <div className="space-y-5 px-5 py-5">
        {/* Competitive rounds this month */}
        {cr.expected && (
          <div>
            <SectionHeader>Competitive rounds this month</SectionHeader>
            <div
              className={cn(
                'mt-2 flex items-center justify-between rounded-xl px-4 py-3 ring-1',
                cr.on_track
                  ? 'bg-emerald-500/8 ring-emerald-500/20'
                  : 'bg-gold/8 ring-gold/20',
              )}
            >
              <div>
                <p className="text-2xl font-black text-silver">
                  {cr.this_month}
                  <span className="ml-1 text-sm font-semibold text-slate">
                    / {cr.target_min}–{cr.target_max} target
                  </span>
                </p>
              </div>
              <Badge tone={cr.on_track ? 'emerald' : 'gold'} shape="pill">
                {cr.on_track ? 'On track' : 'Behind'}
              </Badge>
            </div>
          </div>
        )}

        {/* Mandatory competitions */}
        {mandatoryTotal > 0 && (
          <div>
            <div className="flex items-center justify-between">
              <SectionHeader>Mandatory this season</SectionHeader>
              <span className="text-xs text-slate">
                {mandatoryMet}/{mandatoryTotal}
                {allMandatoryMet && (
                  <span className="ml-1.5 font-semibold text-emerald-400">
                    complete
                  </span>
                )}
              </span>
            </div>
            <ul className="mt-2 space-y-2" role="list">
              {mandatory.map((req) => (
                <li key={req.competition_type}>
                  <MandatoryRow req={req} />
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Encouraged competitions */}
        {encouraged.length > 0 && (
          <div>
            <SectionHeader>Encouraged this season</SectionHeader>
            <ul className="mt-2 space-y-1.5" role="list">
              {encouraged.map((req) => (
                <li key={req.competition_type}>
                  <EncouragedRow req={req} />
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Empty state: no requirements defined for this band */}
        {mandatoryTotal === 0 && encouraged.length === 0 && !cr.expected && (
          <p className="text-sm text-slate">
            No competition requirements set for this band yet.
          </p>
        )}
      </div>
    </GlassCard>
  );
}
