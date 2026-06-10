// Staff junior profile (route /juniors/:id — admin + coach + committee, wired
// in App.tsx). The "player dashboard view" for staff (build-phase-2 decisions
// 9+10): header + hero handicap, the FULL intake record (committee sees
// everything, medical flagged as sensitive), a staff edit form (admin +
// committee — coaches view only, per decision 5), band progress + attendance,
// a compact handicap trend, competition history, and recent attendance marks.
//
// The junior row comes from the shared ['juniors','all'] cache (useAllJuniors);
// per-junior reads live in juniors.queries.ts. No WHS math — display only.

import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  CalendarCheck,
  ChevronDown,
  ClipboardList,
  HeartPulse,
  Loader2,
  Save,
  ShieldAlert,
  Target,
  TrendingUp,
  UserPen,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { ApiError } from '../../lib/api';
import { cn } from '../../lib/cn';
import { useAuth } from '../../auth/useAuth';
import type { LevelBand, User } from '../../types/api';
import { Avatar } from '../../components/ui/Avatar';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { GlassCard } from '../../components/ui/GlassCard';
import { CompetitionHistory } from '../tournaments/CompetitionHistory';
import {
  useAllJuniors,
  useCoachUsers,
  type AssignableJunior,
} from '../admin/coach-assignment.queries';
import { useLevelBands } from '../committee/committee-evaluations.queries';
import {
  CHILD_AVAILABILITY_OPTIONS,
  CHILD_EXPERIENCE_OPTIONS,
} from '../parent/parent-children.queries';
import {
  ageFromDob,
  availabilityLabel,
  experienceLabel,
  genderLabel,
  useJuniorAttendance,
  useJuniorHandicapHistory,
  useJuniorProgressStaff,
  useUpdateJuniorStaff,
  type JuniorAttendanceRecord,
} from './juniors.queries';

const inputClass =
  'w-full rounded-xl bg-white/5 px-4 py-3 text-sm text-silver placeholder:text-slate/60 outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-azure/60 disabled:opacity-50';
const formLabelClass = 'block text-sm font-semibold text-silver';

const TOOLTIP_STYLE = {
  backgroundColor: '#012349',
  border: '1px solid rgba(0,130,205,0.3)',
  borderRadius: '12px',
  color: '#F4F4F6',
} as const;

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

function juniorName(j: AssignableJunior): string {
  return j.full_name?.trim() || `Golfer #${j.id}`;
}

function shortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

function fullDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

// ── Section shell (icon + title header on a glass card) ──────────────────────

function SectionCard({
  icon: Icon,
  title,
  subtitle,
  children,
  className,
  testId,
}: {
  icon: typeof Target;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
  testId?: string;
}) {
  return (
    <GlassCard className={cn('p-5 sm:p-6', className)} data-testid={testId}>
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-azure/15">
          <Icon size={16} className="text-azure" aria-hidden />
        </span>
        <div>
          <h2 className="text-sm font-bold text-silver">{title}</h2>
          {subtitle ? <p className="text-xs text-slate">{subtitle}</p> : null}
        </div>
      </div>
      <div className="mt-5">{children}</div>
    </GlassCard>
  );
}

// ── 3) Full intake profile (decision 9 — committee sees everything) ──────────

function IntakeField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white/5 p-3">
      <dt className="text-[11px] font-bold uppercase tracking-wider text-slate">
        {label}
      </dt>
      <dd className="mt-1 text-sm text-silver">{value}</dd>
    </div>
  );
}

