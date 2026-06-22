// Junior League STAFF MANAGEMENT (admin/coach/committee). The single place where
// staff run a league end-to-end: create/edit leagues + points, manage the clubs
// (teams), build the fixture schedule, and — the important bit — set the team
// selection and results for each fixture's pairings. All scoring/standings are
// recomputed server-side; saving a result invalidates the league feeds so the
// public standings + dashboards refresh. Route-gated to staff in App.tsx; the
// controls here are additionally role-checked.

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  CalendarRange,
  ChevronRight,
  Loader2,
  Pencil,
  Plus,
  Settings,
  Star,
  Swords,
  Trash2,
  Trophy,
  Users,
  X,
} from 'lucide-react';

import { useAuth } from '../../auth/useAuth';
import { ApiError } from '../../lib/api';
import { cn } from '../../lib/cn';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { GlassCard } from '../../components/ui/GlassCard';
import {
  useAllJuniors,
  useCoachJuniors,
  type AssignableJunior,
} from '../admin/coach-assignment.queries';
import {
  fixtureDate,
  fixtureStatusLabel,
  fixtureStatusTone,
  pairingFormatLabel,
  useCreateFixture,
  useCreateLeague,
  useCreatePairing,
  useCreateTeam,
  useDeleteFixture,
  useDeleteLeague,
  useDeletePairing,
  useDeleteTeam,
  useFixture,
  useFixtures,
  useLeague,
  useLeagues,
  useSetCurrentLeague,
  useUpdateFixture,
  useUpdateLeague,
  useUpdatePairing,
  useUpdateTeam,
  type CreateFixtureInput,
  type CreateLeagueInput,
  type CreatePairingInput,
  type CreateTeamInput,
  type Fixture,
  type FixtureResult,
  type FixtureStatus,
  type League,
  type LeagueStatus,
  type Pairing,
  type PairingFormat,
  type Team,
} from './league.queries';

// ── Shared styling + helpers ──────────────────────────────────────────────────

const inputClass =
  'w-full rounded-xl bg-white/5 px-4 py-3 text-sm text-silver placeholder:text-slate/60 outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-azure/60 disabled:opacity-50';
const labelClass = 'block text-sm font-semibold text-silver';

function errorMessage(err: unknown, fallback = 'Something went wrong.'): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return fallback;
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className={labelClass}>
        {label}
      </label>
      {children}
    </div>
  );
}

function FormError({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <p
      role="alert"
      className="rounded-xl bg-red-500/15 p-3 text-sm text-red-400"
      data-testid="league-manage-error"
    >
      {errorMessage(error)}
    </p>
  );
}

function SectionHeader({
  icon,
  title,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 border-b border-white/5 px-5 py-4">
      {icon}
      <h2 className="flex-1 text-sm font-bold uppercase tracking-widest text-azure">
        {title}
      </h2>
      {action}
    </div>
  );
}

const FIXTURE_STATUSES: FixtureStatus[] = [
  'scheduled',
  'in_progress',
  'completed',
  'cancelled',
];
const LEAGUE_STATUSES: LeagueStatus[] = [
  'draft',
  'active',
  'completed',
  'archived',
];
const PAIRING_FORMATS: PairingFormat[] = ['singles', 'foursomes', 'fourball'];
const PAIRING_RESULTS: FixtureResult[] = [
  'pending',
  'home_win',
  'away_win',
  'halved',
];

function resultLabel(r: FixtureResult): string {
  switch (r) {
    case 'home_win':
      return 'Home win';
    case 'away_win':
      return 'Away win';
    case 'halved':
      return 'Halved';
    default:
      return 'Pending';
  }
}

// Team-named result label: replaces generic "Home win / Away win" with the
// actual club names for a specific fixture. E.g. "Karen won", "Sigona won".
function teamResultLabel(
  r: FixtureResult,
  homeName: string,
  awayName: string,
): string {
  switch (r) {
    case 'home_win':
      return `${homeName} won`;
    case 'away_win':
      return `${awayName} won`;
    case 'halved':
      return 'Halved';
    default:
      return 'Pending';
  }
}

function leagueStatusLabel(s: LeagueStatus): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ── League editor (create / edit the selected league + points + set-current) ───

