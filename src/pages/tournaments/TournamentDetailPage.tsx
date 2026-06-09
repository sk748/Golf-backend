// Tournament detail — SHARED across all roles. The header, eligibility rules,
// divisions, and description are read-only and identical for everyone. Below
// that, a ROLE-AWARE entry section lets a player RSVP ("I'm interested") and a
// parent register / approve / decline / withdraw their child(ren) — the
// player-RSVP → parent-approval flow. admin/coach/committee see nothing new here
// (their tools are a later pass). The backend is authoritative on eligibility
// and status transitions; the UI gates optimistically and surfaces backend
// errors (INELIGIBLE 400, duplicate 409) inline.

import { useParams, Link } from 'react-router-dom';
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Flag,
  Hand,
  Heart,
  Layers,
  ListOrdered,
  Loader2,
  PencilLine,
  Scale,
  ShieldCheck,
  Trophy,
  UserCheck,
  X,
} from 'lucide-react';

import { ApiError } from '../../lib/api';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { GlassCard } from '../../components/ui/GlassCard';
import { useAuth } from '../../auth/useAuth';
import {
  childName,
  useMyChildren,
  type ParentChild,
} from '../parent/parent-children.queries';
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
  type Tournament,
  type TournamentDivision,
} from './tournaments.queries';
import {
  columnValue,
  leaderboardColumns,
  rankDisplay,
  useLeaderboard,
  type LeaderboardColumn,
  type LeaderboardDivision,
  type LeaderboardRow,
} from './tournament-scores.queries';
import {
  eligibility,
  entryStatusLabel,
  entryStatusTone,
  useApproveEntry,
  useCreateEntry,
  useDeclineEntry,
  useMyEntries,
  useMyJunior,
  useWithdrawEntry,
  type EligibilityJunior,
  type TournamentEntry,
} from './tournament-entries.queries';

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

// ── Entry / RSVP section (role-aware) ─────────────────────────────────────────

function isRegistrationOpen(t: Tournament): boolean {
  return t.status === 'registration_open';
}

// A friendly inline message derived from a mutation error.
function mutationMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'CONFLICT' || error.status === 409) {
      return error.message || 'This entry already exists.';
    }
    if (error.code === 'INELIGIBLE') {
      return error.message || 'This junior is not eligible for this event.';
    }
    return error.message;
  }
  if (error instanceof Error) return error.message;
  return 'Something went wrong. Please try again.';
}

function SectionShell({
  children,
  subtitle,
}: {
  children: React.ReactNode;
  subtitle?: string;
}) {
  return (
    <GlassCard className="overflow-hidden" data-testid="entry-section">
      <div className="flex items-center gap-2 border-b border-white/5 px-5 py-4">
        <Trophy className="h-4 w-4 text-azure" aria-hidden />
        <div>
          <h2 className="text-sm font-bold uppercase tracking-widest text-azure">
            Your entry
          </h2>
          {subtitle ? (
            <p className="mt-0.5 text-xs normal-case tracking-normal text-slate">
              {subtitle}
            </p>
          ) : null}
        </div>
      </div>
      <div className="px-5 py-5">{children}</div>
    </GlassCard>
  );
}

function ReasonsList({ reasons }: { reasons: string[] }) {
  if (reasons.length === 0) return null;
  return (
    <ul className="mt-1 space-y-1 text-xs text-slate">
      {reasons.map((r) => (
        <li key={r}>• {r}</li>
      ))}
    </ul>
  );
}

// ── Player: RSVP for themselves ───────────────────────────────────────────────