function IntakeProfileSection({ junior }: { junior: AssignableJunior }) {
  return (
    <SectionCard
      icon={ClipboardList}
      title="Intake profile"
      subtitle="Programme record from enrolment — visible to staff"
      testId="junior-intake"
    >
      <dl className="grid gap-2.5 sm:grid-cols-2">
        <IntakeField label="Date of birth" value={fullDate(junior.date_of_birth)} />
        <IntakeField label="Gender" value={genderLabel(junior.gender)} />
        <IntakeField label="Curriculum" value={junior.curriculum?.trim() || '—'} />
        <IntakeField label="Experience" value={experienceLabel(junior.experience)} />
        <IntakeField
          label="Availability"
          value={availabilityLabel(junior.availability)}
        />
        <IntakeField
          label="US Kids history"
          value={
            junior.played_us_kids
              ? junior.us_kids_best_score != null
                ? `Played — best score ${junior.us_kids_best_score}`
                : 'Played'
              : junior.played_us_kids === false
                ? 'Not played'
                : '—'
          }
        />
      </dl>

      {/* Goals — family-provided context. */}
      <div className="mt-2.5 rounded-xl bg-white/5 p-3">
        <p className="text-[11px] font-bold uppercase tracking-wider text-slate">
          Golf goals
        </p>
        <p className="mt-1 text-sm text-silver">
          {junior.golf_goals?.trim() || 'No goals recorded yet.'}
        </p>
      </div>

      {/* Medical — sensitive; subtly flagged, never hidden from staff. */}
      <div
        className="mt-2.5 rounded-xl border border-gold/20 bg-gold/5 p-3"
        data-testid="junior-medical"
      >
        <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-gold">
          <HeartPulse size={13} aria-hidden />
          Medical conditions
          <span className="font-medium normal-case tracking-normal text-gold/70">
            — sensitive, staff only
          </span>
        </p>
        <p className="mt-1 text-sm text-silver">
          {junior.medical_conditions?.trim() || 'None recorded.'}
        </p>
      </div>
    </SectionCard>
  );
}

// ── 4) Staff edit (admin/committee; coaches view only — decision 5) ──────────

interface EditFormState {
  dateOfBirth: string;
  gender: string;
  currentLevel: string;
  curriculum: string;
  hasHandicap: boolean;
  handicapIndex: string;
  playedUsKids: boolean;
  usKidsBestScore: string;
  experience: string;
  availability: string;
  medicalConditions: string;
  golfGoals: string;
  tournamentReady: boolean;
}

function formFromJunior(j: AssignableJunior): EditFormState {
  return {
    dateOfBirth: j.date_of_birth ?? '',
    gender: j.gender ?? 'male',
    currentLevel: String(j.current_level ?? 1),
    curriculum: j.curriculum ?? '',
    hasHandicap: j.has_handicap,
    handicapIndex: j.handicap_index != null ? String(j.handicap_index) : '',
    playedUsKids: j.played_us_kids === true,
    usKidsBestScore:
      j.us_kids_best_score != null ? String(j.us_kids_best_score) : '',
    experience: j.experience ?? '',
    availability: j.availability ?? '',
    medicalConditions: j.medical_conditions ?? '',
    golfGoals: j.golf_goals ?? '',
    tournamentReady: j.tournament_ready,
  };
}

