// LogExternalResultCard — a compact, collapsible form a PARENT uses to log
// their child's result from an outside event (Faldo Series, US Kids, JGF, …).
// Parent-logged results are created UNVERIFIED server-side; a coach/admin must
// verify them before they count toward competitions-played / best-gross stats —
// the success message says exactly that.
//
// Privacy: takes the juniorId from the parent-scoped children data already on
// the page — it fetches NO club-wide lists. The backend additionally enforces
// own-child-only on the POST. No counts_toward_handicap control here: parents
// don't set that (staff-only concern), so the field is simply omitted.

import { useState } from 'react';
import { ChevronDown, Loader2, PlusCircle, Send } from 'lucide-react';

import { ApiError } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { GlassCard } from '../../components/ui/GlassCard';
import { cn } from '../../lib/cn';
import {
  EXTERNAL_EVENT_TYPES,
  eventTypeLabel,
  useLogExternalResult,
  type ExternalEventType,
  type LogExternalResultInput,
} from './tournament-external.queries';

const inputClass =
  'w-full rounded-xl bg-white/5 px-4 py-3 text-sm text-silver placeholder:text-slate/60 outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-azure/60 disabled:opacity-50';
const labelClass = 'block text-sm font-semibold text-silver';

// Local YYYY-MM-DD (not UTC) so "today" matches the user's calendar day.
function todayISO(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

// "" → undefined (omit from the payload); a valid number → number.
function numOrUndef(raw: string): number | undefined {
  if (raw.trim() === '') return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

interface FormState {
  eventName: string;
  eventType: ExternalEventType | '';
  date: string;
  holes: string;
  grossScore: string;
  position: string;
  fieldSize: string;
  notes: string;
}

const emptyForm: FormState = {
  eventName: '',
  eventType: '',
  date: '',
  holes: '',
  grossScore: '',
  position: '',
  fieldSize: '',
  notes: '',
};

type FormErrors = Partial<Record<keyof FormState, string>>;

// Required: event name, type, date; date must not be in the future (past events
// are fine — that's the point of a result log).
function validate(form: FormState): FormErrors {
  const errors: FormErrors = {};
  if (form.eventName.trim() === '') errors.eventName = 'Event name is required.';
  if (form.eventType === '') errors.eventType = 'Pick an event type.';
  if (form.date.trim() === '') {
    errors.date = 'Date is required.';
  } else if (form.date > todayISO()) {
    errors.date = 'The event date can’t be in the future.';
  }
  return errors;
}

export function LogExternalResultCard({
  juniorId,
  juniorName,
}: {
  juniorId: number;
  juniorName?: string;
}) {
  const log = useLogExternalResult();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [errors, setErrors] = useState<FormErrors>({});
  const [logged, setLogged] = useState(false);

  const change = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setLogged(false);
  };

  const submit = () => {
    const found = validate(form);
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    const body: LogExternalResultInput = {
      junior_id: juniorId,
      event_name: form.eventName.trim(),
      event_type: form.eventType as ExternalEventType,
      date: form.date,
      holes: numOrUndef(form.holes),
      gross_score: numOrUndef(form.grossScore),
      position: numOrUndef(form.position),
      field_size: numOrUndef(form.fieldSize),
      notes: form.notes.trim() === '' ? undefined : form.notes.trim(),
      // counts_toward_handicap deliberately omitted — staff decide that.
    };
    log.mutate(body, {
      onSuccess: () => {
        setForm(emptyForm);
        setErrors({});
        setLogged(true);
      },
    });
  };

  return (
    <GlassCard className="p-5 sm:p-6" data-testid="log-external-result-card">
      {/* Collapsible header */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="log-external-result-form"
        className="flex w-full items-center gap-2.5 rounded text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-azure/50"
        data-testid="log-external-toggle"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-azure/15">
          <PlusCircle size={16} className="text-azure" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold text-silver">
            Log an external result
          </span>
          <span className="block text-xs text-slate">
            Played {juniorName ? `${juniorName} ` : ''}in an outside event? Log it
            here — a coach will verify it.
          </span>
        </span>
        <ChevronDown
          size={18}
          className={cn('shrink-0 text-slate transition-transform', open && 'rotate-180')}
          aria-hidden
        />
      </button>

      {open ? (
        <div id="log-external-result-form" className="mt-5">
          <div className="grid gap-4 sm:grid-cols-2">
            {/* Event name */}
            <div>
              <label className={labelClass} htmlFor="parent-ext-name">
                Event name
              </label>
              <input
                id="parent-ext-name"
                className={inputClass + ' mt-1.5'}
                value={form.eventName}
                onChange={(e) => change('eventName', e.target.value)}
                placeholder="e.g. Faldo Series Kenya"
                disabled={log.isPending}
                data-testid="parent-ext-name"
              />
              {errors.eventName ? (
                <p className="mt-1 text-xs font-semibold text-red-400" role="alert">
                  {errors.eventName}
                </p>
              ) : null}
            </div>

            {/* Event type */}
            <div>
              <label className={labelClass} htmlFor="parent-ext-type">
                Event type
              </label>
              <select
                id="parent-ext-type"
                className={inputClass + ' mt-1.5'}
                value={form.eventType}
                onChange={(e) =>
                  change('eventType', e.target.value as ExternalEventType | '')
                }
                disabled={log.isPending}
                data-testid="parent-ext-type"
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
              <label className={labelClass} htmlFor="parent-ext-date">
                Date played
              </label>
              <input
                id="parent-ext-date"
                type="date"
                max={todayISO()}
                className={inputClass + ' mt-1.5'}
                value={form.date}
                onChange={(e) => change('date', e.target.value)}
                disabled={log.isPending}
                data-testid="parent-ext-date"
              />
              {errors.date ? (
                <p className="mt-1 text-xs font-semibold text-red-400" role="alert">
                  {errors.date}
                </p>
              ) : null}
            </div>

            {/* Holes */}
            <div>
              <label className={labelClass} htmlFor="parent-ext-holes">
                Holes
              </label>
              <select
                id="parent-ext-holes"
                className={inputClass + ' mt-1.5'}
                value={form.holes}
                onChange={(e) => change('holes', e.target.value)}
                disabled={log.isPending}
                data-testid="parent-ext-holes"
              >
                <option value="">—</option>
                <option value="9">9</option>
                <option value="18">18</option>
              </select>
            </div>

            {/* Gross score */}
            <div>
              <label className={labelClass} htmlFor="parent-ext-gross">
                Gross score
              </label>
              <input
                id="parent-ext-gross"
                type="number"
                inputMode="numeric"
                min={1}
                className={inputClass + ' mt-1.5'}
                value={form.grossScore}
                onChange={(e) => change('grossScore', e.target.value)}
                disabled={log.isPending}
                data-testid="parent-ext-gross"
              />
            </div>

            {/* Position */}
            <div>
              <label className={labelClass} htmlFor="parent-ext-position">
                Position
              </label>
              <input
                id="parent-ext-position"
                type="number"
                inputMode="numeric"
                min={1}
                className={inputClass + ' mt-1.5'}
                value={form.position}
                onChange={(e) => change('position', e.target.value)}
                disabled={log.isPending}
                data-testid="parent-ext-position"
              />
            </div>

            {/* Field size */}
            <div>
              <label className={labelClass} htmlFor="parent-ext-field">
                Field size
              </label>
              <input
                id="parent-ext-field"
                type="number"
                inputMode="numeric"
                min={1}
                className={inputClass + ' mt-1.5'}
                value={form.fieldSize}
                onChange={(e) => change('fieldSize', e.target.value)}
                disabled={log.isPending}
                data-testid="parent-ext-field"
              />
            </div>

            {/* Notes */}
            <div className="sm:col-span-2">
              <label className={labelClass} htmlFor="parent-ext-notes">
                Notes
              </label>
              <textarea
                id="parent-ext-notes"
                rows={2}
                className={inputClass + ' mt-1.5 resize-y'}
                value={form.notes}
                onChange={(e) => change('notes', e.target.value)}
                disabled={log.isPending}
                data-testid="parent-ext-notes"
              />
            </div>
          </div>

          {log.isError ? (
            <p
              role="alert"
              className="mt-4 rounded-xl bg-red-500/15 p-3 text-sm text-red-400"
              data-testid="parent-ext-error"
            >
              {log.error instanceof ApiError
                ? log.error.message
                : 'Could not log this result. Please try again.'}
            </p>
          ) : null}

          {logged ? (
            <p
              className="mt-4 rounded-xl bg-emerald-500/10 p-3 text-sm font-semibold text-emerald-300"
              data-testid="parent-ext-success"
            >
              Logged — a coach will verify it before it counts toward stats.
            </p>
          ) : null}

          <div className="mt-5">
            <Button
              size="md"
              onClick={submit}
              disabled={log.isPending}
              data-testid="parent-ext-submit"
            >
              {log.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Send className="h-4 w-4" aria-hidden />
              )}
              Log result
            </Button>
          </div>
        </div>
      ) : null}
    </GlassCard>
  );
}