function PlayerEntrySection({ t }: { t: Tournament }) {
  const junior = useMyJunior();
  const entries = useMyEntries({ tournamentId: t.id });
  const create = useCreateEntry();
  const withdraw = useWithdrawEntry();

  // /api/juniors/me 404s when the signed-in user has no junior profile.
  if (junior.isError) {
    const status = junior.error instanceof ApiError ? junior.error.status : 0;
    return (
      <SectionShell>
        <p className="text-sm text-slate" data-testid="player-no-profile">
          {status === 404
            ? "You don't have a player profile yet, so you can't enter events. Please check with the club office."
            : 'Could not load your player profile.'}
        </p>
      </SectionShell>
    );
  }

  if (junior.isLoading || entries.isLoading) {
    return (
      <SectionShell>
        <div className="flex items-center gap-2 text-sm text-slate">
          <Loader2 className="h-4 w-4 animate-spin text-azure" aria-hidden />
          Loading your entry…
        </div>
      </SectionShell>
    );
  }

  const me = junior.data;
  if (!me) return null;

  const myEntry = (entries.data ?? []).find(
    (e) => e.tournament_id === t.id && e.junior_id === me.id,
  );

  // Already has an entry — show its status warmly (+ cancel while interested).
  if (myEntry) {
    return (
      <SectionShell>
        <PlayerEntryStatus
          entry={myEntry}
          onCancel={() => withdraw.mutate(myEntry.id)}
          canceling={withdraw.isPending}
          cancelError={withdraw.isError ? withdraw.error : null}
        />
      </SectionShell>
    );
  }

  const open = isRegistrationOpen(t);
  const verdict = eligibility(t, me as EligibilityJunior);

  if (!open) {
    return (
      <SectionShell>
        <p className="text-sm text-slate" data-testid="player-closed">
          Registration isn&apos;t open for this event right now.
        </p>
      </SectionShell>
    );
  }

  if (!verdict.eligible) {
    return (
      <SectionShell subtitle="This event has entry requirements you don't meet yet.">
        <p className="text-sm font-semibold text-silver">Not eligible just yet</p>
        <ReasonsList reasons={verdict.reasons} />
        <Button variant="ghost" size="sm" disabled className="mt-4">
          I&apos;m interested
        </Button>
      </SectionShell>
    );
  }

  return (
    <SectionShell subtitle="Let your parent know you'd like to play — they'll confirm your spot.">
      <Button
        size="md"
        onClick={() => create.mutate({ tournament_id: t.id, junior_id: me.id })}
        disabled={create.isPending}
        data-testid="player-rsvp-btn"
      >
        {create.isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : (
          <Hand className="h-4 w-4" aria-hidden />
        )}
        I&apos;m interested
      </Button>
      {create.isError ? (
        <p
          role="alert"
          className="mt-3 rounded-xl bg-red-500/15 p-3 text-sm text-red-400"
          data-testid="player-rsvp-error"
        >
          {mutationMessage(create.error)}
        </p>
      ) : null}
    </SectionShell>
  );
}

