// Tournament CREATE / EDIT — admin & coach only (route-guarded in App.tsx). One
// component serves both /tournaments/new (create) and /tournaments/:id/edit
// (edit); mode is detected from the :id route param.
//
// The backend is PERMISSIVE: it does NOT validate required fields or status
// transitions. So this form validates client-side (name / format / holes /
// start_date are required) and only sends optionals that are actually set —
// empty strings are omitted, cleared numbers go as null on edit. A non-blocking
// warning nudges the user to pick a tee (score entry needs one later).
//
// In edit mode the DIVISIONS MANAGER renders as a section (needs a tournament_id).

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  Layers,
  Loader2,
  Pencil,
  Plus,
  Save,
  Trash2,
  Trophy,
  X,
} from 'lucide-react';

import { ApiError } from '../../lib/api';
import { cn } from '../../lib/cn';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { GlassCard } from '../../components/ui/GlassCard';
import { useCoursesWithTees } from '../admin/admin-courses.queries';
import { useSeriesList } from './series.queries';
import type { CourseTee, CourseWithTees } from '../../types/api';
import {
  divisionBasisLabel,
  useCreateDivision,
  useCreateTournament,
  useDeleteDivision,
  useTournament,
  useTournamentDivisions,
  useUpdateDivision,
  useUpdateTournament,
  type DivisionBasis,
  type DivisionInput,
  type ScoringBasis,
  type Tournament,
  type TournamentDivision,
  type TournamentFormat,
  type TournamentInput,
} from './tournaments.queries';

// ── Shared error helper ──────────────────────────────────────────────────────

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Something went wrong. Please try again.';
}

// ── Form field primitives (match the app's glass input treatment) ─────────────

const inputClass =
  'w-full rounded-xl bg-white/5 px-4 py-3 text-sm text-silver placeholder:text-slate/60 outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-azure/60 disabled:opacity-50';

const labelClass = 'block text-sm font-semibold text-silver';

