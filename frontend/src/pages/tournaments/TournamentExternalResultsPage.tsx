// External results — admin/coach screen (route /tournaments/external, route-
// guarded by the parent; also gated inside via useAuth as defence in depth).
//
// External events (Faldo Series, US Kids, JGF, Karen Open, …) are lightweight
// result logs that feed a junior's competitions-played / best-gross stats. This
// screen lets staff log, edit, and delete them, filtered by junior (and event
// type). The backend owns scoping and validation; we submit raw values, validate
// the few required fields client-side, and surface API errors inline.

import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  BadgeCheck,
  Loader2,
  Pencil,
  Plus,
  Save,
  ShieldAlert,
  Trash2,
  Trophy,
  X,
} from 'lucide-react';

import { ApiError, api } from '../../lib/api';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { GlassCard } from '../../components/ui/GlassCard';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../auth/useAuth';
import {
  EXTERNAL_EVENT_TYPES,
  eventTypeLabel,
  eventTypeTone,
  formatEventDate,
  useDeleteExternalResult,
  useExternalResults,
  useLogExternalResult,
  useUpdateExternalResult,
  useVerifyExternalResult,
  type ExternalEventType,
  type ExternalResult,
  type LogExternalResultInput,
} from './tournament-external.queries';

// ── Juniors name map (shares the ['juniors','all'] cache key used elsewhere) ───

interface JuniorWithName {
  id: number;
  full_name?: string;
}

function useJuniorNames() {
  const query = useQuery({
    queryKey: ['juniors', 'all'],
    queryFn: () => api.get<JuniorWithName[]>('/api/juniors'),
    staleTime: 60 * 1000,
  });
  const juniors = useMemo(() => {
    return [...(query.data ?? [])].sort((a, b) =>
      (a.full_name ?? `Golfer #${a.id}`).localeCompare(
        b.full_name ?? `Golfer #${b.id}`,
      ),
    );
  }, [query.data]);
  const byId = useMemo(() => {
    const map = new Map<number, string>();
    for (const j of query.data ?? []) {
      if (j.full_name?.trim()) map.set(j.id, j.full_name.trim());
    }
    return map;
  }, [query.data]);
  return {
    juniors,
    nameFor: (id: number) => byId.get(id) ?? `Golfer #${id}`,
    isLoading: query.isLoading,
    isError: query.isError,
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return fallback;
}

const inputClass =
  'w-full rounded-xl bg-white/5 px-4 py-3 text-sm text-silver placeholder:text-slate/60 outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-azure/60 disabled:opacity-50';
const labelClass = 'block text-sm font-semibold text-silver';

// "" → undefined (omit); a valid number → number. Used for optional numerics.
function numOrUndef(raw: string): number | undefined {
  if (raw.trim() === '') return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

// ── Page ───────────────────────────────────────────────────────────────────────

export function TournamentExternalResultsPage() {
  const { user } = useAuth();

  // Defence-in-depth role gate (the route is also guarded by the parent).
  if (user?.role !== 'admin' && user?.role !== 'coach') {
    return (
      <div className="mx-auto max-w-3xl animate-fade-in-up">
        <BackLink />
        <GlassCard
          className="mt-6 px-6 py-16 text-center"
          data-testid="external-not-authorized"
        >
          <ShieldAlert className="mx-auto h-10 w-10 text-slate/60" aria-hidden />
          <p className="mt-4 text-base font-bold text-silver">
            Not available for your role
          </p>
          <p className="mt-1 text-sm text-slate">
            Only coaches and admins can log external results.
          </p>
        </GlassCard>
      </div>
    );
  }

  return <ExternalResultsScreen />;
}

function ExternalResultsScreen() {
  const names = useJuniorNames();
  const [juniorId, setJuniorId] = useState<number | ''>('');
  const [eventType, setEventType] = useState<string>('');
  const [unverifiedOnly, setUnverifiedOnly] = useState(false);

  const filter = {
    juniorId: juniorId === '' ? undefined : juniorId,
    eventType: eventType === '' ? undefined : eventType,
  };
  const results = useExternalResults(filter);

  return (
    <div className="mx-auto max-w-4xl animate-fade-in-up">
      <BackLink />

      <div className="mt-4">
        <div className="flex items-center gap-2">
          <Badge tone="violet" shape="pill">
            External
          </Badge>
        </div>
        <h1 className="mt-3 text-2xl font-black text-silver">External results</h1>
        <p className="mt-1 text-sm text-slate">
          Log results from Faldo Series, US Kids, JGF, the Karen Open and other
          outside events. These feed each junior&apos;s competitions-played and
          best-gross stats.
        </p>
      </div>

      {/* Log form */}
      <div className="mt-6">
        <LogForm
          names={names}
          defaultJuniorId={juniorId === '' ? undefined : juniorId}
        />
      </div>

      {/* Filters + list */}
      <div className="mt-6">
        <GlassCard className="overflow-hidden" data-testid="external-list">
          <div className="flex flex-wrap items-center gap-3 border-b border-white/5 px-5 py-4">
            <Trophy className="h-4 w-4 text-azure" aria-hidden />
            <h2 className="text-sm font-bold uppercase tracking-widest text-azure">
              Logged results
            </h2>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <label className="sr-only" htmlFor="filter-junior">
                Filter by junior
              </label>
              <select
                id="filter-junior"
                className={inputClass + ' max-w-[14rem]'}
                value={juniorId}
                onChange={(e) =>
                  setJuniorId(e.target.value === '' ? '' : Number(e.target.value))
                }
                disabled={names.isLoading}
                data-testid="filter-junior"
              >
                <option value="">All juniors</option>
                {names.juniors.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.full_name?.trim() || `Golfer #${j.id}`}
                  </option>
                ))}
              </select>
              <label className="sr-only" htmlFor="filter-event-type">
                Filter by event type
              </label>
              <select
                id="filter-event-type"
                className={inputClass + ' max-w-[12rem]'}
                value={eventType}
                onChange={(e) => setEventType(e.target.value)}
                data-testid="filter-event-type"
              >
                <option value="">All event types</option>
                {EXTERNAL_EVENT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {eventTypeLabel(t)}
                  </option>
                ))}
              </select>
              <label className="flex cursor-pointer items-center gap-2 rounded-xl bg-white/5 px-3.5 py-3 text-sm font-semibold text-silver ring-1 ring-white/10">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-white/20 bg-white/5 accent-gold"
                  checked={unverifiedOnly}
                  onChange={(e) => setUnverifiedOnly(e.target.checked)}
                  data-testid="filter-unverified"
                />
                Unverified only
              </label>
            </div>
          </div>

          <ResultsTable
            query={results}
            nameFor={names.nameFor}
            unverifiedOnly={unverifiedOnly}
          />
        </GlassCard>
      </div>
    </div>
  );
}