function PlayerEntryStatus({
  entry,
  onCancel,
  canceling,
  cancelError,
}: {
  entry: TournamentEntry;
  onCancel: () => void;
  canceling: boolean;
  cancelError: unknown;
}) {
  const headline =
    entry.status === 'interested'
      ? 'Waiting for a parent to confirm'
      : entry.status === 'registered' || entry.status === 'confirmed'
        ? "You're in 🎉"
        : entry.status === 'declined'
          ? 'Not this time'
          : 'Entry withdrawn';

  const blurb =
    entry.status === 'interested'
      ? "We've let your parent know — they'll approve your spot."
      : entry.status === 'registered' || entry.status === 'confirmed'
        ? 'Your place is confirmed. See you on the course!'
        : entry.status === 'declined'
          ? 'This one wasn’t approved this time — there will be more events soon.'
          : 'This entry has been withdrawn.';

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={entryStatusTone(entry.status)}>
          {entryStatusLabel(entry.status)}
        </Badge>
      </div>
      <p className="mt-3 text-base font-bold text-silver">{headline}</p>
      <p className="mt-1 text-sm text-slate">{blurb}</p>

      {entry.status === 'interested' ? (
        <>
          <Button
            variant="ghost"
            size="sm"
            onClick={onCancel}
            disabled={canceling}
            className="mt-4"
            data-testid="player-cancel-btn"
          >
            {canceling ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <X className="h-4 w-4" aria-hidden />
            )}
            Cancel
          </Button>
          {cancelError ? (
            <p
              role="alert"
              className="mt-3 rounded-xl bg-red-500/15 p-3 text-sm text-red-400"
            >
              {mutationMessage(cancelError)}
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

// ── Parent: register / approve / decline / withdraw per child ─────────────────

function ParentEntrySection({ t }: { t: Tournament }) {
  const children = useMyChildren();
  const entries = useMyEntries({ tournamentId: t.id });

  if (children.isLoading || entries.isLoading) {
    return (
      <SectionShell>
        <div className="flex items-center gap-2 text-sm text-slate">
          <Loader2 className="h-4 w-4 animate-spin text-azure" aria-hidden />
          Loading your family…
        </div>
      </SectionShell>
    );
  }

  if (children.isError) {
    return (
      <SectionShell>
        <p
          role="alert"
          className="rounded-xl bg-red-500/15 p-3 text-sm text-red-400"
        >
          {children.error instanceof ApiError
            ? children.error.message
            : "Could not load your child's details."}
        </p>
      </SectionShell>
    );
  }

  const kids = children.data ?? [];
  if (kids.length === 0) {
    return (
      <SectionShell>
        <p className="text-sm text-slate" data-testid="parent-no-children">
          No child is linked to your account yet, so there&apos;s nothing to
          register. Please check with the club office.
        </p>
      </SectionShell>
    );
  }

  return (
    <SectionShell subtitle="Register your child, or approve a spot they've asked for.">
      <ul className="divide-y divide-white/5" data-testid="parent-children-entries">
        {kids.map((child) => (
          <ParentChildEntryRow
            key={child.id}
            t={t}
            child={child}
            entry={(entries.data ?? []).find(
              (e) => e.tournament_id === t.id && e.junior_id === child.id,
            )}
          />
        ))}
      </ul>
    </SectionShell>
  );
}

function ParentChildEntryRow({
  t,
  child,
  entry,
}: {
  t: Tournament;
  child: ParentChild;
  entry: TournamentEntry | undefined;
}) {
  const create = useCreateEntry();
  const approve = useApproveEntry();
  const decline = useDeclineEntry();
  const withdraw = useWithdrawEntry();

  const busy =
    create.isPending ||
    approve.isPending ||
    decline.isPending ||
    withdraw.isPending;

  const actionError =
    (create.isError && create.error) ||
    (approve.isError && approve.error) ||
    (decline.isError && decline.error) ||
    (withdraw.isError && withdraw.error) ||
    null;

  const name = childName(child);
  const open = isRegistrationOpen(t);
  const verdict = eligibility(t, child as EligibilityJunior);

  return (
    <li className="py-4 first:pt-0 last:pb-0" data-testid={`parent-child-${child.id}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-silver">{name}</p>
          <p className="mt-0.5 text-xs text-slate">Level {child.current_level}</p>
        </div>
        {entry ? (
          <Badge tone={entryStatusTone(entry.status)}>
            {entryStatusLabel(entry.status)}
          </Badge>
        ) : null}
      </div>

      <div className="mt-3">
        {entry ? (
          // Has an entry: actions depend on its status.
          entry.status === 'interested' ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                onClick={() => approve.mutate(entry.id)}
                disabled={busy}
                data-testid={`approve-${child.id}`}
              >
                {approve.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <CheckCircle2 className="h-4 w-4" aria-hidden />
                )}
                Approve
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => decline.mutate(entry.id)}
                disabled={busy}
                data-testid={`decline-${child.id}`}
              >
                {decline.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <X className="h-4 w-4" aria-hidden />
                )}
                Decline
              </Button>
              <span className="text-xs text-slate">
                {name} asked to play — confirm their spot.
              </span>
            </div>
          ) : entry.status === 'registered' || entry.status === 'confirmed' ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => withdraw.mutate(entry.id)}
                disabled={busy}
                data-testid={`withdraw-${child.id}`}
              >
                {withdraw.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <X className="h-4 w-4" aria-hidden />
                )}
                Withdraw
              </Button>
            </div>
          ) : (
            <p className="text-xs text-slate">
              {entry.status === 'declined'
                ? 'You declined this entry.'
                : 'This entry has been withdrawn.'}
            </p>
          )
        ) : !open ? (
          <p className="text-xs text-slate">Registration is not open.</p>
        ) : !verdict.eligible ? (
          <div>
            <Button variant="ghost" size="sm" disabled data-testid={`register-${child.id}`}>
              Register
            </Button>
            <ReasonsList reasons={verdict.reasons} />
          </div>
        ) : (
          <Button
            size="sm"
            onClick={() =>
              create.mutate({ tournament_id: t.id, junior_id: child.id })
            }
            disabled={busy}
            data-testid={`register-${child.id}`}
          >
            {create.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Heart className="h-4 w-4" aria-hidden />
            )}
            Register
          </Button>
        )}
      </div>

      {actionError ? (
        <p
          role="alert"
          className="mt-3 rounded-xl bg-red-500/15 p-3 text-sm text-red-400"
        >
          {mutationMessage(actionError)}
        </p>
      ) : null}
    </li>
  );
}

// Picks the right entry section for the signed-in role; renders nothing for
// admin/coach/committee (their tooling is a later pass).
function EntrySection({ t }: { t: Tournament }) {
  const { user } = useAuth();
  if (user?.role === 'player') return <PlayerEntrySection t={t} />;
  if (user?.role === 'parent') return <ParentEntrySection t={t} />;
  return null;
}

// ── Leaderboard (all roles, read-only) ────────────────────────────────────────
// Ranks + ties are computed server-side; we only display them. Columns depend
// on format/basis (Stableford → Points; stroke/match → Gross, +Net for net/both).

function LeaderboardDivisionTable({
  division,
  columns,
}: {
  division: LeaderboardDivision;
  columns: LeaderboardColumn[];
}) {
  const rows = division.rows;
  return (
    <div className="overflow-x-auto" data-testid={`leaderboard-division-${division.division_id ?? 'overall'}`}>
      {division.division ? (
        <p className="px-5 pb-2 pt-4 text-xs font-bold uppercase tracking-widest text-slate">
          {division.division}
        </p>
      ) : null}
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wider text-slate">
            <th scope="col" className="px-5 py-2 font-semibold">
              #
            </th>
            <th scope="col" className="py-2 font-semibold">
              Golfer
            </th>
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                className="px-3 py-2 text-right font-semibold"
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row: LeaderboardRow) => (
            <tr
              key={row.entry_id}
              className="border-t border-white/5"
              data-testid={`leaderboard-row-${row.entry_id}`}
            >
              <td className="px-5 py-3 font-mono font-bold text-gold">
                {rankDisplay(row.rank, rows)}
              </td>
              <td className="py-3 font-semibold text-silver">
                {row.name?.trim() || `Golfer #${row.junior_id}`}
              </td>
              {columns.map((c) => (
                <td
                  key={c.key}
                  className="px-3 py-3 text-right font-mono text-silver"
                >
                  {columnValue(row, c.key)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LeaderboardSection({ t }: { t: Tournament }) {
  const query = useLeaderboard(t.id);
  const columns = leaderboardColumns(t.format, t.scoring_basis);
  const divisions = (query.data?.divisions ?? []).filter(
    (d) => d.rows.length > 0,
  );
  const hasRows = divisions.length > 0;

  // Pre-scoring lifecycle with nothing on the board yet: a muted hint, not an
  // alarming empty state.
  const preScoring =
    t.status !== 'in_progress' && t.status !== 'completed';
  if (preScoring && !hasRows && !query.isLoading) {
    return (
      <GlassCard className="overflow-hidden" data-testid="leaderboard-section">
        <SectionHeader />
        <p
          className="px-5 py-8 text-sm text-slate"
          data-testid="leaderboard-pre"
        >
          Leaderboard appears once scoring begins.
        </p>
      </GlassCard>
    );
  }

  return (
    <GlassCard className="overflow-hidden" data-testid="leaderboard-section">
      <SectionHeader />
      {query.isLoading ? (
        <div className="flex items-center gap-3 px-5 py-8 text-sm text-slate">
          <Loader2 className="h-5 w-5 animate-spin text-azure" aria-hidden />
          Loading leaderboard…
        </div>
      ) : query.isError ? (
        <div
          role="alert"
          className="m-5 rounded-xl bg-red-500/15 p-3 text-sm text-red-400"
          data-testid="leaderboard-error"
        >
          {errorMessage(query.error)}
        </div>
      ) : !hasRows ? (
        <p className="px-5 py-8 text-sm text-slate" data-testid="leaderboard-empty">
          No scores yet.
        </p>
      ) : (
        <div className="divide-y divide-white/5 pb-2">
          {divisions.map((d) => (
            <LeaderboardDivisionTable
              key={d.division_id ?? 'overall'}
              division={d}
              columns={columns}
            />
          ))}
        </div>
      )}
    </GlassCard>
  );
}

function SectionHeader() {
  return (
    <div className="flex items-center gap-2 border-b border-white/5 px-5 py-4">
      <ListOrdered className="h-4 w-4 text-azure" aria-hidden />
      <h2 className="text-sm font-bold uppercase tracking-widest text-azure">
        Leaderboard
      </h2>
    </div>
  );
}

// Admin/coach get a link to the dedicated score-entry page (always shown; that
// page gates on the not-in-progress status itself).
function ScoreEntryLink({ t }: { t: Tournament }) {
  const { user } = useAuth();
  if (user?.role !== 'admin' && user?.role !== 'coach') return null;
  return (
    <Link to={`/tournaments/${t.id}/enter-scores`} data-testid="enter-scores-link">
      <Button size="md">
        <PencilLine className="h-4 w-4" aria-hidden />
        Enter scores
      </Button>
    </Link>
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

            <div className="mt-4">
              <ScoreEntryLink t={t} />
            </div>
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

          {/* Role-aware entry / RSVP (player + parent only) */}
          <div className="mt-6">
            <EntrySection t={t} />
          </div>

          {/* Leaderboard (all roles, read-only) */}
          <div className="mt-6">
            <LeaderboardSection t={t} />
          </div>
        </>
      ) : null}
    </div>
  );
}