function Field({
  label,
  htmlFor,
  error,
  hint,
  children,
}: {
  label: string;
  htmlFor?: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className={labelClass}>
        {label}
      </label>
      {hint ? <p className="mt-0.5 text-xs text-slate">{hint}</p> : null}
      <div className="mt-1.5">{children}</div>
      {error ? (
        <p className="mt-1 text-xs font-semibold text-red-400" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function SectionCard({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <GlassCard className="overflow-hidden">
      <div className="flex items-center gap-2 border-b border-white/5 px-5 py-4">
        {icon}
        <h2 className="text-sm font-bold uppercase tracking-widest text-azure">
          {title}
        </h2>
      </div>
      <div className="space-y-5 px-5 py-5">{children}</div>
    </GlassCard>
  );
}

// ── Number parsing: "" → undefined (omit); a valid number → number ────────────
// `null` is only ever produced by the editor when explicitly clearing a value.

function parseIntOrUndef(value: string): number | undefined {
  if (value.trim() === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : undefined;
}

function parseFloatOrUndef(value: string): number | undefined {
  if (value.trim() === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

// Tee option label: "White · Men · 73.0/137"
function teeLabel(tee: CourseTee): string {
  const gender = tee.gender
    ? tee.gender.charAt(0).toUpperCase() + tee.gender.slice(1)
    : '';
  const name = tee.name || tee.color;
  return [name, gender, `${tee.course_rating}/${tee.slope_rating}`]
    .filter(Boolean)
    .join(' · ');
}

// ── Tournament form state ──────────────────────────────────────────────────────
// String-backed for text/number inputs (so empty stays empty); booleans/enums
// stay typed. Eligibility numbers are strings, parsed at submit.

interface FormState {
  name: string;
  format: TournamentFormat;
  scoring_basis: ScoringBasis;
  holes: 9 | 18;
  start_date: string;
  end_date: string;
  course_id: string; // '' = none
  tee_set_id: string; // '' = none
  counts_toward_handicap: boolean;
  max_entrants: string;
  description: string;
  series_id: string; // '' = none
  age_min: string;
  age_max: string;
  level_min: string;
  level_max: string;
  handicap_min: string;
  handicap_max: string;
  handicap_required: boolean;
}

const EMPTY_FORM: FormState = {
  name: '',
  format: 'stroke_play',
  scoring_basis: 'gross',
  holes: 18,
  start_date: '',
  end_date: '',
  course_id: '',
  tee_set_id: '',
  counts_toward_handicap: false,
  max_entrants: '',
  description: '',
  series_id: '',
  age_min: '',
  age_max: '',
  level_min: '',
  level_max: '',
  handicap_min: '',
  handicap_max: '',
  handicap_required: false,
};

function toFormState(t: Tournament): FormState {
  return {
    name: t.name,
    format: t.format,
    scoring_basis: t.scoring_basis,
    holes: t.holes === 9 ? 9 : 18,
    start_date: t.start_date ?? '',
    end_date: t.end_date ?? '',
    course_id: t.course_id != null ? String(t.course_id) : '',
    tee_set_id: t.tee_set_id != null ? String(t.tee_set_id) : '',
    counts_toward_handicap: t.counts_toward_handicap,
    max_entrants: t.max_entrants != null ? String(t.max_entrants) : '',
    description: t.description ?? '',
    series_id: t.series_id != null ? String(t.series_id) : '',
    age_min: t.age_min != null ? String(t.age_min) : '',
    age_max: t.age_max != null ? String(t.age_max) : '',
    level_min: t.level_min != null ? String(t.level_min) : '',
    level_max: t.level_max != null ? String(t.level_max) : '',
    handicap_min: t.handicap_min != null ? String(t.handicap_min) : '',
    handicap_max: t.handicap_max != null ? String(t.handicap_max) : '',
    handicap_required: t.handicap_required,
  };
}

interface FieldErrors {
  name?: string;
  start_date?: string;
  format?: string;
  holes?: string;
}

// The backend does no required-field validation (missing not-null → 409), so we
// enforce all four NOT-NULL columns here. format/holes are constrained by their
// controls today, but guard them explicitly so the contract doesn't rely on
// widget defaults.
function validate(form: FormState): FieldErrors {
  const errors: FieldErrors = {};
  if (!form.name.trim()) errors.name = 'A tournament name is required.';
  if (!form.start_date) errors.start_date = 'A start date is required.';
  if (!['stroke_play', 'stableford', 'match_play'].includes(form.format))
    errors.format = 'Choose a format.';
  if (![9, 18].includes(Number(form.holes))) errors.holes = 'Choose 9 or 18 holes.';
  return errors;
}

const FORMAT_OPTIONS: { value: TournamentFormat; label: string }[] = [
  { value: 'stroke_play', label: 'Stroke play' },
  { value: 'stableford', label: 'Stableford' },
  { value: 'match_play', label: 'Match play' },
];

const SCORING_OPTIONS: { value: ScoringBasis; label: string }[] = [
  { value: 'gross', label: 'Gross' },
  { value: 'net', label: 'Net' },
  { value: 'both', label: 'Gross & net' },
];

// Build the API payload from form state. CREATE omits all unset optionals.
// EDIT sends a full set so cleared fields become null (the only way to unset on
// a permissive PUT). `editMode` toggles that behaviour.
function buildPayload(form: FormState, editMode: boolean): TournamentInput {
  const isMatchPlay = form.format === 'match_play';

  const num = (raw: string, parse: (v: string) => number | undefined) => {
    const parsed = parse(raw);
    if (parsed !== undefined) return parsed;
    return editMode ? null : undefined;
  };

  const payload: TournamentInput = {
    name: form.name.trim(),
    format: form.format,
    holes: form.holes,
    start_date: form.start_date,
    counts_toward_handicap: form.counts_toward_handicap,
    handicap_required: form.handicap_required,
    // match play has no gross/net basis; send gross as a stable default.
    scoring_basis: isMatchPlay ? 'gross' : form.scoring_basis,
  };

  const courseId = parseIntOrUndef(form.course_id);
  if (courseId !== undefined) payload.course_id = courseId;
  else if (editMode) payload.course_id = null;

  const teeId = parseIntOrUndef(form.tee_set_id);
  if (teeId !== undefined) payload.tee_set_id = teeId;
  else if (editMode) payload.tee_set_id = null;

  const seriesId = parseIntOrUndef(form.series_id);
  if (seriesId !== undefined) payload.series_id = seriesId;
  else if (editMode) payload.series_id = null;

  if (form.end_date) payload.end_date = form.end_date;
  else if (editMode) payload.end_date = null;

  if (form.description.trim()) payload.description = form.description.trim();
  else if (editMode) payload.description = null;

  payload.max_entrants = num(form.max_entrants, parseIntOrUndef);
  payload.age_min = num(form.age_min, parseIntOrUndef);
  payload.age_max = num(form.age_max, parseIntOrUndef);
  payload.level_min = num(form.level_min, parseIntOrUndef);
  payload.level_max = num(form.level_max, parseIntOrUndef);
  payload.handicap_min = num(form.handicap_min, parseFloatOrUndef);
  payload.handicap_max = num(form.handicap_max, parseFloatOrUndef);

  // Strip undefined keys so create doesn't send them at all.
  for (const key of Object.keys(payload) as (keyof TournamentInput)[]) {
    if (payload[key] === undefined) delete payload[key];
  }
  return payload;
}

// ── Course + tee pickers ───────────────────────────────────────────────────────

function CourseTeePickers({
  form,
  setForm,
  courses,
  loading,
}: {
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  courses: CourseWithTees[] | undefined;
  loading: boolean;
}) {
  const selectedCourse = useMemo(() => {
    const id = parseIntOrUndef(form.course_id);
    if (id === undefined) return undefined;
    return courses?.find((c) => c.id === id);
  }, [courses, form.course_id]);

  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <Field label="Course" htmlFor="course_id" hint="Where the event is played.">
        <select
          id="course_id"
          className={inputClass}
          value={form.course_id}
          disabled={loading}
          onChange={(e) =>
            // Changing course clears the tee (tees are course-specific).
            setForm((f) => ({ ...f, course_id: e.target.value, tee_set_id: '' }))
          }
        >
          <option value="" className="bg-navy">
            {loading ? 'Loading courses…' : 'No course selected'}
          </option>
          {(courses ?? []).map((c) => (
            <option key={c.id} value={c.id} className="bg-navy">
              {c.name}
            </option>
          ))}
        </select>
      </Field>

      <Field
        label="Tee set"
        htmlFor="tee_set_id"
        hint="Needed before scores can be entered."
      >
        <select
          id="tee_set_id"
          className={inputClass}
          value={form.tee_set_id}
          disabled={!selectedCourse}
          onChange={(e) =>
            setForm((f) => ({ ...f, tee_set_id: e.target.value }))
          }
        >
          <option value="" className="bg-navy">
            {selectedCourse ? 'No tee selected' : 'Select a course first'}
          </option>
          {(selectedCourse?.tees ?? []).map((tee) => (
            <option key={tee.id} value={tee.id} className="bg-navy">
              {teeLabel(tee)}
            </option>
          ))}
        </select>
      </Field>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export function TournamentFormPage() {
  const { id } = useParams<{ id: string }>();
  const editMode = id !== undefined;
  const tournamentId = Number(id);
  const validEditId = editMode && Number.isFinite(tournamentId) && tournamentId > 0;

  const navigate = useNavigate();

  const existing = useTournament(validEditId ? tournamentId : NaN);
  const coursesQuery = useCoursesWithTees();
  const seriesQuery = useSeriesList();

  const createMutation = useCreateTournament();
  const updateMutation = useUpdateTournament();

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [hydrated, setHydrated] = useState(false);

  // Hydrate the form once the existing tournament loads (edit mode).
  useEffect(() => {
    if (editMode && existing.data && !hydrated) {
      setForm(toFormState(existing.data));
      setHydrated(true);
    }
  }, [editMode, existing.data, hydrated]);

  const isMatchPlay = form.format === 'match_play';
  const teeMissing = parseIntOrUndef(form.tee_set_id) === undefined;
  const submitting = createMutation.isPending || updateMutation.isPending;
  const submitError = createMutation.error ?? updateMutation.error;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const found = validate(form);
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    const payload = buildPayload(form, editMode);

    if (editMode && validEditId) {
      updateMutation.mutate(
        { id: tournamentId, body: payload },
        { onSuccess: () => navigate(`/tournaments/${tournamentId}`) },
      );
    } else {
      createMutation.mutate(payload, {
        onSuccess: (created) => navigate(`/tournaments/${created.id}`),
      });
    }
  }

  // Edit-mode guards: bad id / loading / load error.
  if (editMode && !validEditId) {
    return (
      <FormShell title="Edit tournament">
        <GlassCard className="px-6 py-12 text-center" data-testid="tournament-form-bad-id">
          <Trophy className="mx-auto h-9 w-9 text-slate/60" aria-hidden />
          <p className="mt-3 font-bold text-silver">Tournament not found</p>
          <p className="mt-1 text-sm text-slate">The link looks incorrect.</p>
        </GlassCard>
      </FormShell>
    );
  }

  if (editMode && existing.isLoading) {
    return (
      <FormShell title="Edit tournament">
        <div className="flex items-center gap-3 py-12 text-sm text-slate">
          <Loader2 className="h-5 w-5 animate-spin text-azure" aria-hidden />
          Loading tournament…
        </div>
      </FormShell>
    );
  }

  if (editMode && existing.isError) {
    const notFound =
      existing.error instanceof ApiError && existing.error.status === 404;
    return (
      <FormShell title="Edit tournament">
        <div
          role="alert"
          className="rounded-xl bg-red-500/15 p-4 text-sm text-red-400"
          data-testid="tournament-form-load-error"
        >
          {notFound ? 'Tournament not found.' : errorMessage(existing.error)}
        </div>
      </FormShell>
    );
  }

  const backTo = editMode ? `/tournaments/${tournamentId}` : '/tournaments';

  return (
    <FormShell title={editMode ? 'Edit tournament' : 'New tournament'} backTo={backTo}>
      <form onSubmit={handleSubmit} className="space-y-6" noValidate>
        {/* Basics */}
        <SectionCard
          icon={<Trophy className="h-4 w-4 text-azure" aria-hidden />}
          title="Details"
        >
          <Field label="Name" htmlFor="name" error={errors.name}>
            <input
              id="name"
              className={inputClass}
              value={form.name}
              placeholder="Karen Junior Challenge"
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </Field>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Format" htmlFor="format">
              <select
                id="format"
                className={inputClass}
                value={form.format}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    format: e.target.value as TournamentFormat,
                  }))
                }
              >
                {FORMAT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value} className="bg-navy">
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field
              label="Scoring basis"
              htmlFor="scoring_basis"
              hint={isMatchPlay ? 'n/a for match play' : undefined}
            >
              <select
                id="scoring_basis"
                className={inputClass}
                value={isMatchPlay ? '' : form.scoring_basis}
                disabled={isMatchPlay}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    scoring_basis: e.target.value as ScoringBasis,
                  }))
                }
              >
                {isMatchPlay ? (
                  <option value="" className="bg-navy">
                    Not applicable
                  </option>
                ) : (
                  SCORING_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value} className="bg-navy">
                      {o.label}
                    </option>
                  ))
                )}
              </select>
            </Field>
          </div>

          <Field label="Holes">
            <div className="flex gap-3" role="radiogroup" aria-label="Holes">
              {[18, 9].map((h) => {
                const active = form.holes === h;
                return (
                  <button
                    key={h}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() =>
                      setForm((f) => ({ ...f, holes: h as 9 | 18 }))
                    }
                    className={cn(
                      'flex-1 rounded-xl px-4 py-3 text-sm font-bold ring-1 transition-all',
                      active
                        ? 'bg-azure/20 text-azure ring-azure/60'
                        : 'bg-white/5 text-slate ring-white/10 hover:bg-white/10',
                    )}
                  >
                    {h} holes
                  </button>
                );
              })}
            </div>
          </Field>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Start date" htmlFor="start_date" error={errors.start_date}>
              <input
                id="start_date"
                type="date"
                className={inputClass}
                value={form.start_date}
                onChange={(e) =>
                  setForm((f) => ({ ...f, start_date: e.target.value }))
                }
              />
            </Field>
            <Field
              label="End date"
              htmlFor="end_date"
              hint="Optional — leave blank for a single-day event."
            >
              <input
                id="end_date"
                type="date"
                className={inputClass}
                value={form.end_date}
                min={form.start_date || undefined}
                onChange={(e) =>
                  setForm((f) => ({ ...f, end_date: e.target.value }))
                }
              />
            </Field>
          </div>

          <CourseTeePickers
            form={form}
            setForm={setForm}
            courses={coursesQuery.data}
            loading={coursesQuery.isLoading}
          />
          {coursesQuery.isError ? (
            <p className="text-xs text-red-400" role="alert">
              Could not load courses: {errorMessage(coursesQuery.error)}
            </p>
          ) : null}
          {teeMissing ? (
            <div
              className="flex items-start gap-2 rounded-xl bg-gold/10 px-3 py-2.5 text-xs text-gold"
              data-testid="tee-warning"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span>
                No tee selected. Scores can&apos;t be entered for this event until
                a tee is set.
              </span>
            </div>
          ) : null}

          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              label="Max entrants"
              htmlFor="max_entrants"
              hint="Optional cap on the field."
            >
              <input
                id="max_entrants"
                type="number"
                min={1}
                inputMode="numeric"
                className={inputClass}
                value={form.max_entrants}
                placeholder="No limit"
                onChange={(e) =>
                  setForm((f) => ({ ...f, max_entrants: e.target.value }))
                }
              />
            </Field>
            <Field label="Counts toward handicap">
              <Toggle
                checked={form.counts_toward_handicap}
                onChange={(v) =>
                  setForm((f) => ({ ...f, counts_toward_handicap: v }))
                }
                label="Write a WHS round per player"
              />
            </Field>
            <Field
              label="Series"
              htmlFor="series_id"
              hint="Optional — completed results feed the series standings."
            >
              <select
                id="series_id"
                className={inputClass}
                value={form.series_id}
                disabled={seriesQuery.isLoading}
                onChange={(e) =>
                  setForm((f) => ({ ...f, series_id: e.target.value }))
                }
              >
                <option value="" className="bg-navy">
                  No series
                </option>
                {(seriesQuery.data ?? []).map((s) => (
                  <option key={s.id} value={String(s.id)} className="bg-navy">
                    {s.name} ({s.year})
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Field
            label="Description"
            htmlFor="description"
            hint="Optional — shown on the event page."
          >
            <textarea
              id="description"
              rows={4}
              className={cn(inputClass, 'resize-y')}
              value={form.description}
              placeholder="Format notes, prizes, tee times…"
              onChange={(e) =>
                setForm((f) => ({ ...f, description: e.target.value }))
              }
            />
          </Field>
        </SectionCard>

        {/* Eligibility */}
        <SectionCard
          icon={<Layers className="h-4 w-4 text-azure" aria-hidden />}
          title="Eligibility"
        >
          <p className="text-xs text-slate">
            Leave any field blank for no restriction on that dimension.
          </p>
          <RangeRow
            label="Age"
            minId="age_min"
            maxId="age_max"
            min={form.age_min}
            max={form.age_max}
            onMin={(v) => setForm((f) => ({ ...f, age_min: v }))}
            onMax={(v) => setForm((f) => ({ ...f, age_max: v }))}
          />
          <RangeRow
            label="Level"
            minId="level_min"
            maxId="level_max"
            min={form.level_min}
            max={form.level_max}
            onMin={(v) => setForm((f) => ({ ...f, level_min: v }))}
            onMax={(v) => setForm((f) => ({ ...f, level_max: v }))}
          />
          <RangeRow
            label="Handicap index"
            minId="handicap_min"
            maxId="handicap_max"
            min={form.handicap_min}
            max={form.handicap_max}
            step="0.1"
            onMin={(v) => setForm((f) => ({ ...f, handicap_min: v }))}
            onMax={(v) => setForm((f) => ({ ...f, handicap_max: v }))}
          />
          <Field label="Handicap required">
            <Toggle
              checked={form.handicap_required}
              onChange={(v) =>
                setForm((f) => ({ ...f, handicap_required: v }))
              }
              label="Players must hold a handicap index to enter"
            />
          </Field>
        </SectionCard>

        {submitError ? (
          <div
            role="alert"
            className="rounded-xl bg-red-500/15 p-4 text-sm text-red-400"
            data-testid="tournament-form-error"
          >
            {errorMessage(submitError)}
          </div>
        ) : null}

        <div className="flex items-center gap-3">
          <Button type="submit" size="md" disabled={submitting} data-testid="tournament-save">
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Save className="h-4 w-4" aria-hidden />
            )}
            {editMode ? 'Save changes' : 'Create tournament'}
          </Button>
          <Link to={backTo}>
            <Button type="button" variant="ghost" size="md">
              Cancel
            </Button>
          </Link>
        </div>
      </form>

      {/* Divisions — edit mode only (needs a tournament_id). */}
      {editMode && validEditId ? (
        <div className="mt-6">
          <DivisionsManager
            tournamentId={tournamentId}
            courses={coursesQuery.data}
          />
        </div>
      ) : null}
    </FormShell>
  );
}