function BackLink() {
  return (
    <Link
      to="/tournaments"
      className="inline-flex items-center gap-1.5 rounded text-sm font-semibold text-slate transition-colors hover:text-azure focus:outline-none focus-visible:ring-2 focus-visible:ring-azure/50"
      data-testid="external-back-link"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden />
      All tournaments
    </Link>
  );
}

// ── Results table ─────────────────────────────────────────────────────────────

function ResultsTable({
  query,
  nameFor,
  unverifiedOnly,
}: {
  query: ReturnType<typeof useExternalResults>;
  nameFor: (id: number) => string;
  unverifiedOnly: boolean;
}) {
  if (query.isLoading) {
    return (
      <div className="flex items-center gap-3 px-5 py-10 text-sm text-slate">
        <Loader2 className="h-5 w-5 animate-spin text-azure" aria-hidden />
        Loading results…
      </div>
    );
  }

  if (query.isError) {
    return (
      <div
        role="alert"
        className="m-5 rounded-xl bg-red-500/15 p-3 text-sm text-red-400"
        data-testid="external-list-error"
      >
        {errorMessage(query.error, 'Could not load external results.')}
      </div>
    );
  }

  // Client-side verification filter — the list endpoint has no verified param.
  const results = (query.data ?? []).filter(
    (r) => !unverifiedOnly || !r.verified,
  );
  if (results.length === 0) {
    return (
      <p
        className="px-5 py-10 text-center text-sm text-slate"
        data-testid="external-list-empty"
      >
        {unverifiedOnly
          ? 'No unverified results — everything here is verified.'
          : 'No external results logged yet.'}
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wider text-slate">
            <th scope="col" className="px-5 py-2 font-semibold">
              Junior
            </th>
            <th scope="col" className="px-3 py-2 font-semibold">
              Event
            </th>
            <th scope="col" className="px-3 py-2 font-semibold">
              Date
            </th>
            <th scope="col" className="px-3 py-2 text-center font-semibold">
              Holes
            </th>
            <th scope="col" className="px-3 py-2 text-right font-semibold">
              Gross
            </th>
            <th scope="col" className="px-3 py-2 text-right font-semibold">
              Position
            </th>
            <th scope="col" className="px-5 py-2 text-right font-semibold">
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {results.map((r) => (
            <ResultRow key={r.id} result={r} nameFor={nameFor} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ResultRow({
  result,
  nameFor,
}: {
  result: ExternalResult;
  nameFor: (id: number) => string;
}) {
  const [editing, setEditing] = useState(false);
  const del = useDeleteExternalResult();
  const verify = useVerifyExternalResult();

  if (editing) {
    return (
      <tr className="border-t border-white/5">
        <td colSpan={7} className="px-5 py-4">
          <EditForm
            result={result}
            juniorName={nameFor(result.junior_id)}
            onDone={() => setEditing(false)}
          />
        </td>
      </tr>
    );
  }

  const position =
    result.position == null
      ? '—'
      : result.field_size != null
        ? `#${result.position} / ${result.field_size}`
        : `#${result.position}`;

  return (
    <tr
      className="border-t border-white/5 align-top"
      data-testid={`external-row-${result.id}`}
    >
      <td className="px-5 py-3 font-semibold text-silver">
        {nameFor(result.junior_id)}
      </td>
      <td className="px-3 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-silver">{result.event_name}</span>
          <Badge tone={eventTypeTone(result.event_type)} shape="pill">
            {eventTypeLabel(result.event_type)}
          </Badge>
          {result.counts_toward_handicap ? (
            <Badge tone="gold" shape="pill">
              Counts to HCP
            </Badge>
          ) : null}
          {!result.verified ? (
            <Badge tone="gold" shape="pill" data-testid={`external-unverified-${result.id}`}>
              Unverified
            </Badge>
          ) : null}
        </div>
        {result.notes ? (
          <p className="mt-1 text-xs text-slate">{result.notes}</p>
        ) : null}
      </td>
      <td className="px-3 py-3 text-slate">{formatEventDate(result.date)}</td>
      <td className="px-3 py-3 text-center font-mono text-slate">
        {result.holes ?? '—'}
      </td>
      <td className="px-3 py-3 text-right font-mono text-silver">
        {result.gross_score ?? '—'}
      </td>
      <td className="px-3 py-3 text-right font-mono text-silver">{position}</td>
      <td className="px-5 py-3">
        <div className="flex items-center justify-end gap-2">
          {!result.verified ? (
            <Button
              size="sm"
              disabled={verify.isPending}
              onClick={() => verify.mutate(result.id)}
              data-testid={`external-verify-${result.id}`}
            >
              {verify.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : (
                <BadgeCheck className="h-3.5 w-3.5" aria-hidden />
              )}
              Verify
            </Button>
          ) : null}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setEditing(true)}
            data-testid={`external-edit-${result.id}`}
          >
            <Pencil className="h-3.5 w-3.5" aria-hidden />
            Edit
          </Button>
          <Button
            variant="danger"
            size="sm"
            disabled={del.isPending}
            onClick={() => {
              if (
                window.confirm(
                  `Delete the ${result.event_name} result for ${nameFor(result.junior_id)}?`,
                )
              ) {
                del.mutate(result.id);
              }
            }}
            data-testid={`external-delete-${result.id}`}
          >
            {del.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
            )}
            Delete
          </Button>
        </div>
        {verify.isError ? (
          <p
            role="alert"
            className="mt-2 text-right text-xs font-semibold text-red-400"
          >
            {errorMessage(verify.error, 'Could not verify.')}
          </p>
        ) : null}
        {del.isError ? (
          <p
            role="alert"
            className="mt-2 text-right text-xs font-semibold text-red-400"
          >
            {errorMessage(del.error, 'Could not delete.')}
          </p>
        ) : null}
      </td>
    </tr>
  );
}

// ── Shared form fields ────────────────────────────────────────────────────────

interface FormState {
  juniorId: number | '';
  eventName: string;
  eventType: ExternalEventType | '';
  date: string;
  holes: string;
  grossScore: string;
  position: string;
  fieldSize: string;
  countsTowardHandicap: boolean;
  notes: string;
}

const emptyForm = (defaultJuniorId?: number): FormState => ({
  juniorId: defaultJuniorId ?? '',
  eventName: '',
  eventType: '',
  date: '',
  holes: '',
  grossScore: '',
  position: '',
  fieldSize: '',
  countsTowardHandicap: false,
  notes: '',
});

// Required: junior, event_name, event_type, date. Returns a field-keyed error
// map (empty = valid).
function validate(form: FormState): Partial<Record<keyof FormState, string>> {
  const errors: Partial<Record<keyof FormState, string>> = {};
  if (form.juniorId === '') errors.juniorId = 'Pick a junior.';
  if (form.eventName.trim() === '') errors.eventName = 'Event name is required.';
  if (form.eventType === '') errors.eventType = 'Pick an event type.';
  if (form.date.trim() === '') errors.date = 'Date is required.';
  return errors;
}

// Build the API payload from a validated form (juniorId/eventType guaranteed set).
function toPayload(form: FormState): LogExternalResultInput {
  return {
    junior_id: form.juniorId as number,
    event_name: form.eventName.trim(),
    event_type: form.eventType as ExternalEventType,
    date: form.date,
    holes: numOrUndef(form.holes),
    gross_score: numOrUndef(form.grossScore),
    position: numOrUndef(form.position),
    field_size: numOrUndef(form.fieldSize),
    counts_toward_handicap: form.countsTowardHandicap,
    notes: form.notes.trim() === '' ? undefined : form.notes.trim(),
  };
}

function FormFields({
  form,
  errors,
  onChange,
  juniors,
  juniorsLoading,
  disabled,
  lockJunior,
}: {
  form: FormState;
  errors: Partial<Record<keyof FormState, string>>;
  onChange: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
  juniors: JuniorWithName[];
  juniorsLoading: boolean;
  disabled: boolean;
  lockJunior?: string; // when set, junior is fixed (edit mode) — show as text
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        {/* Junior */}
        <div>
          <label className={labelClass} htmlFor="ext-junior">
            Junior
          </label>
          {lockJunior != null ? (
            <p className="mt-1.5 rounded-xl bg-white/5 px-4 py-3 text-sm font-semibold text-silver">
              {lockJunior}
            </p>
          ) : (
            <select
              id="ext-junior"
              className={inputClass + ' mt-1.5'}
              value={form.juniorId}
              onChange={(e) =>
                onChange('juniorId', e.target.value === '' ? '' : Number(e.target.value))
              }
              disabled={disabled || juniorsLoading}
              data-testid="form-junior"
            >
              <option value="">{juniorsLoading ? 'Loading…' : 'Select a junior'}</option>
              {juniors.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.full_name?.trim() || `Golfer #${j.id}`}
                </option>
              ))}
            </select>
          )}
          {errors.juniorId ? (
            <p className="mt-1 text-xs font-semibold text-red-400" role="alert">
              {errors.juniorId}
            </p>
          ) : null}
        </div>

        {/* Event name */}
        <div>
          <label className={labelClass} htmlFor="ext-name">
            Event name
          </label>
          <input
            id="ext-name"
            className={inputClass + ' mt-1.5'}
            value={form.eventName}
            onChange={(e) => onChange('eventName', e.target.value)}
            placeholder="e.g. Faldo Series Kenya"
            disabled={disabled}
            data-testid="form-event-name"
          />
          {errors.eventName ? (
            <p className="mt-1 text-xs font-semibold text-red-400" role="alert">
              {errors.eventName}
            </p>
          ) : null}
        </div>

        {/* Event type */}
        <div>
          <label className={labelClass} htmlFor="ext-type">
            Event type
          </label>
          <select
            id="ext-type"
            className={inputClass + ' mt-1.5'}
            value={form.eventType}
            onChange={(e) =>
              onChange('eventType', e.target.value as ExternalEventType | '')
            }
            disabled={disabled}
            data-testid="form-event-type"
          >
            <option value="">Select a type</option>
            {EXTERNAL_EVENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {eventTypeLabel(t)}
              </option>
            ))}
          </select>
          {errors.eventType ? (
            <p className="mt-1 text-xs font-semibold text-red-400" role="alert">
              {errors.eventType}
            </p>
          ) : null}
        </div>

        {/* Date */}
        <div>
          <label className={labelClass} htmlFor="ext-date">
            Date
          </label>
          <input
            id="ext-date"
            type="date"
            className={inputClass + ' mt-1.5'}
            value={form.date}
            onChange={(e) => onChange('date', e.target.value)}
            disabled={disabled}
            data-testid="form-date"
          />
          {errors.date ? (
            <p className="mt-1 text-xs font-semibold text-red-400" role="alert">
              {errors.date}
            </p>
          ) : null}
        </div>

        {/* Holes */}
        <div>
          <label className={labelClass} htmlFor="ext-holes">
            Holes
          </label>
          <select
            id="ext-holes"
            className={inputClass + ' mt-1.5'}
            value={form.holes}
            onChange={(e) => onChange('holes', e.target.value)}
            disabled={disabled}
            data-testid="form-holes"
          >
            <option value="">—</option>
            <option value="9">9</option>
            <option value="18">18</option>
          </select>
        </div>

        {/* Gross */}
        <div>
          <label className={labelClass} htmlFor="ext-gross">
            Gross score
          </label>
          <input
            id="ext-gross"
            type="number"
            inputMode="numeric"
            min={1}
            className={inputClass + ' mt-1.5'}
            value={form.grossScore}
            onChange={(e) => onChange('grossScore', e.target.value)}
            disabled={disabled}
            data-testid="form-gross"
          />
        </div>

        {/* Position */}
        <div>
          <label className={labelClass} htmlFor="ext-position">
            Position
          </label>
          <input
            id="ext-position"
            type="number"
            inputMode="numeric"
            min={1}
            className={inputClass + ' mt-1.5'}
            value={form.position}
            onChange={(e) => onChange('position', e.target.value)}
            disabled={disabled}
            data-testid="form-position"
          />
        </div>

        {/* Field size */}
        <div>
          <label className={labelClass} htmlFor="ext-field">
            Field size
          </label>
          <input
            id="ext-field"
            type="number"
            inputMode="numeric"
            min={1}
            className={inputClass + ' mt-1.5'}
            value={form.fieldSize}
            onChange={(e) => onChange('fieldSize', e.target.value)}
            disabled={disabled}
            data-testid="form-field-size"
          />
        </div>
      </div>

      {/* Notes */}
      <div>
        <label className={labelClass} htmlFor="ext-notes">
          Notes
        </label>
        <textarea
          id="ext-notes"
          rows={2}
          className={inputClass + ' mt-1.5 resize-y'}
          value={form.notes}
          onChange={(e) => onChange('notes', e.target.value)}
          disabled={disabled}
          data-testid="form-notes"
        />
      </div>

      {/* Counts toward handicap */}
      <label className="flex items-center gap-3 text-sm text-silver">
        <input
          type="checkbox"
          className="h-5 w-5 rounded border-white/20 bg-white/5 accent-azure"
          checked={form.countsTowardHandicap}
          onChange={(e) => onChange('countsTowardHandicap', e.target.checked)}
          disabled={disabled}
          data-testid="form-counts-handicap"
        />
        Counts toward handicap
      </label>
    </div>
  );
}