function StaffEditCard({ junior }: { junior: AssignableJunior }) {
  const update = useUpdateJuniorStaff();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<EditFormState>(() => formFromJunior(junior));
  const [saved, setSaved] = useState(false);
  const [clientError, setClientError] = useState<string | null>(null);

  const change = <K extends keyof EditFormState>(
    key: K,
    value: EditFormState[K],
  ) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
    setClientError(null);
  };

  const submit = () => {
    const level = Number(form.currentLevel);
    if (!Number.isInteger(level) || level < 1 || level > 9) {
      setClientError('Level must be a whole number from 1 to 9.');
      return;
    }
    const handicapIndex =
      form.handicapIndex.trim() === '' ? null : Number(form.handicapIndex);
    if (handicapIndex != null && Number.isNaN(handicapIndex)) {
      setClientError('Handicap index must be a number (one decimal place).');
      return;
    }
    const usKidsBest =
      form.usKidsBestScore.trim() === '' ? null : Number(form.usKidsBestScore);
    if (usKidsBest != null && !Number.isInteger(usKidsBest)) {
      setClientError('US Kids best score must be a whole number.');
      return;
    }
    update.mutate(
      {
        juniorId: junior.id,
        date_of_birth: form.dateOfBirth,
        gender: form.gender,
        current_level: level, // band recomputes server-side — band_id never sent
        curriculum: form.curriculum.trim() === '' ? null : form.curriculum.trim(),
        has_handicap: form.hasHandicap,
        handicap_index: handicapIndex,
        played_us_kids: form.playedUsKids,
        us_kids_best_score: usKidsBest,
        experience: form.experience,
        availability: form.availability,
        medical_conditions:
          form.medicalConditions.trim() === ''
            ? null
            : form.medicalConditions.trim(),
        golf_goals: form.golfGoals.trim() === '' ? null : form.golfGoals.trim(),
        tournament_ready: form.tournamentReady,
      },
      { onSuccess: () => setSaved(true) },
    );
  };

  return (
    <GlassCard className="p-5 sm:p-6" data-testid="junior-staff-edit">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="junior-staff-edit-form"
        className="flex w-full items-center gap-2.5 rounded text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-azure/50"
        data-testid="junior-staff-edit-toggle"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gold/15">
          <UserPen size={16} className="text-gold" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold text-silver">
            Edit intake profile
          </span>
          <span className="block text-xs text-slate">
            Staff-only — full intake record. Level moves here are corrections;
            promotion happens through evaluations.
          </span>
        </span>
        <ChevronDown
          size={18}
          className={cn(
            'shrink-0 text-slate transition-transform',
            open && 'rotate-180',
          )}
          aria-hidden
        />
      </button>

      {open ? (
        <div id="junior-staff-edit-form" className="mt-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={formLabelClass} htmlFor="edit-dob">
                Date of birth
              </label>
              <input
                id="edit-dob"
                type="date"
                className={inputClass + ' mt-1.5'}
                value={form.dateOfBirth}
                onChange={(e) => change('dateOfBirth', e.target.value)}
                disabled={update.isPending}
                data-testid="edit-dob"
              />
            </div>

            <div>
              <label className={formLabelClass} htmlFor="edit-gender">
                Gender
              </label>
              <select
                id="edit-gender"
                className={inputClass + ' mt-1.5'}
                value={form.gender}
                onChange={(e) => change('gender', e.target.value)}
                disabled={update.isPending}
                data-testid="edit-gender"
              >
                <option value="male" className="bg-navy">
                  Male
                </option>
                <option value="female" className="bg-navy">
                  Female
                </option>
              </select>
            </div>

            <div>
              <label className={formLabelClass} htmlFor="edit-level">
                Level (1–9)
              </label>
              <p className="mt-0.5 text-xs text-slate">
                The band follows the level automatically.
              </p>
              <input
                id="edit-level"
                type="number"
                min={1}
                max={9}
                step={1}
                className={inputClass + ' mt-1.5'}
                value={form.currentLevel}
                onChange={(e) => change('currentLevel', e.target.value)}
                disabled={update.isPending}
                data-testid="edit-level"
              />
            </div>

            <div>
              <label className={formLabelClass} htmlFor="edit-curriculum">
                Curriculum
              </label>
              <input
                id="edit-curriculum"
                type="text"
                className={inputClass + ' mt-1.5'}
                value={form.curriculum}
                onChange={(e) => change('curriculum', e.target.value)}
                placeholder="Curriculum focus…"
                disabled={update.isPending}
                data-testid="edit-curriculum"
              />
            </div>

            <div>
              <label className="flex items-center gap-2.5 text-sm font-semibold text-silver">
                <input
                  type="checkbox"
                  checked={form.hasHandicap}
                  onChange={(e) => change('hasHandicap', e.target.checked)}
                  disabled={update.isPending}
                  className="h-4 w-4 accent-azure"
                  data-testid="edit-has-handicap"
                />
                Has a handicap
              </label>
              <input
                aria-label="Handicap index"
                type="number"
                step={0.1}
                className={inputClass + ' mt-2'}
                value={form.handicapIndex}
                onChange={(e) => change('handicapIndex', e.target.value)}
                placeholder="Handicap index"
                disabled={update.isPending || !form.hasHandicap}
                data-testid="edit-handicap-index"
              />
            </div>

            <div>
              <label className="flex items-center gap-2.5 text-sm font-semibold text-silver">
                <input
                  type="checkbox"
                  checked={form.playedUsKids}
                  onChange={(e) => change('playedUsKids', e.target.checked)}
                  disabled={update.isPending}
                  className="h-4 w-4 accent-azure"
                  data-testid="edit-played-us-kids"
                />
                Has played US Kids
              </label>
              <input
                aria-label="US Kids best score"
                type="number"
                step={1}
                className={inputClass + ' mt-2'}
                value={form.usKidsBestScore}
                onChange={(e) => change('usKidsBestScore', e.target.value)}
                placeholder="US Kids best score"
                disabled={update.isPending || !form.playedUsKids}
                data-testid="edit-us-kids-best"
              />
            </div>

            <div>
              <label className={formLabelClass} htmlFor="edit-experience">
                Golf experience
              </label>
              <select
                id="edit-experience"
                className={inputClass + ' mt-1.5'}
                value={form.experience}
                onChange={(e) => change('experience', e.target.value)}
                disabled={update.isPending}
                data-testid="edit-experience"
              >
                {CHILD_EXPERIENCE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value} className="bg-navy">
                    {o.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={formLabelClass} htmlFor="edit-availability">
                Availability
              </label>
              <select
                id="edit-availability"
                className={inputClass + ' mt-1.5'}
                value={form.availability}
                onChange={(e) => change('availability', e.target.value)}
                disabled={update.isPending}
                data-testid="edit-availability"
              >
                {CHILD_AVAILABILITY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value} className="bg-navy">
                    {o.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className={formLabelClass} htmlFor="edit-medical">
                Medical conditions
              </label>
              <textarea
                id="edit-medical"
                rows={2}
                className={inputClass + ' mt-1.5 resize-y'}
                value={form.medicalConditions}
                onChange={(e) => change('medicalConditions', e.target.value)}
                placeholder="Allergies, asthma, anything coaches should know…"
                disabled={update.isPending}
                data-testid="edit-medical"
              />
            </div>

            <div className="sm:col-span-2">
              <label className={formLabelClass} htmlFor="edit-goals">
                Golf goals
              </label>
              <textarea
                id="edit-goals"
                rows={2}
                className={inputClass + ' mt-1.5 resize-y'}
                value={form.golfGoals}
                onChange={(e) => change('golfGoals', e.target.value)}
                placeholder="What would they love to achieve?"
                disabled={update.isPending}
                data-testid="edit-goals"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="flex items-center gap-2.5 text-sm font-semibold text-silver">
                <input
                  type="checkbox"
                  checked={form.tournamentReady}
                  onChange={(e) => change('tournamentReady', e.target.checked)}
                  disabled={update.isPending}
                  className="h-4 w-4 accent-azure"
                  data-testid="edit-tournament-ready"
                />
                Tournament ready
              </label>
            </div>
          </div>

          {clientError ? (
            <p
              role="alert"
              className="mt-4 rounded-xl bg-red-500/15 p-3 text-sm text-red-400"
              data-testid="edit-client-error"
            >
              {clientError}
            </p>
          ) : null}

          {update.isError ? (
            <p
              role="alert"
              className="mt-4 rounded-xl bg-red-500/15 p-3 text-sm text-red-400"
              data-testid="edit-error"
            >
              {errorMessage(
                update.error,
                'Could not save the profile. Please try again.',
              )}
            </p>
          ) : null}

          {saved ? (
            <p
              className="mt-4 rounded-xl bg-emerald-500/10 p-3 text-sm font-semibold text-emerald-300"
              data-testid="edit-saved"
            >
              Saved — the profile is up to date.
            </p>
          ) : null}

          <div className="mt-5">
            <Button
              size="md"
              onClick={submit}
              disabled={update.isPending}
              data-testid="edit-submit"
            >
              {update.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Save className="h-4 w-4" aria-hidden />
              )}
              {update.isPending ? 'Saving…' : 'Save profile'}
            </Button>
          </div>
        </div>
      ) : null}
    </GlassCard>
  );
}

