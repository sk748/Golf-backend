// HandicapJourneyEditor — coach/admin controls to update the journey record.
// Roles: admin (any junior), coach (must own the junior — backend enforces).
// The wiring wave places this component inside RequireRole(['admin','coach']).

import { useEffect, useState } from 'react';
import { GlassCard } from '../../components/ui/GlassCard';
import { Button } from '../../components/ui/Button';
import { ApiError } from '../../lib/api';
import {
  useHandicapJourney,
  useUpdateHandicapJourney,
  type HandicapJourneyStatus,
} from './handicap.queries';

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_OPTIONS: { value: HandicapJourneyStatus; label: string }[] = [
  { value: 'not_started', label: 'Not started' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'cards_submitted', label: 'Cards submitted' },
  { value: 'attained', label: 'Handicap attained' },
];

// ── Main export ───────────────────────────────────────────────────────────────

interface HandicapJourneyEditorProps {
  juniorId: number;
}

export function HandicapJourneyEditor({ juniorId }: HandicapJourneyEditorProps) {
  const { data: journey, isLoading } = useHandicapJourney(juniorId);
  const mutation = useUpdateHandicapJourney(juniorId);

  // Local form state — initialised from server once loaded.
  const [status, setStatus] = useState<HandicapJourneyStatus>('not_started');
  const [targetCards, setTargetCards] = useState<string>('5');
  const [notes, setNotes] = useState<string>('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Sync form from server whenever journey loads/refreshes.
  useEffect(() => {
    if (!journey) return;
    setStatus(journey.status);
    setTargetCards(String(journey.target_signed_cards ?? 5));
    setNotes(journey.coach_notes ?? '');
    setFieldErrors({});
  }, [journey]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFieldErrors({});

    const parsed = parseInt(targetCards, 10);
    if (!Number.isFinite(parsed) || parsed < 1) {
      setFieldErrors({ target_signed_cards: 'Must be a whole number of 1 or more.' });
      return;
    }

    mutation.mutate(
      { status, target_signed_cards: parsed, coach_notes: notes || undefined },
      {
        onError(err) {
          if (err instanceof ApiError && err.fields) {
            // Surface backend field-level errors inline.
            const mapped: Record<string, string> = {};
            for (const [k, msgs] of Object.entries(err.fields)) {
              mapped[k] = Array.isArray(msgs) ? msgs.join(' ') : String(msgs);
            }
            setFieldErrors(mapped);
          }
        },
      },
    );
  }

  // ── Loading skeleton ──
  if (isLoading) {
    return (
      <GlassCard tone="light" className="animate-pulse p-5">
        <div className="mb-3 h-4 w-32 rounded bg-white/10" />
        <div className="h-10 w-full rounded bg-white/10" />
      </GlassCard>
    );
  }

  const isSaving = mutation.isPending;
  const saveSuccess = mutation.isSuccess;

  // Top-level (non-field) error message.
  const topError =
    mutation.isError && !(mutation.error instanceof ApiError && mutation.error.fields)
      ? (mutation.error as Error)?.message ?? 'Save failed.'
      : null;

  return (
    <GlassCard tone="light" className="p-5">
      <h3 className="mb-4 font-bold text-silver">Edit Handicap Journey</h3>

      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        {/* Status */}
        <div>
          <label
            htmlFor="hj-status"
            className="mb-1 block text-sm font-semibold text-silver"
          >
            Status
          </label>
          <select
            id="hj-status"
            value={status}
            onChange={(e) => setStatus(e.target.value as HandicapJourneyStatus)}
            disabled={isSaving}
            className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-silver focus:border-azure focus:outline-none disabled:opacity-50"
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value} className="bg-navy text-silver">
                {opt.label}
              </option>
            ))}
          </select>
          {fieldErrors.status && (
            <p className="mt-1 text-xs text-red-400">{fieldErrors.status}</p>
          )}
        </div>

        {/* Target signed cards */}
        <div>
          <label
            htmlFor="hj-target-cards"
            className="mb-1 block text-sm font-semibold text-silver"
          >
            Target signed cards
          </label>
          <input
            id="hj-target-cards"
            type="number"
            min={1}
            step={1}
            value={targetCards}
            onChange={(e) => setTargetCards(e.target.value)}
            disabled={isSaving}
            className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-silver placeholder:text-slate focus:border-azure focus:outline-none disabled:opacity-50"
            aria-describedby={fieldErrors.target_signed_cards ? 'hj-target-err' : undefined}
          />
          {fieldErrors.target_signed_cards && (
            <p id="hj-target-err" className="mt-1 text-xs text-red-400">
              {fieldErrors.target_signed_cards}
            </p>
          )}
        </div>

        {/* Coach notes */}
        <div>
          <label
            htmlFor="hj-notes"
            className="mb-1 block text-sm font-semibold text-silver"
          >
            Coach notes{' '}
            <span className="font-normal text-slate">(optional)</span>
          </label>
          <textarea
            id="hj-notes"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={isSaving}
            placeholder="Progress notes visible to the junior and parent…"
            className="w-full resize-none rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-silver placeholder:text-slate focus:border-azure focus:outline-none disabled:opacity-50"
            aria-describedby={fieldErrors.coach_notes ? 'hj-notes-err' : undefined}
          />
          {fieldErrors.coach_notes && (
            <p id="hj-notes-err" className="mt-1 text-xs text-red-400">
              {fieldErrors.coach_notes}
            </p>
          )}
        </div>

        {/* Top-level error */}
        {topError && (
          <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">
            {topError}
          </p>
        )}

        {/* Save confirmation */}
        {saveSuccess && !isSaving && (
          <p className="rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-400">
            Saved successfully.
          </p>
        )}

        <Button
          type="submit"
          variant="primary"
          size="sm"
          fullWidth
          disabled={isSaving}
        >
          {isSaving ? 'Saving…' : 'Save changes'}
        </Button>
      </form>
    </GlassCard>
  );
}