// ── Log (create) form ─────────────────────────────────────────────────────────

function LogForm({
  names,
  defaultJuniorId,
}: {
  names: ReturnType<typeof useJuniorNames>;
  defaultJuniorId?: number;
}) {
  const log = useLogExternalResult();
  const [form, setForm] = useState<FormState>(() => emptyForm(defaultJuniorId));
  const [errors, setErrors] = useState<
    Partial<Record<keyof FormState, string>>
  >({});

  const change = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const submit = () => {
    const found = validate(form);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    log.mutate(toPayload(form), {
      onSuccess: () => {
        setForm(emptyForm(defaultJuniorId));
        setErrors({});
      },
    });
  };

  return (
    <GlassCard className="overflow-hidden" data-testid="external-log-form">
      <div className="flex items-center gap-2 border-b border-white/5 px-5 py-4">
        <Plus className="h-4 w-4 text-azure" aria-hidden />
        <h2 className="text-sm font-bold uppercase tracking-widest text-azure">
          Log external result
        </h2>
      </div>
      <div className="px-5 py-5">
        <FormFields
          form={form}
          errors={errors}
          onChange={change}
          juniors={names.juniors}
          juniorsLoading={names.isLoading}
          disabled={log.isPending}
        />

        {names.isError ? (
          <p className="mt-4 rounded-xl bg-amber-500/10 p-3 text-xs text-gold">
            Couldn&apos;t load the junior list — try refreshing the page.
          </p>
        ) : null}

        {log.isError ? (
          <p
            role="alert"
            className="mt-4 rounded-xl bg-red-500/15 p-3 text-sm text-red-400"
            data-testid="external-log-error"
          >
            {errorMessage(log.error, 'Could not log this result.')}
          </p>
        ) : null}

        {log.isSuccess ? (
          <p
            className="mt-4 rounded-xl bg-emerald-500/10 p-3 text-sm font-semibold text-emerald-300"
            data-testid="external-log-success"
          >
            Result logged.
          </p>
        ) : null}

        <div className="mt-5">
          <Button
            size="md"
            onClick={submit}
            disabled={log.isPending}
            data-testid="external-log-submit"
          >
            {log.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Save className="h-4 w-4" aria-hidden />
            )}
            Log result
          </Button>
        </div>
      </div>
    </GlassCard>
  );
}