function LeagueEditor({
  league,
  onCreated,
}: {
  league: League | null;
  onCreated: (id: number) => void;
}) {
  const create = useCreateLeague();
  const update = useUpdateLeague();
  const setCurrent = useSetCurrentLeague();
  const del = useDeleteLeague();

  const [name, setName] = useState('');
  const [year, setYear] = useState('');
  const [status, setStatus] = useState<LeagueStatus>('draft');
  const [pointsWin, setPointsWin] = useState('1');
  const [pointsHalve, setPointsHalve] = useState('0.5');
  const [pointsLoss, setPointsLoss] = useState('0');
  const [description, setDescription] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const editing = Boolean(league);

  // Sync the form when the selected league changes (or when starting a new one).
  useEffect(() => {
    setName(league?.name ?? '');
    setYear(league?.year != null ? String(league.year) : '');
    setStatus(league?.status ?? 'draft');
    setPointsWin(league ? String(league.points_win) : '1');
    setPointsHalve(league ? String(league.points_halve) : '0.5');
    setPointsLoss(league ? String(league.points_loss) : '0');
    setDescription(league?.description ?? '');
  }, [league]);

  const numOrNull = (v: string): number | null => {
    const t = v.trim();
    if (t === '') return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  };

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const body: CreateLeagueInput = {
      name: name.trim(),
      year: numOrNull(year),
      status,
      points_win: numOrNull(pointsWin) ?? 1,
      points_halve: numOrNull(pointsHalve) ?? 0.5,
      points_loss: numOrNull(pointsLoss) ?? 0,
      description: description.trim() || null,
    };
    if (editing && league) {
      update.mutate({ id: league.id, body });
    } else {
      create.mutate(body, { onSuccess: (l) => onCreated(l.id) });
    }
  }

  const busy = create.isPending || update.isPending;
  const mutationError = editing ? update.error : create.error;

  return (
    <GlassCard className="overflow-hidden" data-testid="league-editor">
      <SectionHeader
        icon={<Settings className="h-4 w-4 text-azure" aria-hidden />}
        title={editing ? 'League settings' : 'Create a league'}
        action={
          editing && league ? (
            <div className="flex items-center gap-2">
              {!league.is_current ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setCurrent.mutate(league.id)}
                  disabled={setCurrent.isPending}
                  data-testid="league-set-current"
                >
                  <Star className="h-4 w-4" aria-hidden />
                  Set as current
                </Button>
              ) : (
                <Badge tone="gold" shape="pill">
                  Current
                </Badge>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setConfirmDelete(true)}
                data-testid="league-delete"
              >
                <Trash2 className="h-4 w-4 text-red-400" aria-hidden />
              </Button>
            </div>
          ) : null
        }
      />
      <form className="space-y-4 p-5" onSubmit={handleSubmit}>
        <Field label="League name" htmlFor="lg-name">
          <input
            id="lg-name"
            className={inputClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Karen Junior Inter-Club League"
            required
            data-testid="league-name-input"
          />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Year" htmlFor="lg-year">
            <input
              id="lg-year"
              type="number"
              className={inputClass}
              value={year}
              onChange={(e) => setYear(e.target.value)}
              placeholder="2026"
              data-testid="league-year-input"
            />
          </Field>
          <Field label="Status" htmlFor="lg-status">
            <select
              id="lg-status"
              className={inputClass}
              value={status}
              onChange={(e) => setStatus(e.target.value as LeagueStatus)}
              data-testid="league-status-select"
            >
              {LEAGUE_STATUSES.map((s) => (
                <option key={s} value={s} className="bg-navy">
                  {leagueStatusLabel(s)}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <Field label="Points · win" htmlFor="lg-pw">
            <input
              id="lg-pw"
              type="number"
              step="0.5"
              className={inputClass}
              value={pointsWin}
              onChange={(e) => setPointsWin(e.target.value)}
              data-testid="league-points-win"
            />
          </Field>
          <Field label="Points · halve" htmlFor="lg-ph">
            <input
              id="lg-ph"
              type="number"
              step="0.5"
              className={inputClass}
              value={pointsHalve}
              onChange={(e) => setPointsHalve(e.target.value)}
              data-testid="league-points-halve"
            />
          </Field>
          <Field label="Points · loss" htmlFor="lg-pl">
            <input
              id="lg-pl"
              type="number"
              step="0.5"
              className={inputClass}
              value={pointsLoss}
              onChange={(e) => setPointsLoss(e.target.value)}
              data-testid="league-points-loss"
            />
          </Field>
        </div>
        <Field label="Description" htmlFor="lg-desc">
          <textarea
            id="lg-desc"
            className={cn(inputClass, 'min-h-[72px] resize-y')}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional — shown on the league overview."
            data-testid="league-description-input"
          />
        </Field>
        <FormError error={mutationError} />
        <div className="flex justify-end">
          <Button
            type="submit"
            disabled={busy || name.trim() === ''}
            data-testid="league-save"
          >
            {busy ? 'Saving…' : editing ? 'Save changes' : 'Create league'}
          </Button>
        </div>
      </form>

      {league ? (
        <ConfirmDialog
          open={confirmDelete}
          destructive
          title="Delete this league?"
          message="This removes the league and its fixtures, teams and results. This cannot be undone."
          confirmLabel="Delete league"
          busy={del.isPending}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() =>
            del.mutate(league.id, {
              onSuccess: () => {
                setConfirmDelete(false);
                onCreated(0); // clear selection → back to create form
              },
            })
          }
        />
      ) : null}
    </GlassCard>
  );
}

// ── Teams ─────────────────────────────────────────────────────────────────────

function TeamRow({ team, leagueId }: { team: Team; leagueId: number }) {
  const update = useUpdateTeam();
  const del = useDeleteTeam();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(team.name);
  const [shortName, setShortName] = useState(team.short_name ?? '');
  const [isHome, setIsHome] = useState(team.is_home_club);
  const [confirm, setConfirm] = useState(false);

  if (editing) {
    return (
      <div className="space-y-3 border-t border-white/5 px-5 py-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <input
            aria-label="Team name"
            className={inputClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
            data-testid={`team-edit-name-${team.id}`}
          />
          <input
            aria-label="Short name"
            className={inputClass}
            value={shortName}
            onChange={(e) => setShortName(e.target.value)}
            placeholder="Short name"
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-silver">
          <input
            type="checkbox"
            checked={isHome}
            onChange={(e) => setIsHome(e.target.checked)}
            className="h-4 w-4 accent-gold"
          />
          This is the home club (Karen)
        </label>
        <FormError error={update.error} />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={update.isPending || name.trim() === ''}
            onClick={() =>
              update.mutate(
                {
                  id: team.id,
                  body: {
                    name: name.trim(),
                    short_name: shortName.trim() || null,
                    is_home_club: isHome,
                  },
                },
                { onSuccess: () => setEditing(false) },
              )
            }
            data-testid={`team-save-${team.id}`}
          >
            {update.isPending ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex items-center gap-3 border-t border-white/5 px-5 py-3"
      data-testid={`team-row-${team.id}`}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-silver">
          {team.is_home_club ? (
            <Star
              className="mb-0.5 mr-1.5 inline h-3.5 w-3.5 fill-gold text-gold"
              aria-hidden
            />
          ) : null}
          {team.name}
          {team.short_name ? (
            <span className="ml-2 text-xs font-normal text-slate">
              {team.short_name}
            </span>
          ) : null}
        </p>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setEditing(true)}
        data-testid={`team-edit-${team.id}`}
      >
        <Pencil className="h-4 w-4" aria-hidden />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setConfirm(true)}
        data-testid={`team-remove-${team.id}`}
      >
        <Trash2 className="h-4 w-4 text-red-400" aria-hidden />
      </Button>
      <ConfirmDialog
        open={confirm}
        destructive
        title="Remove this club?"
        message={`Remove ${team.name} from the league? Any fixtures involving them will be affected.`}
        confirmLabel="Remove club"
        busy={del.isPending}
        onCancel={() => setConfirm(false)}
        onConfirm={() =>
          del.mutate(
            { id: team.id, leagueId },
            { onSuccess: () => setConfirm(false) },
          )
        }
      />
    </div>
  );
}

function TeamsSection({ leagueId, teams }: { leagueId: number; teams: Team[] }) {
  const create = useCreateTeam();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [shortName, setShortName] = useState('');
  const [isHome, setIsHome] = useState(false);

  function resetAdd() {
    setName('');
    setShortName('');
    setIsHome(false);
    setAdding(false);
  }

  return (
    <GlassCard className="overflow-hidden" data-testid="teams-section">
      <SectionHeader
        icon={<Users className="h-4 w-4 text-azure" aria-hidden />}
        title="Clubs / teams"
        action={
          !adding ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setAdding(true)}
              data-testid="team-add"
            >
              <Plus className="h-4 w-4" aria-hidden />
              Add club
            </Button>
          ) : null
        }
      />

      {adding ? (
        <form
          className="space-y-3 border-b border-white/5 bg-white/[0.02] px-5 py-4"
          onSubmit={(e) => {
            e.preventDefault();
            const body: CreateTeamInput = {
              league_id: leagueId,
              name: name.trim(),
              short_name: shortName.trim() || null,
              is_home_club: isHome,
            };
            create.mutate(body, { onSuccess: resetAdd });
          }}
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input
              aria-label="Club name"
              className={inputClass}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Club name"
              required
              data-testid="team-name-input"
            />
            <input
              aria-label="Short name"
              className={inputClass}
              value={shortName}
              onChange={(e) => setShortName(e.target.value)}
              placeholder="Short name (optional)"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-silver">
            <input
              type="checkbox"
              checked={isHome}
              onChange={(e) => setIsHome(e.target.checked)}
              className="h-4 w-4 accent-gold"
              data-testid="team-home-checkbox"
            />
            This is the home club (Karen)
          </label>
          <FormError error={create.error} />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={resetAdd}>
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={create.isPending || name.trim() === ''}
              data-testid="team-create"
            >
              {create.isPending ? 'Adding…' : 'Add club'}
            </Button>
          </div>
        </form>
      ) : null}

      {teams.length === 0 ? (
        <p className="px-5 py-8 text-sm text-slate" data-testid="teams-empty">
          No clubs yet. Add the home club and each opponent to build fixtures.
        </p>
      ) : (
        <div>
          {teams.map((t) => (
            <TeamRow key={t.id} team={t} leagueId={leagueId} />
          ))}
        </div>
      )}
    </GlassCard>
  );
}

