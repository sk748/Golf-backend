// Shared "Set handicap" dialog — used by both JuniorsBrowserPage (per-row
// action) and JuniorProfilePage (inline control). Staff-only (admin / coach /
// committee). Renders through a portal; Escape and the backdrop both close.
//
// Props:
//   open         — whether the dialog is visible
//   onClose      — called to dismiss (no action)
//   juniorName   — displayed in the heading
//   userId       — the junior's user_id (PUT /api/users/:userId/handicap)
//   currentValue — current handicap_index for pre-filling the input (may be null)
//
// On success the mutation invalidates all relevant cache keys (see
// handicap.queries.ts) and onClose() is called automatically.

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, X } from 'lucide-react';

import { ApiError } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { useSetHandicap } from './handicap.queries';

interface SetHandicapDialogProps {
  open: boolean;
  onClose: () => void;
  juniorName: string;
  userId: string;
  currentValue: number | null;
}

export function SetHandicapDialog({
  open,
  onClose,
  juniorName,
  userId,
  currentValue,
}: SetHandicapDialogProps) {
  const mutation = useSetHandicap();
  const inputRef = useRef<HTMLInputElement>(null);

  // Local form state — reset to the current value each time the dialog opens.
  const [value, setValue] = useState<string>(
    currentValue != null ? String(currentValue) : '',
  );
  const [clientError, setClientError] = useState<string | null>(null);

  // Sync the input when dialog opens with a (possibly updated) currentValue.
  useEffect(() => {
    if (open) {
      setValue(currentValue != null ? String(currentValue) : '');
      setClientError(null);
      mutation.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Focus input when dialog opens.
  useEffect(() => {
    if (open) {
      // Defer one frame so the dialog is in the DOM.
      const id = window.setTimeout(() => inputRef.current?.focus(), 50);
      return () => window.clearTimeout(id);
    }
  }, [open]);

  // Escape key closes.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !mutation.isPending) onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, mutation.isPending, onClose]);

  if (!open) return null;

  const handleSubmit = () => {
    setClientError(null);
    const trimmed = value.trim();

    // "Clear" path — empty input = set to null.
    const handicap_index = trimmed === '' ? null : Number(trimmed);
    if (trimmed !== '' && Number.isNaN(handicap_index)) {
      setClientError('Please enter a valid number (e.g. 18.4).');
      return;
    }
    if (handicap_index != null && (handicap_index < -10 || handicap_index > 54)) {
      setClientError('Handicap index must be between -10.0 and 54.0.');
      return;
    }

    mutation.mutate(
      { userId, handicap_index },
      {
        onSuccess: () => {
          onClose();
        },
      },
    );
  };

  const serverError =
    mutation.isError
      ? mutation.error instanceof ApiError
        ? mutation.error.message
        : 'Something went wrong. Please try again.'
      : null;

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="set-handicap-dialog-title"
      data-testid="set-handicap-dialog"
    >
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close dialog"
        className="absolute inset-0 cursor-default bg-black/60 backdrop-blur-sm"
        onClick={() => !mutation.isPending && onClose()}
      />

      {/* Panel */}
      <div className="relative w-full max-w-sm rounded-2xl border border-white/10 bg-navy p-6 shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2
              id="set-handicap-dialog-title"
              className="text-base font-bold text-silver"
            >
              Set handicap
            </h2>
            <p className="mt-0.5 text-sm text-slate">{juniorName}</p>
          </div>
          <button
            type="button"
            onClick={() => !mutation.isPending && onClose()}
            disabled={mutation.isPending}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate transition hover:bg-white/10 hover:text-silver focus:outline-none focus-visible:ring-2 focus-visible:ring-azure/50"
            data-testid="set-handicap-dialog-close"
          >
            <X size={16} aria-hidden />
          </button>
        </div>

        {/* Input */}
        <div className="mt-5">
          <label
            htmlFor="handicap-index-input"
            className="block text-sm font-semibold text-silver"
          >
            Handicap index
          </label>
          <p className="mt-0.5 text-xs text-slate">
            Enter a value between -10.0 and 54.0, or leave blank to clear.
          </p>
          <input
            ref={inputRef}
            id="handicap-index-input"
            type="number"
            step={0.1}
            min={-10}
            max={54}
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setClientError(null);
            }}
            placeholder="e.g. 18.4"
            disabled={mutation.isPending}
            className="mt-2 w-full rounded-xl bg-white/5 px-4 py-3 text-sm text-silver placeholder:text-slate/60 outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-azure/60 disabled:opacity-50"
            data-testid="set-handicap-input"
            aria-describedby={
              clientError || serverError ? 'set-handicap-error' : undefined
            }
          />
        </div>

        {/* Errors */}
        {(clientError ?? serverError) ? (
          <p
            id="set-handicap-error"
            role="alert"
            className="mt-3 rounded-xl bg-red-500/15 px-3 py-2.5 text-sm text-red-400"
            data-testid="set-handicap-error"
          >
            {clientError ?? serverError}
          </p>
        ) : null}

        {/* Actions */}
        <div className="mt-5 flex justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            disabled={mutation.isPending}
            data-testid="set-handicap-cancel"
          >
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={mutation.isPending}
            data-testid="set-handicap-submit"
          >
            {mutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : null}
            {mutation.isPending ? 'Saving…' : value.trim() === '' ? 'Clear handicap' : 'Save'}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