// ── Edit (inline) form ────────────────────────────────────────────────────────

function fromResult(r: ExternalResult): FormState {
  return {
    juniorId: r.junior_id,
    eventName: r.event_name,
    eventType: r.event_type,
    date: r.date,
    holes: r.holes == null ? '' : String(r.holes),
    grossScore: r.gross_score == null ? '' : String(r.gross_score),
    position: r.position == null ? '' : String(r.position),
    fieldSize: r.field_size == null ? '' : String(r.field_size),
    countsTowardHandicap: r.counts_toward_handicap,
    notes: r.notes ?? '',
  };
}

function EditForm({
  result,
  juniorName,
  onDone,
}: {
  result: ExternalResult;
  juniorName: string;
  onDone: () => void;
}) {
  const update = useUpdateExternalResult();
  const [form, setForm] = useState<FormState>(() => fromResult(result));
  const [errors, setErrors] = useState<
    Partial<Record<keyof FormState, string>>
  >({});

  const change = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const submit = () => {
    const found = validate(form);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    // junior_id stays fixed; send the rest. Optionals cleared to "" go as null so
    // the backend clears a previously-set value.
    const payload = toPayload(form);
    update.mutate(
      {
        id: result.id,
        body: {
          ...payload,
          holes: payload.holes ?? null,
          gross_score: payload.gross_score ?? null,
          position: payload.position ?? null,
          field_size: payload.field_size ?? null,
          notes: payload.notes ?? null,
        },
      },
      { onSuccess: () => onDone() },
    );
  };

  return (
    <div data-testid={`external-edit-form-${result.id}`}>
      <FormFields
        form={form}
        errors={errors}
        onChange={change}
        juniors={[]}
        juniorsLoading={false}
        disabled={update.isPending}
        lockJunior={juniorName}
      />

      {update.isError ? (
        <p
          role="alert"
          className="mt-4 rounded-xl bg-red-500/15 p-3 text-sm text-red-400"
        >
          {errorMessage(update.error, 'Could not save changes.')}
        </p>
      ) : null}

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          onClick={submit}
          disabled={update.isPending}
          data-testid={`external-save-${result.id}`}
        >
          {update.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Save className="h-4 w-4" aria-hidden />
          )}
          Save changes
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onDone}
          disabled={update.isPending}
        >
          <X className="h-4 w-4" aria-hidden />
          Cancel
        </Button>
      </div>
    </div>
  );
}