// ── 5) Progress: attendance vs band minimum ──────────────────────────────────

function ProgressSection({
  junior,
  bands,
}: {
  junior: AssignableJunior;
  bands: LevelBand[] | undefined;
}) {
  const progress = useJuniorProgressStaff(junior.id);

  const currentLevel = progress.data?.current_level ?? junior.current_level;
  const band = bands?.find(
    (b) => currentLevel >= b.min_level && currentLevel <= b.max_level,
  );
  const minSessions = band?.min_sessions ?? 0;

  const att = progress.data?.attendance;
  const present = att?.present ?? 0;
  const pct =
    minSessions > 0
      ? Math.min(100, Math.round((present / minSessions) * 100))
      : 0;
  const sessionsDone = minSessions > 0 && present >= minSessions;

  return (
    <SectionCard
      icon={TrendingUp}
      title="Band progress"
      subtitle={band ? `${band.name} (${band.band_label})` : undefined}
      testId="junior-progress"
    >
      {progress.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-slate">
          <Loader2 size={16} className="animate-spin text-azure" aria-hidden />
          Loading progress…
        </div>
      ) : progress.isError ? (
        <p
          className="rounded-xl bg-red-500/15 p-3 text-sm text-red-400"
          role="alert"
        >
          {errorMessage(progress.error, 'Could not load this junior’s progress.')}
        </p>
      ) : (
        <>
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate">
              Sessions attended
            </span>
            <span className="font-mono text-sm font-bold">
              <span className={cn(sessionsDone ? 'text-emerald-400' : 'text-azure')}>
                {present}
              </span>
              <span className="text-slate"> / {minSessions || '—'}</span>
            </span>
          </div>
          <div
            className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-white/10"
            role="progressbar"
            aria-valuenow={present}
            aria-valuemin={0}
            aria-valuemax={minSessions || undefined}
            aria-label={`${present} of ${minSessions} sessions attended`}
          >
            <div
              className={cn(
                'h-full rounded-full transition-all',
                sessionsDone ? 'bg-emerald-400' : 'bg-azure',
              )}
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="mt-1.5 text-xs text-slate">
            {minSessions <= 0
              ? 'No band minimum recorded for this level.'
              : sessionsDone
                ? `Reached this band's minimum of ${minSessions} sessions.`
                : `${Math.max(0, minSessions - present)} more toward this band's minimum of ${minSessions}.`}
          </p>

          {att ? (
            <dl
              className="mt-5 grid grid-cols-3 gap-2.5"
              data-testid="junior-attendance-breakdown"
            >
              <div className="rounded-xl bg-white/5 p-3 text-center">
                <dd className="font-mono text-xl font-black text-emerald-400">
                  {att.present}
                </dd>
                <dt className="mt-0.5 text-[11px] uppercase tracking-wider text-slate">
                  Present
                </dt>
              </div>
              <div className="rounded-xl bg-white/5 p-3 text-center">
                <dd className="font-mono text-xl font-black text-gold">
                  {att.excused}
                </dd>
                <dt className="mt-0.5 text-[11px] uppercase tracking-wider text-slate">
                  Excused
                </dt>
              </div>
              <div className="rounded-xl bg-white/5 p-3 text-center">
                <dd className="font-mono text-xl font-black text-slate">
                  {att.absent}
                </dd>
                <dt className="mt-0.5 text-[11px] uppercase tracking-wider text-slate">
                  Absent
                </dt>
              </div>
            </dl>
          ) : null}
        </>
      )}
    </SectionCard>
  );
}