// ── Page shell ───────────────────────────────────────────────────────────────

function FormShell({
  title,
  backTo = '/tournaments',
  children,
}: {
  title: string;
  backTo?: string;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-3xl animate-fade-in-up">
      <Link
        to={backTo}
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate transition-colors hover:text-azure focus:outline-none focus-visible:ring-2 focus-visible:ring-azure/50 rounded"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Back
      </Link>
      <h1 className="mt-4 mb-6 text-2xl font-black text-silver">{title}</h1>
      {children}
    </div>
  );
}

// ── Toggle ───────────────────────────────────────────────────────────────────

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center gap-3 rounded-xl bg-white/5 px-4 py-3 text-left ring-1 ring-white/10 transition-colors hover:bg-white/10"
    >
      <span
        className={cn(
          'relative h-6 w-11 shrink-0 rounded-full transition-colors',
          checked ? 'bg-azure' : 'bg-white/15',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform',
            checked ? 'translate-x-[1.375rem]' : 'translate-x-0.5',
          )}
        />
      </span>
      <span className="text-sm text-silver">{label}</span>
    </button>
  );
}

// ── Range row (min/max pair) ───────────────────────────────────────────────────

function RangeRow({
  label,
  minId,
  maxId,
  min,
  max,
  step,
  onMin,
  onMax,
}: {
  label: string;
  minId: string;
  maxId: string;
  min: string;
  max: string;
  step?: string;
  onMin: (v: string) => void;
  onMax: (v: string) => void;
}) {
  return (
    <div>
      <span className={labelClass}>{label}</span>
      <div className="mt-1.5 grid grid-cols-2 gap-3">
        <input
          id={minId}
          type="number"
          step={step}
          inputMode="decimal"
          className={inputClass}
          value={min}
          placeholder="Min"
          aria-label={`${label} minimum`}
          onChange={(e) => onMin(e.target.value)}
        />
        <input
          id={maxId}
          type="number"
          step={step}
          inputMode="decimal"
          className={inputClass}
          value={max}
          placeholder="Max"
          aria-label={`${label} maximum`}
          onChange={(e) => onMax(e.target.value)}
        />
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Divisions manager
// ══════════════════════════════════════════════════════════════════════════════

const BASIS_OPTIONS: { value: DivisionBasis; label: string }[] = [
  { value: 'age', label: 'Age group' },
  { value: 'gender', label: 'Gender' },
  { value: 'level', label: 'Level' },
  { value: 'handicap', label: 'Handicap' },
  { value: 'custom', label: 'Custom' },
];

interface DivisionFormState {
  name: string;
  basis: DivisionBasis;
  gender: '' | 'male' | 'female';
  age_min: string;
  age_max: string;
  level_min: string;
  level_max: string;
  handicap_min: string;
  handicap_max: string;
}

const EMPTY_DIVISION: DivisionFormState = {
  name: '',
  basis: 'age',
  gender: '',
  age_min: '',
  age_max: '',
  level_min: '',
  level_max: '',
  handicap_min: '',
  handicap_max: '',
};

function divisionToFormState(d: TournamentDivision): DivisionFormState {
  return {
    name: d.name,
    basis: d.basis,
    gender: d.gender === 'male' || d.gender === 'female' ? d.gender : '',
    age_min: d.age_min != null ? String(d.age_min) : '',
    age_max: d.age_max != null ? String(d.age_max) : '',
    level_min: d.level_min != null ? String(d.level_min) : '',
    level_max: d.level_max != null ? String(d.level_max) : '',
    handicap_min: d.handicap_min != null ? String(d.handicap_min) : '',
    handicap_max: d.handicap_max != null ? String(d.handicap_max) : '',
  };
}

// Build a division payload. On edit, cleared fields go as null to unset them.
function buildDivisionPayload(
  state: DivisionFormState,
  tournamentId: number,
  editMode: boolean,
): DivisionInput {
  const num = (raw: string, parse: (v: string) => number | undefined) => {
    const parsed = parse(raw);
    if (parsed !== undefined) return parsed;
    return editMode ? null : undefined;
  };

  const payload: DivisionInput = {
    tournament_id: tournamentId,
    name: state.name.trim(),
    basis: state.basis,
    gender: state.gender || (editMode ? null : undefined),
    age_min: num(state.age_min, parseIntOrUndef),
    age_max: num(state.age_max, parseIntOrUndef),
    level_min: num(state.level_min, parseIntOrUndef),
    level_max: num(state.level_max, parseIntOrUndef),
    handicap_min: num(state.handicap_min, parseFloatOrUndef),
    handicap_max: num(state.handicap_max, parseFloatOrUndef),
  };

  for (const key of Object.keys(payload) as (keyof DivisionInput)[]) {
    if (payload[key] === undefined) delete payload[key];
  }
  return payload;
}

function divisionCriteriaText(d: TournamentDivision): string {
  const parts: string[] = [];
  const range = (lbl: string, min: number | null, max: number | null) => {
    if (min != null && max != null)
      parts.push(`${lbl} ${min === max ? min : `${min}–${max}`}`);
    else if (min != null) parts.push(`${lbl} ${min}+`);
    else if (max != null) parts.push(`${lbl} ≤ ${max}`);
  };
  range('Ages', d.age_min, d.age_max);
  range('Levels', d.level_min, d.level_max);
  range('HI', d.handicap_min, d.handicap_max);
  if (d.gender) parts.push(d.gender.charAt(0).toUpperCase() + d.gender.slice(1));
  return parts.length ? parts.join(' · ') : 'No criteria set';
}

function DivisionsManager({
  tournamentId,
  courses,
}: {
  tournamentId: number;
  courses: CourseWithTees[] | undefined;
}) {
  const divisionsQuery = useTournamentDivisions(tournamentId);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  // `courses` is accepted for parity with the form but tee selection on a
  // division is rarely needed in v1; kept available for future use.
  void courses;

  return (
    <GlassCard className="overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b border-white/5 px-5 py-4">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-azure" aria-hidden />
          <h2 className="text-sm font-bold uppercase tracking-widest text-azure">
            Divisions
          </h2>
        </div>
        {!adding ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setAdding(true);
              setEditingId(null);
            }}
            data-testid="add-division-btn"
          >
            <Plus className="h-4 w-4" aria-hidden />
            Add division
          </Button>
        ) : null}
      </div>

      <div className="px-5 py-5">
        {divisionsQuery.isLoading ? (
          <div className="flex items-center gap-3 py-4 text-sm text-slate">
            <Loader2 className="h-5 w-5 animate-spin text-azure" aria-hidden />
            Loading divisions…
          </div>
        ) : divisionsQuery.isError ? (
          <div
            role="alert"
            className="rounded-xl bg-red-500/15 p-3 text-sm text-red-400"
          >
            {errorMessage(divisionsQuery.error)}
          </div>
        ) : (
          <>
            {(divisionsQuery.data ?? []).length === 0 && !adding ? (
              <p className="text-sm text-slate" data-testid="divisions-manager-empty">
                No divisions — one overall standing.
              </p>
            ) : (
              <ul className="space-y-3">
                {(divisionsQuery.data ?? []).map((d) =>
                  editingId === d.id ? (
                    <li key={d.id}>
                      <DivisionForm
                        tournamentId={tournamentId}
                        initial={divisionToFormState(d)}
                        divisionId={d.id}
                        onClose={() => setEditingId(null)}
                      />
                    </li>
                  ) : (
                    <li key={d.id}>
                      <DivisionRow
                        division={d}
                        tournamentId={tournamentId}
                        onEdit={() => {
                          setEditingId(d.id);
                          setAdding(false);
                        }}
                      />
                    </li>
                  ),
                )}
              </ul>
            )}

            {adding ? (
              <div className="mt-3">
                <DivisionForm
                  tournamentId={tournamentId}
                  initial={EMPTY_DIVISION}
                  onClose={() => setAdding(false)}
                />
              </div>
            ) : null}
          </>
        )}
      </div>
    </GlassCard>
  );
}