// ── Fixtures ───────────────────────────────────────────────────────────────────

function FixtureForm({
  leagueId,
  teams,
  fixture,
  onDone,
}: {
  leagueId: number;
  teams: Team[];
  fixture?: Fixture;
  onDone: () => void;
}) {
  const create = useCreateFixture();
  const update = useUpdateFixture();
  const editing = Boolean(fixture);

  const [homeId, setHomeId] = useState(
    fixture ? String(fixture.home_team_id) : '',
  );
  const [awayId, setAwayId] = useState(
    fixture ? String(fixture.away_team_id) : '',
  );
  const [round, setRound] = useState(
    fixture?.round_number != null ? String(fixture.round_number) : '',
  );
  const [date, setDate] = useState(fixture?.date ?? '');
  const [location, setLocation] = useState(fixture?.location ?? '');
  const [status, setStatus] = useState<FixtureStatus>(
    fixture?.status ?? 'scheduled',
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const round_number = round.trim() === '' ? null : Number(round);
    if (editing && fixture) {
      update.mutate(
        {
          id: fixture.id,
          body: {
            home_team_id: Number(homeId),
            away_team_id: Number(awayId),
            round_number,
            date: date || null,
            location: location.trim() || null,
            status,
          },
        },
        { onSuccess: onDone },
      );
    } else {
      const body: CreateFixtureInput = {
        league_id: leagueId,
        home_team_id: Number(homeId),
        away_team_id: Number(awayId),
        round_number,
        date: date || null,
        location: location.trim() || null,
        status,
      };
      create.mutate(body, { onSuccess: onDone });
    }
  }

  const busy = create.isPending || update.isPending;
  const valid =
    homeId !== '' && awayId !== '' && homeId !== awayId;

  return (
    <form
      className="space-y-3 border-b border-white/5 bg-white/[0.02] px-5 py-4"
      onSubmit={handleSubmit}
      data-testid="fixture-form"
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Home team" htmlFor="fx-home">
          <select
            id="fx-home"
            className={inputClass}
            value={homeId}
            onChange={(e) => setHomeId(e.target.value)}
            required
            data-testid="fixture-home-select"
          >
            <option value="" className="bg-navy">
              Choose home team
            </option>
            {teams.map((t) => (
              <option key={t.id} value={t.id} className="bg-navy">
                {t.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Away team" htmlFor="fx-away">
          <select
            id="fx-away"
            className={inputClass}
            value={awayId}
            onChange={(e) => setAwayId(e.target.value)}
            required
            data-testid="fixture-away-select"
          >
            <option value="" className="bg-navy">
              Choose away team
            </option>
            {teams.map((t) => (
              <option key={t.id} value={t.id} className="bg-navy">
                {t.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="Round" htmlFor="fx-round">
          <input
            id="fx-round"
            type="number"
            className={inputClass}
            value={round}
            onChange={(e) => setRound(e.target.value)}
            placeholder="e.g. 1"
          />
        </Field>
        <Field label="Date" htmlFor="fx-date">
          <input
            id="fx-date"
            type="date"
            className={inputClass}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </Field>
        <Field label="Status" htmlFor="fx-status">
          <select
            id="fx-status"
            className={inputClass}
            value={status}
            onChange={(e) => setStatus(e.target.value as FixtureStatus)}
            data-testid="fixture-status-select"
          >
            {FIXTURE_STATUSES.map((s) => (
              <option key={s} value={s} className="bg-navy">
                {fixtureStatusLabel(s)}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Location" htmlFor="fx-loc">
        <input
          id="fx-loc"
          className={inputClass}
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="e.g. Karen Country Club"
        />
      </Field>
      {homeId !== '' && homeId === awayId ? (
        <p className="text-sm text-red-400">
          Home and away teams must be different.
        </p>
      ) : null}
      <FormError error={editing ? update.error : create.error} />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onDone}>
          Cancel
        </Button>
        <Button
          type="submit"
          size="sm"
          disabled={busy || !valid}
          data-testid="fixture-save"
        >
          {busy ? 'Saving…' : editing ? 'Save fixture' : 'Add fixture'}
        </Button>
      </div>
    </form>
  );
}

function FixtureRow({
  fixture,
  selected,
  onSelect,
  onEdit,
}: {
  fixture: Fixture;
  selected: boolean;
  onSelect: () => void;
  onEdit: () => void;
}) {
  const del = useDeleteFixture();
  const [confirm, setConfirm] = useState(false);
  const { summary } = fixture;

  return (
    <div
      className={cn(
        'border-t border-white/5',
        selected && 'bg-azure/5',
      )}
      data-testid={`fixture-row-${fixture.id}`}
    >
      <div className="flex items-center gap-2 px-5 py-3">
        <button
          type="button"
          onClick={onSelect}
          className="min-w-0 flex-1 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-azure/50"
          data-testid={`fixture-select-${fixture.id}`}
        >
          <p className="truncate text-sm font-semibold text-silver">
            {summary.home_team_name ?? 'Home'}{' '}
            <span className="text-slate">v</span>{' '}
            {summary.away_team_name ?? 'Away'}
          </p>
          <p className="mt-0.5 text-xs text-slate">
            {fixture.round_number != null
              ? `Round ${fixture.round_number} · `
              : ''}
            {fixtureDate(fixture.date)}
          </p>
        </button>
        {fixture.status === 'completed' || fixture.status === 'in_progress' ? (
          <span className="font-mono text-sm font-bold text-silver">
            {summary.home_points}–{summary.away_points}
          </span>
        ) : null}
        <Badge tone={fixtureStatusTone(fixture.status)} shape="pill">
          {fixtureStatusLabel(fixture.status)}
        </Badge>
        <Button
          variant="ghost"
          size="sm"
          onClick={onEdit}
          data-testid={`fixture-edit-${fixture.id}`}
        >
          <Pencil className="h-4 w-4" aria-hidden />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setConfirm(true)}
          data-testid={`fixture-delete-${fixture.id}`}
        >
          <Trash2 className="h-4 w-4 text-red-400" aria-hidden />
        </Button>
        <button
          type="button"
          onClick={onSelect}
          aria-label="Manage pairings"
          className="text-slate transition-colors hover:text-azure focus:outline-none focus-visible:ring-2 focus-visible:ring-azure/50"
        >
          <ChevronRight className="h-4 w-4" aria-hidden />
        </button>
      </div>
      <ConfirmDialog
        open={confirm}
        destructive
        title="Delete this fixture?"
        message="This removes the fixture and its pairings, and re-computes the standings."
        confirmLabel="Delete fixture"
        busy={del.isPending}
        onCancel={() => setConfirm(false)}
        onConfirm={() =>
          del.mutate(
            { id: fixture.id, leagueId: fixture.league_id },
            { onSuccess: () => setConfirm(false) },
          )
        }
      />
    </div>
  );
}

function FixturesSection({
  leagueId,
  teams,
  selectedFixtureId,
  onSelectFixture,
}: {
  leagueId: number;
  teams: Team[];
  selectedFixtureId: number | null;
  onSelectFixture: (id: number | null) => void;
}) {
  const query = useFixtures(leagueId);
  const fixtures = query.data ?? [];
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  return (
    <GlassCard className="overflow-hidden" data-testid="fixtures-section">
      <SectionHeader
        icon={<CalendarRange className="h-4 w-4 text-azure" aria-hidden />}
        title="Fixtures"
        action={
          !adding && teams.length >= 2 ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setAdding(true);
                setEditingId(null);
              }}
              data-testid="fixture-add"
            >
              <Plus className="h-4 w-4" aria-hidden />
              Add fixture
            </Button>
          ) : null
        }
      />

      {teams.length < 2 ? (
        <p className="px-5 py-8 text-sm text-slate">
          Add at least two clubs before scheduling fixtures.
        </p>
      ) : (
        <>
          {adding ? (
            <FixtureForm
              leagueId={leagueId}
              teams={teams}
              onDone={() => setAdding(false)}
            />
          ) : null}

          {query.isLoading ? (
            <div className="flex items-center gap-3 px-5 py-8 text-sm text-slate">
              <Loader2 className="h-5 w-5 animate-spin text-azure" aria-hidden />
              Loading fixtures…
            </div>
          ) : query.isError ? (
            <div className="m-5">
              <FormError error={query.error} />
            </div>
          ) : fixtures.length === 0 && !adding ? (
            <p className="px-5 py-8 text-sm text-slate" data-testid="fixtures-empty">
              No fixtures scheduled yet.
            </p>
          ) : (
            <div>
              {fixtures.map((f) =>
                editingId === f.id ? (
                  <FixtureForm
                    key={f.id}
                    leagueId={leagueId}
                    teams={teams}
                    fixture={f}
                    onDone={() => setEditingId(null)}
                  />
                ) : (
                  <FixtureRow
                    key={f.id}
                    fixture={f}
                    selected={selectedFixtureId === f.id}
                    onSelect={() =>
                      onSelectFixture(
                        selectedFixtureId === f.id ? null : f.id,
                      )
                    }
                    onEdit={() => {
                      setEditingId(f.id);
                      setAdding(false);
                    }}
                  />
                ),
              )}
            </div>
          )}
        </>
      )}
    </GlassCard>
  );
}

// ── Pairings (team selection + results) ────────────────────────────────────────

function PairingForm({
  fixtureId,
  leagueId,
  juniors,
  juniorsLoading,
  pairing,
  onDone,
}: {
  fixtureId: number;
  leagueId: number;
  juniors: AssignableJunior[];
  juniorsLoading: boolean;
  pairing?: Pairing;
  onDone: () => void;
}) {
  const create = useCreatePairing();
  const update = useUpdatePairing();
  const editing = Boolean(pairing);

  const [format, setFormat] = useState<PairingFormat>(
    pairing?.format ?? 'singles',
  );
  const [order, setOrder] = useState(
    pairing?.pairing_order != null ? String(pairing.pairing_order) : '',
  );
  const [homeJunior, setHomeJunior] = useState(
    pairing?.home_junior_id != null ? String(pairing.home_junior_id) : '',
  );
  const [homePartner, setHomePartner] = useState(
    pairing?.home_partner_junior_id != null
      ? String(pairing.home_partner_junior_id)
      : '',
  );
  const [homeLabel, setHomeLabel] = useState(pairing?.home_label ?? '');
  const [awayLabel, setAwayLabel] = useState(pairing?.away_label ?? '');
  const [awayPartner, setAwayPartner] = useState(
    pairing?.away_partner_label ?? '',
  );
  const [result, setResult] = useState<FixtureResult>(
    pairing?.result ?? 'pending',
  );
  const [margin, setMargin] = useState(pairing?.margin ?? '');

  const isPair = format === 'foursomes' || format === 'fourball';
  const idOrNull = (v: string): number | null =>
    v.trim() === '' ? null : Number(v);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const common = {
      format,
      pairing_order: order.trim() === '' ? null : Number(order),
      home_junior_id: idOrNull(homeJunior),
      home_partner_junior_id: isPair ? idOrNull(homePartner) : null,
      home_label: homeLabel.trim() || null,
      away_label: awayLabel.trim() || null,
      away_partner_label: isPair ? awayPartner.trim() || null : null,
      result,
      margin: margin.trim() || null,
    };
    if (editing && pairing) {
      update.mutate(
        { id: pairing.id, body: common, leagueId },
        { onSuccess: onDone },
      );
    } else {
      const body: CreatePairingInput = { fixture_id: fixtureId, ...common };
      create.mutate({ input: body, leagueId }, { onSuccess: onDone });
    }
  }

  const busy = create.isPending || update.isPending;

  function JuniorSelect({
    id,
    label,
    value,
    onChange,
    testid,
  }: {
    id: string;
    label: string;
    value: string;
    onChange: (v: string) => void;
    testid: string;
  }) {
    return (
      <Field label={label} htmlFor={id}>
        <select
          id={id}
          className={inputClass}
          value={value}
          disabled={juniorsLoading}
          onChange={(e) => onChange(e.target.value)}
          data-testid={testid}
        >
          <option value="" className="bg-navy">
            {juniorsLoading ? 'Loading golfers…' : '— none —'}
          </option>
          {juniors.map((j) => (
            <option key={j.id} value={j.id} className="bg-navy">
              {j.full_name ?? `Golfer #${j.id}`} · L{j.current_level}
            </option>
          ))}
        </select>
      </Field>
    );
  }

  return (
    <form
      className="space-y-3 border-t border-white/5 bg-white/[0.02] px-5 py-4"
      onSubmit={handleSubmit}
      data-testid="pairing-form"
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Format" htmlFor="pr-format">
          <select
            id="pr-format"
            className={inputClass}
            value={format}
            onChange={(e) => setFormat(e.target.value as PairingFormat)}
            data-testid="pairing-format-select"
          >
            {PAIRING_FORMATS.map((f) => (
              <option key={f} value={f} className="bg-navy">
                {pairingFormatLabel(f)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Order" htmlFor="pr-order">
          <input
            id="pr-order"
            type="number"
            className={inputClass}
            value={order}
            onChange={(e) => setOrder(e.target.value)}
            placeholder="e.g. 1"
          />
        </Field>
      </div>

      <p className="pt-1 text-xs font-bold uppercase tracking-widest text-slate">
        Our side
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <JuniorSelect
          id="pr-home-junior"
          label="Player"
          value={homeJunior}
          onChange={setHomeJunior}
          testid="pairing-home-junior"
        />
        {isPair ? (
          <JuniorSelect
            id="pr-home-partner"
            label="Partner"
            value={homePartner}
            onChange={setHomePartner}
            testid="pairing-home-partner"
          />
        ) : null}
      </div>
      <Field label="Our label (optional, overrides player name)" htmlFor="pr-home-label">
        <input
          id="pr-home-label"
          className={inputClass}
          value={homeLabel}
          onChange={(e) => setHomeLabel(e.target.value)}
          placeholder="e.g. for a guest who isn't a registered junior"
        />
      </Field>

      <p className="pt-1 text-xs font-bold uppercase tracking-widest text-slate">
        Opponent
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Opponent" htmlFor="pr-away-label">
          <input
            id="pr-away-label"
            className={inputClass}
            value={awayLabel}
            onChange={(e) => setAwayLabel(e.target.value)}
            placeholder="Opponent name"
            data-testid="pairing-away-label"
          />
        </Field>
        {isPair ? (
          <Field label="Opponent partner" htmlFor="pr-away-partner">
            <input
              id="pr-away-partner"
              className={inputClass}
              value={awayPartner}
              onChange={(e) => setAwayPartner(e.target.value)}
              placeholder="Opponent partner name"
            />
          </Field>
        ) : null}
      </div>

      <p className="pt-1 text-xs font-bold uppercase tracking-widest text-slate">
        Result
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Result" htmlFor="pr-result">
          <select
            id="pr-result"
            className={inputClass}
            value={result}
            onChange={(e) => setResult(e.target.value as FixtureResult)}
            data-testid="pairing-result-select"
          >
            {PAIRING_RESULTS.map((r) => (
              <option key={r} value={r} className="bg-navy">
                {resultLabel(r)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Margin" htmlFor="pr-margin">
          <input
            id="pr-margin"
            className={inputClass}
            value={margin}
            onChange={(e) => setMargin(e.target.value)}
            placeholder="e.g. 3&2"
            data-testid="pairing-margin"
          />
        </Field>
      </div>

      <FormError error={editing ? update.error : create.error} />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onDone}>
          Cancel
        </Button>
        <Button
          type="submit"
          size="sm"
          disabled={busy}
          data-testid="pairing-save"
        >
          {busy ? 'Saving…' : editing ? 'Save pairing' : 'Add pairing'}
        </Button>
      </div>
    </form>
  );
}

function PairingManageRow({
  pairing,
  leagueId,
  juniors,
  juniorsLoading,
  homeTeamName,
  awayTeamName,
}: {
  pairing: Pairing;
  leagueId: number;
  juniors: AssignableJunior[];
  juniorsLoading: boolean;
  homeTeamName: string;
  awayTeamName: string;
}) {
  const del = useDeletePairing();
  const update = useUpdatePairing();
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(false);

  // Inline result entry state — initialised from the saved pairing.
  const [resultDraft, setResultDraft] = useState<FixtureResult>(pairing.result);
  const [marginDraft, setMarginDraft] = useState(pairing.margin ?? '');

  // Keep draft in sync if the pairing is refreshed from the server.
  useEffect(() => {
    setResultDraft(pairing.result);
    setMarginDraft(pairing.margin ?? '');
  }, [pairing.result, pairing.margin]);

  if (editing) {
    return (
      <PairingForm
        fixtureId={pairing.fixture_id}
        leagueId={leagueId}
        juniors={juniors}
        juniorsLoading={juniorsLoading}
        pairing={pairing}
        onDone={() => setEditing(false)}
      />
    );
  }

  const home =
    pairing.home_junior_name ?? pairing.home_label ?? 'TBC';
  const homeFull = pairing.home_partner_junior_name
    ? `${home} & ${pairing.home_partner_junior_name}`
    : home;
  const away = pairing.away_label ?? 'TBC';
  const awayFull = pairing.away_partner_label
    ? `${away} & ${pairing.away_partner_label}`
    : away;

  const isDirty =
    resultDraft !== pairing.result ||
    marginDraft !== (pairing.margin ?? '');

  function handleSaveResult() {
    update.mutate(
      {
        id: pairing.id,
        body: {
          result: resultDraft,
          margin: marginDraft.trim() || null,
        },
        leagueId,
      },
    );
  }

  return (
    <div
      className="border-t border-white/5 px-5 py-3"
      data-testid={`pairing-row-${pairing.id}`}
    >
      {/* Identity row: order, format label, edit / delete controls */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-bold uppercase tracking-widest text-slate">
          {pairing.pairing_order != null ? `#${pairing.pairing_order} · ` : ''}
          {pairingFormatLabel(pairing.format)}
        </span>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setEditing(true)}
            data-testid={`pairing-edit-${pairing.id}`}
            aria-label="Edit pairing setup"
          >
            <Pencil className="h-4 w-4" aria-hidden />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setConfirm(true)}
            data-testid={`pairing-delete-${pairing.id}`}
          >
            <Trash2 className="h-4 w-4 text-red-400" aria-hidden />
          </Button>
        </div>
      </div>

      {/* Player names */}
      <div className="mt-2 flex items-center gap-3">
        <p className="min-w-0 flex-1 truncate text-sm font-semibold text-silver">
          {homeFull}
        </p>
        <span className="text-xs font-black text-slate">v</span>
        <p className="min-w-0 flex-1 truncate text-right text-sm font-semibold text-silver">
          {awayFull}
        </p>
      </div>

      {/* ── Inline result entry ─────────────────────────────────────────────── */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <select
          aria-label="Match result"
          className={cn(
            inputClass,
            'flex-1 py-2 text-xs',
          )}
          value={resultDraft}
          onChange={(e) => setResultDraft(e.target.value as FixtureResult)}
          data-testid={`pairing-winner-${pairing.id}`}
        >
          {PAIRING_RESULTS.map((r) => (
            <option key={r} value={r} className="bg-navy">
              {teamResultLabel(r, homeTeamName, awayTeamName)}
            </option>
          ))}
        </select>
        <input
          aria-label="Match margin"
          className={cn(inputClass, 'w-28 flex-none py-2 text-xs')}
          value={marginDraft}
          onChange={(e) => setMarginDraft(e.target.value)}
          placeholder="3&2, 2 up…"
          disabled={resultDraft === 'pending' || resultDraft === 'halved'}
          data-testid={`pairing-margin-${pairing.id}`}
        />
        <Button
          size="sm"
          variant={isDirty ? 'primary' : 'ghost'}
          disabled={!isDirty || update.isPending}
          onClick={handleSaveResult}
          data-testid={`pairing-save-${pairing.id}`}
        >
          {update.isPending ? 'Saving…' : 'Save'}
        </Button>
      </div>
      {update.error ? (
        <p className="mt-1 text-xs text-red-400">{String(update.error)}</p>
      ) : null}

      <ConfirmDialog
        open={confirm}
        destructive
        title="Remove this pairing?"
        message="This re-computes the fixture result and the standings."
        confirmLabel="Remove pairing"
        busy={del.isPending}
        onCancel={() => setConfirm(false)}
        onConfirm={() =>
          del.mutate(
            { id: pairing.id, fixtureId: pairing.fixture_id, leagueId },
            { onSuccess: () => setConfirm(false) },
          )
        }
      />
    </div>
  );
}

function PairingsPanel({
  fixtureId,
  leagueId,
  teams,
}: {
  fixtureId: number;
  leagueId: number;
  teams: Team[];
}) {
  const query = useFixture(fixtureId);
  const fixture = query.data;
  const [adding, setAdding] = useState(false);

  // Coaches assign only from their own roster; admin/committee see every junior.
  const { user } = useAuth();
  const isCoach = user?.role === 'coach';
  const allJuniors = useAllJuniors(!isCoach);
  const coachJuniors = useCoachJuniors(isCoach ? user?.id : undefined);
  const juniorsQuery = isCoach ? coachJuniors : allJuniors;
  const juniors = juniorsQuery.data ?? [];

  // Resolve team names for the team-named winner picker.
  const homeTeam = teams.find((t) => t.id === fixture?.home_team_id);
  const awayTeam = teams.find((t) => t.id === fixture?.away_team_id);
  const homeTeamName = homeTeam?.short_name ?? homeTeam?.name ?? 'Home';
  const awayTeamName = awayTeam?.short_name ?? awayTeam?.name ?? 'Away';

  return (
    <GlassCard className="overflow-hidden" data-testid="pairings-panel">
      <SectionHeader
        icon={<Swords className="h-4 w-4 text-azure" aria-hidden />}
        title="Pairings & results"
        action={
          !adding ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setAdding(true)}
              data-testid="pairing-add"
            >
              <Plus className="h-4 w-4" aria-hidden />
              Add pairing
            </Button>
          ) : null
        }
      />

      {adding ? (
        <PairingForm
          fixtureId={fixtureId}
          leagueId={leagueId}
          juniors={juniors}
          juniorsLoading={juniorsQuery.isLoading}
          onDone={() => setAdding(false)}
        />
      ) : null}

      {query.isLoading ? (
        <div className="flex items-center gap-3 px-5 py-8 text-sm text-slate">
          <Loader2 className="h-5 w-5 animate-spin text-azure" aria-hidden />
          Loading pairings…
        </div>
      ) : query.isError ? (
        <div className="m-5">
          <FormError error={query.error} />
        </div>
      ) : !fixture || fixture.pairings.length === 0 ? (
        !adding ? (
          <p className="px-5 py-8 text-sm text-slate" data-testid="pairings-empty">
            No pairings yet. Add one to pick our player(s) and the opponent.
          </p>
        ) : null
      ) : (
        <div>
          {fixture.pairings.map((p) => (
            <PairingManageRow
              key={p.id}
              pairing={p}
              leagueId={leagueId}
              juniors={juniors}
              juniorsLoading={juniorsQuery.isLoading}
              homeTeamName={homeTeamName}
              awayTeamName={awayTeamName}
            />
          ))}
        </div>
      )}
    </GlassCard>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function LeagueManagePage() {
  const leaguesQuery = useLeagues();
  const leagues = useMemo(
    () => leaguesQuery.data ?? [],
    [leaguesQuery.data],
  );

  // Selected league id: default to the current league, else the first.
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [creatingNew, setCreatingNew] = useState(false);
  const [selectedFixtureId, setSelectedFixtureId] = useState<number | null>(
    null,
  );

  const resolvedId = useMemo(() => {
    if (creatingNew) return null;
    if (selectedId != null && leagues.some((l) => l.id === selectedId))
      return selectedId;
    return leagues.find((l) => l.is_current)?.id ?? leagues[0]?.id ?? null;
  }, [creatingNew, selectedId, leagues]);

  // Fetch the selected league WITH its teams.
  const leagueQuery = useLeague(resolvedId ?? undefined);
  const league: League | null = leagueQuery.data ?? null;
  const teams = league?.teams ?? [];

  return (
    <div className="mx-auto max-w-3xl animate-fade-in-up pb-16">
      <Link
        to="/league"
        className="inline-flex items-center gap-1.5 rounded text-sm font-semibold text-slate transition-colors hover:text-azure focus:outline-none focus-visible:ring-2 focus-visible:ring-azure/50"
        data-testid="manage-back-link"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Back to league
      </Link>

      <div className="mt-4 flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gold/20 text-gold">
          <Trophy className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-gold">
            Junior League
          </p>
          <h1 className="truncate text-2xl font-black text-silver">
            Manage league
          </h1>
        </div>
      </div>

      {leaguesQuery.isLoading ? (
        <div className="mt-8 flex items-center gap-3 py-12 text-sm text-slate">
          <Loader2 className="h-5 w-5 animate-spin text-azure" aria-hidden />
          Loading leagues…
        </div>
      ) : leaguesQuery.isError ? (
        <div className="mt-8">
          <FormError error={leaguesQuery.error} />
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          {/* League selector — only when more than one exists. */}
          {leagues.length > 1 || !creatingNew ? (
            <GlassCard className="flex flex-wrap items-center gap-3 p-4" data-testid="league-selector">
              {leagues.length > 1 ? (
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <label
                    htmlFor="league-picker"
                    className="text-xs font-bold uppercase tracking-widest text-slate"
                  >
                    League
                  </label>
                  <select
                    id="league-picker"
                    className={cn(inputClass, 'flex-1')}
                    value={creatingNew ? '' : resolvedId ?? ''}
                    onChange={(e) => {
                      setCreatingNew(false);
                      setSelectedId(Number(e.target.value));
                      setSelectedFixtureId(null);
                    }}
                    data-testid="league-picker-select"
                  >
                    {leagues.map((l) => (
                      <option key={l.id} value={l.id} className="bg-navy">
                        {l.name}
                        {l.year != null ? ` ${l.year}` : ''}
                        {l.is_current ? ' (current)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <span className="flex-1 text-sm text-slate">
                  {league ? league.name : 'No league selected.'}
                </span>
              )}
              {creatingNew ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setCreatingNew(false)}
                  data-testid="league-cancel-new"
                >
                  <X className="h-4 w-4" aria-hidden />
                  Cancel new
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setCreatingNew(true);
                    setSelectedFixtureId(null);
                  }}
                  data-testid="league-new"
                >
                  <Plus className="h-4 w-4" aria-hidden />
                  New league
                </Button>
              )}
            </GlassCard>
          ) : null}

          {/* League editor (create or edit). */}
          <LeagueEditor
            league={creatingNew ? null : league}
            onCreated={(id) => {
              setCreatingNew(false);
              setSelectedFixtureId(null);
              setSelectedId(id > 0 ? id : null);
            }}
          />

          {/* Teams + fixtures + pairings only once a league exists. */}
          {league && !creatingNew ? (
            <>
              <TeamsSection leagueId={league.id} teams={teams} />
              <FixturesSection
                leagueId={league.id}
                teams={teams}
                selectedFixtureId={selectedFixtureId}
                onSelectFixture={setSelectedFixtureId}
              />
              {selectedFixtureId != null ? (
                <PairingsPanel
                  fixtureId={selectedFixtureId}
                  leagueId={league.id}
                  teams={teams}
                />
              ) : (
                <GlassCard
                  className="px-5 py-6 text-sm text-slate"
                  data-testid="pairings-hint"
                >
                  Select a fixture above to set its team selection and results.
                </GlassCard>
              )}
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}
