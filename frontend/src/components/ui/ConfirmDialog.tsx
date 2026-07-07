import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle } from 'lucide-react';

import { Button } from './Button';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Use the danger style for destructive actions (delete, etc.). */
  destructive?: boolean;
  /** Disables the confirm button + shows a pending label (e.g. mid-mutation). */
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

// Shared confirm step for irreversible / notable actions (post, edit, delete).
// Renders through a portal so it sits above any page chrome; Escape and the
// backdrop both cancel. Focus lands on the confirm button for keyboard users.
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !busy) onCancel();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, busy, onCancel]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <button
        type="button"
        aria-label={cancelLabel}
        className="absolute inset-0 cursor-default bg-black/60 backdrop-blur-sm"
        onClick={() => !busy && onCancel()}
      />
      <div className="relative w-full max-w-sm rounded-2xl border border-white/10 bg-navy p-6 shadow-2xl">
        <div className="flex items-start gap-3">
          {destructive && (
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-500/15 text-red-400">
              <AlertTriangle size={18} />
            </span>
          )}
          <div className="min-w-0">
            <h2 className="text-base font-bold text-silver">{title}</h2>
            <div className="mt-1 text-sm text-slate">{message}</div>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button
            variant={destructive ? 'danger' : 'primary'}
            size="sm"
            onClick={onConfirm}
            disabled={busy}
            data-testid="confirm-dialog-confirm"
            autoFocus
          >
            {busy ? 'Working…' : confirmLabel}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