// ── 6) Handicap history (compact trend, PlayerHandicapPage vocabulary) ───────

function HandicapTrendSection({ junior }: { junior: AssignableJunior }) {
  const history = useJuniorHandicapHistory(junior.user_id);

  const trendData = useMemo(
    () =>
      (history.data ?? [])
        .filter((r) => r.handicap_after != null)
        .map((r) => ({
          date: r.date_played,
          label: shortDate(r.date_played),
          handicap: r.handicap_after as number,
        })),
    [history.data],
  );

  return (
    <GlassCard className="p-5 sm:p-6" data-testid="junior-handicap-trend">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-bold text-silver">Handicap trend</h2>
        <span className="text-xs text-slate">lower is better</span>
      </div>
      <div className="mt-4 h-48">
        {history.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-slate">
            <Loader2 size={16} className="animate-spin text-azure" aria-hidden />
            Loading handicap history…
          </div>
        ) : history.isError ? (
          <p
            className="rounded-xl bg-red-500/15 p-3 text-sm text-red-400"
            role="alert"
          >
            {errorMessage(history.error, 'Could not load the handicap history.')}
          </p>
        ) : trendData.length === 0 ? (
          <div
            className="flex h-full flex-col items-center justify-center text-center"
            data-testid="junior-trend-empty"
          >
            <TrendingUp size={26} className="text-azure/60" aria-hidden />
            <p className="mt-2 text-sm text-slate">
              No handicap rounds recorded yet.
            </p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={trendData}
              margin={{ top: 8, right: 8, bottom: 0, left: -16 }}
            >
              <defs>
                <linearGradient
                  id="juniorHcpAreaGradient"
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop offset="0%" stopColor="#0082CD" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#0082CD" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="rgba(100,116,139,0.12)" />
              <XAxis
                dataKey="label"
                tick={{ fill: '#64748B', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: '#64748B', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={36}
              />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                labelStyle={{ color: '#64748B' }}
                formatter={(value) => [value as number, 'Handicap']}
              />
              <Area
                type="monotone"
                dataKey="handicap"
                stroke="#0082CD"
                strokeWidth={2}
                fill="url(#juniorHcpAreaGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </GlassCard>
  );
}

// ── 8) Recent attendance records (latest 10) ─────────────────────────────────

const ATTENDANCE_TONE: Record<
  JuniorAttendanceRecord['status'],
  'emerald' | 'gold' | 'slate'
> = {
  present: 'emerald',
  excused: 'gold',
  absent: 'slate',
};

function AttendanceSection({ junior }: { junior: AssignableJunior }) {
  const attendance = useJuniorAttendance(junior.id);

  // Latest 10, newest first. The attendance row carries no session date, so we
  // show when the record was marked (created_at).
  const recent = useMemo(
    () =>
      [...(attendance.data ?? [])]
        .sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''))
        .slice(0, 10),
    [attendance.data],
  );

  return (
    <SectionCard
      icon={CalendarCheck}
      title="Recent attendance"
      subtitle="Latest 10 marks — dated when recorded"
      testId="junior-attendance"
    >
      {attendance.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-slate">
          <Loader2 size={16} className="animate-spin text-azure" aria-hidden />
          Loading attendance…
        </div>
      ) : attendance.isError ? (
        <p
          className="rounded-xl bg-red-500/15 p-3 text-sm text-red-400"
          role="alert"
        >
          {errorMessage(attendance.error, 'Could not load attendance records.')}
        </p>
      ) : recent.length === 0 ? (
        <p className="text-sm text-slate" data-testid="junior-attendance-empty">
          No attendance recorded yet.
        </p>
      ) : (
        <ul className="flex flex-col gap-2" data-testid="junior-attendance-list">
          {recent.map((rec) => (
            <li
              key={rec.id}
              className="glass-light flex items-center justify-between gap-3 rounded-xl px-3.5 py-2.5"
              data-testid={`attendance-rec-${rec.id}`}
            >
              <span className="text-sm text-silver">
                {fullDate(rec.created_at)}
              </span>
              <Badge tone={ATTENDANCE_TONE[rec.status] ?? 'slate'}>
                {rec.status.charAt(0).toUpperCase() + rec.status.slice(1)}
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

// ── Profile body (junior resolved) ───────────────────────────────────────────

function JuniorProfileBody({
  junior,
  bands,
  coaches,
  canEdit,
}: {
  junior: AssignableJunior;
  bands: LevelBand[] | undefined;
  coaches: User[];
  canEdit: boolean;
}) {
  const name = juniorName(junior);
  const age = ageFromDob(junior.date_of_birth);
  const band = bands?.find((b) => b.id === junior.band_id);
  const coach = junior.coach_id
    ? coaches.find((c) => c.id === junior.coach_id)
    : undefined;
  const hasHandicap = junior.has_handicap && junior.handicap_index != null;

  return (
    <div className="space-y-6">
      {/* 1+2) Header + hero handicap */}
      <GlassCard className="animate-fade-in-up p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <Avatar name={name} className="h-12 w-12 text-lg" />
            <div>
              <h1 className="text-2xl font-black text-silver">{name}</h1>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <Badge tone="azure" shape="pill">
                  Level {junior.current_level}
                </Badge>
                {band ? (
                  <Badge tone="slate" shape="pill">
                    {band.name}
                  </Badge>
                ) : null}
                {junior.tournament_ready ? (
                  <Badge tone="gold" shape="pill">
                    Tournament ready
                  </Badge>
                ) : null}
              </div>
              <p className="mt-1.5 text-xs text-slate">
                {age != null ? `Age ${age}` : 'Age —'} ·{' '}
                {genderLabel(junior.gender)} · Coach:{' '}
                <span className="text-silver">
                  {coach ? coach.full_name || coach.email : 'Unassigned'}
                </span>
              </p>
            </div>
          </div>

          <div className="text-right">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate">
              Handicap index
            </p>
            {hasHandicap ? (
              <p
                className="mt-0.5 font-mono text-4xl font-black leading-none text-azure"
                data-testid="junior-handicap"
              >
                {junior.handicap_index?.toFixed(1)}
              </p>
            ) : (
              <p className="mt-1 max-w-[12rem] text-sm font-semibold text-slate">
                Not yet established.
              </p>
            )}
          </div>
        </div>
      </GlassCard>

      {/* 3) Full intake profile */}
      <IntakeProfileSection junior={junior} />

      {/* 4) Staff edit — admin/committee only (coaches view only) */}
      {canEdit ? <StaffEditCard junior={junior} /> : null}

      {/* 5) Progress vs band minimum */}
      <ProgressSection junior={junior} bands={bands} />

      {/* 6) Handicap trend */}
      <HandicapTrendSection junior={junior} />

      {/* 7) Competition history (hero stats live here — not duplicated above) */}
      <CompetitionHistory juniorId={junior.id} />

      {/* 8) Recent attendance */}
      <AttendanceSection junior={junior} />
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function JuniorProfilePage() {
  const { id } = useParams<{ id: string }>();
  const juniorId = Number(id);
  const validId = Number.isInteger(juniorId) && juniorId > 0;

  const { user } = useAuth();
  const canEdit = user?.role === 'admin' || user?.role === 'committee';

  const juniorsQuery = useAllJuniors();
  const bandsQuery = useLevelBands();
  const coachesQuery = useCoachUsers();

  const junior = validId
    ? juniorsQuery.data?.find((j) => j.id === juniorId)
    : undefined;

  return (
    <div
      className="mx-auto max-w-4xl animate-fade-in-up"
      data-testid="junior-profile-page"
    >
      <Link
        to="/juniors"
        className="inline-flex items-center gap-1.5 rounded text-sm font-bold text-azure transition hover:gap-2.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-azure/50"
        data-testid="junior-back-link"
      >
        <ArrowLeft size={15} aria-hidden />
        All juniors
      </Link>

      <div className="mt-4">
        {juniorsQuery.isLoading ? (
          <div
            className="flex items-center justify-center gap-3 py-16 text-slate"
            data-testid="junior-loading"
          >
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
            <span>Loading profile…</span>
          </div>
        ) : juniorsQuery.isError ? (
          <GlassCard
            className="border border-red-500/30 bg-red-500/10 p-5"
            role="alert"
            data-testid="junior-error"
          >
            <div className="flex items-center gap-3 text-red-400">
              <AlertCircle className="h-5 w-5 shrink-0" aria-hidden="true" />
              <span className="text-sm font-semibold">
                {errorMessage(
                  juniorsQuery.error,
                  'Could not load this profile. Please try again.',
                )}
              </span>
            </div>
          </GlassCard>
        ) : !junior ? (
          <GlassCard className="p-10 text-center" data-testid="junior-not-found">
            <ShieldAlert
              size={28}
              className="mx-auto text-slate"
              aria-hidden="true"
            />
            <h1 className="mt-3 text-lg font-black text-silver">
              Junior not found
            </h1>
            <p className="mx-auto mt-2 max-w-md text-sm text-slate">
              There is no junior with this id in the programme — it may have
              been removed, or the link is out of date.
            </p>
            <Link
              to="/juniors"
              className="mt-4 inline-flex items-center gap-1 text-sm font-bold text-azure hover:gap-2"
            >
              Back to all juniors
            </Link>
          </GlassCard>
        ) : (
          <JuniorProfileBody
            junior={junior}
            bands={bandsQuery.data}
            coaches={coachesQuery.data ?? []}
            canEdit={canEdit}
          />
        )}
      </div>
    </div>
  );
}