function DivisionRow({
  division,
  tournamentId,
  onEdit,
}: {
  division: TournamentDivision;
  tournamentId: number;
  onEdit: () => void;
}) {
  const del = useDeleteDivision();
  const [confirming, setConfirming] = useState(false);

  return (
    <div
      className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white/[0.03] px-4 py-3 ring-1 ring-white/5"
      data-testid={`division-manage-${division.id}`}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-semibold text-silver">{division.name}</p>
          <Badge tone="violet" shape="pill">
            {divisionBasisLabel(division.basis)}
          </Badge>
        </div>
        <p className="mt-0.5 text-sm text-slate">
          {divisionCriteriaText(division)}
        </p>
      </div>

      {confirming ? (
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate">Delete?</span>
          <Button
            type="button"
            variant="danger"
            size="sm"
            disabled={del.isPending}
            onClick={() =>
              del.mutate(
                { id: division.id, tournamentId },
                { onSuccess: () => setConfirming(false) },
              )
            }
            data-testid={`division-confirm-delete-${division.id}`}
          >
            {del.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              'Delete'
            )}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setConfirming(false)}
          >
            Cancel
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onEdit}>
            <Pencil className="h-4 w-4" aria-hidden />
            Edit
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setConfirming(true)}
            data-testid={`division-delete-${division.id}`}
          >
            <Trash2 className="h-4 w-4" aria-hidden />
          </Button>
        </div>
      )}

      {del.isError ? (
        <p role="alert" className="w-full text-xs text-red-400">
          {errorMessage(del.error)}
        </p>
      ) : null}
    </div>
  );
}

function DivisionForm({
  tournamentId,
  initial,
  divisionId,
  onClose,
}: {
  tournamentId: number;
  initial: DivisionFormState;
  divisionId?: number;
  onClose: () => void;
}) {
  const editMode = divisionId !== undefined;
  const [state, setState] = useState<DivisionFormState>(initial);
  const [nameError, setNameError] = useState<string | undefined>();

  const create = useCreateDivision();
  const update = useUpdateDivision();
  const busy = create.isPending || update.isPending;
  const error = create.error ?? update.error;

  function submit() {
    if (!state.name.trim()) {
      setNameError('A division name is required.');
      return;
    }
    setNameError(undefined);
    const payload = buildDivisionPayload(state, tournamentId, editMode);

    if (editMode && divisionId !== undefined) {
      const { tournament_id: _omit, ...body } = payload;
      void _omit;
      update.mutate(
        { id: divisionId, tournamentId, body },
        { onSuccess: onClose },
      );
    } else {
      create.mutate(payload, { onSuccess: onClose });
    }
  }

  return (
    <div
      className="rounded-xl bg-white/[0.03] p-4 ring-1 ring-white/10"
      data-testid="division-form"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" htmlFor="div-name" error={nameError}>
          <input
            id="div-name"
            className={inputClass}
            value={state.name}
            placeholder="Boys 9–12"
            onChange={(e) => setState((s) => ({ ...s, name: e.target.value }))}
          />
        </Field>
        <Field label="Basis" htmlFor="div-basis">
          <select
            id="div-basis"
            className={inputClass}
            value={state.basis}
            onChange={(e) =>
              setState((s) => ({ ...s, basis: e.target.value as DivisionBasis }))
            }
          >
            {BASIS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value} className="bg-navy">
                {o.label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field label="Gender" htmlFor="div-gender" hint="Optional restriction.">
          <select
            id="div-gender"
            className={inputClass}
            value={state.gender}
            onChange={(e) =>
              setState((s) => ({
                ...s,
                gender: e.target.value as '' | 'male' | 'female',
              }))
            }
          >
            <option value="" className="bg-navy">
              Any
            </option>
            <option value="male" className="bg-navy">
              Male
            </option>
            <option value="female" className="bg-navy">
              Female
            </option>
          </select>
        </Field>
      </div>

      <div className="mt-4 space-y-4">
        <RangeRow
          label="Age"
          minId="div-age-min"
          maxId="div-age-max"
          min={state.age_min}
          max={state.age_max}
          onMin={(v) => setState((s) => ({ ...s, age_min: v }))}
          onMax={(v) => setState((s) => ({ ...s, age_max: v }))}
        />
        <RangeRow
          label="Level"
          minId="div-level-min"
          maxId="div-level-max"
          min={state.level_min}
          max={state.level_max}
          onMin={(v) => setState((s) => ({ ...s, level_min: v }))}
          onMax={(v) => setState((s) => ({ ...s, level_max: v }))}
        />
        <RangeRow
          label="Handicap index"
          minId="div-hi-min"
          maxId="div-hi-max"
          min={state.handicap_min}
          max={state.handicap_max}
          step="0.1"
          onMin={(v) => setState((s) => ({ ...s, handicap_min: v }))}
          onMax={(v) => setState((s) => ({ ...s, handicap_max: v }))}
        />
      </div>

      {error ? (
        <p role="alert" className="mt-3 text-xs text-red-400">
          {errorMessage(error)}
        </p>
      ) : null}

      <div className="mt-4 flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          onClick={submit}
          disabled={busy}
          data-testid="division-save"
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Save className="h-4 w-4" aria-hidden />
          )}
          {editMode ? 'Save' : 'Add'}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          <X className="h-4 w-4" aria-hidden />
          Cancel
        </Button>
      </div>
    </div>
  );
}
