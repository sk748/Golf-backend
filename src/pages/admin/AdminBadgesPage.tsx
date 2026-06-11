// Admin CRUD page for the staff Badge catalog.
//
// Admins manage the catalog of badge definitions here (e.g. "Most Improved",
// "Sportsmanship"). Awarding badges to individual juniors happens on the
// junior profile page — this page is the catalog only.
//
// Route: /admin/badges (wired by the caller — not touched here).
// Access: admin only (RequireRole enforced at the route level).

import { useState, type FormEvent } from 'react';
import {
  AlertCircle,
  Award,
  CheckCircle2,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react';

import { ApiError } from '../../lib/api';
import { cn } from '../../lib/cn';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { GlassCard } from '../../components/ui/GlassCard';
import { fieldClass, labelClass } from '../auth/AuthShell';
import {
  useBadges,
  useCreateBadge,
  useDeleteBadge,
  useUpdateBadge,
  type Badge,
  type BadgeInput,
} from '../../features/badges/badges.queries';

// ── Helpers ───────────────────────────────────────────────────────────────────

function errMsg(err: unknown, fallback: string): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return fallback;
}

// ── Form shape ────────────────────────────────────────────────────────────────

interface BadgeFormValues {
  name: string;
  description: string;
  level_required: string; // empty string = not set
}

const EMPTY_FORM: BadgeFormValues = {
  name: '',
  description: '',
  level_required: '',
};

function badgeToForm(b: Badge): BadgeFormValues {
  return {
    name: b.name,
    description: b.description ?? '',
    level_required: b.level_required != null ? String(b.level_required) : '',
  };
}

function validateForm(f: BadgeFormValues): string | null {
  if (!f.name.trim()) return 'Badge name is required.';
  if (f.name.trim().length > 120) return 'Badge name must be 120 characters or fewer.';
  if (f.level_required !== '') {
    const n = parseInt(f.level_required, 10);
    if (isNaN(n) || n < 1 || n > 9) {
      return 'Level requirement must be a whole number between 1 and 9.';
    }
  }
  return null;
}

function formToPayload(f: BadgeFormValues): BadgeInput {
  return {
    name: f.name.trim(),
    description: f.description.trim() || null,
    level_required:
      f.level_required !== '' ? parseInt(f.level_required, 10) : null,
  };
}

// ── Eligibility label ─────────────────────────────────────────────────────────

function LevelPill({ level }: { level: number | null }) {
  if (level == null) {
    return (
      <span className="inline-flex items-center rounded-full bg-white/5 px-2.5 py-0.5 text-xs font-semibold text-slate">
        Any level
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-azure/15 px-2.5 py-0.5 text-xs font-semibold text-azure">
      Level {level}+
    </span>
  );
}

// ── Shared form fields ────────────────────────────────────────────────────────

interface BadgeFormFieldsProps {
  idPrefix: string;
  form: BadgeFormValues;
  setForm: React.Dispatch<React.SetStateAction<BadgeFormValues>>;
}

function BadgeFormFields({ idPrefix, form, setForm }: BadgeFormFieldsProps) {
  function set(key: keyof BadgeFormValues) {
    return (
      e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) => setForm((f) => ({ ...f, [key]: e.target.value }));
  }

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor={`${idPrefix}-name`} className={labelClass}>
          Badge name <span className="text-red-400" aria-hidden>*</span>
        </label>
        <input
          id={`${idPrefix}-name`}
          type="text"
          required
          maxLength={120}
          placeholder="e.g. Most Improved, Sportsmanship"
          value={form.name}
          onChange={set('name')}
          className={fieldClass}
        />
      </div>

      <div>
        <label htmlFor={`${idPrefix}-description`} className={labelClass}>
          Description{' '}
          <span className="text-slate/60 font-normal">(optional)</span>
        </label>
        <textarea
          id={`${idPrefix}-description`}
          rows={3}
          placeholder="What this badge recognises…"
          value={form.description}
          onChange={set('description')}
          className={cn(fieldClass, 'resize-none')}
        />
      </div>

      <div className="max-w-[12rem]">
        <label htmlFor={`${idPrefix}-level`} className={labelClass}>
          Minimum level{' '}
          <span className="text-slate/60 font-normal">(optional, 1–9)</span>
        </label>
        <input
          id={`${idPrefix}-level`}
          type="number"
          min={1}
          max={9}
          inputMode="numeric"
          placeholder="Any"
          value={form.level_required}
          onChange={set('level_required')}
          className={fieldClass}
        />
        <p className="mt-1 text-xs text-slate">
          Leave blank if the badge can be awarded to any level.
        </p>
      </div>
    </div>
  );
}

// ── Create panel ──────────────────────────────────────────────────────────────

function CreatePanel({ onClose }: { onClose: () => void }) {
  const create = useCreateBadge();
  const [form, setForm] = useState<BadgeFormValues>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const err = validateForm(form);
    if (err) {
      setFormError(err);
      return;
    }
    create.mutate(formToPayload(form), {
      onSuccess: () => {
        setSuccess(true);
        setForm(EMPTY_FORM);
        window.setTimeout(onClose, 900);
      },
      onError: (err) => {
        setFormError(errMsg(err, 'Could not create badge. Please try again.'));
      },
    });
  }

  return (
    <GlassCard className="mt-5 p-5 sm:p-6" data-testid="create-badge-panel">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-bold text-silver">New badge</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close create form"
          className="rounded-lg p-1.5 text-slate transition-colors hover:bg-white/5 hover:text-silver focus:outline-none focus-visible:ring-2 focus-visible:ring-azure/50"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>

      <form onSubmit={onSubmit} noValidate>
        {formError && (
          <p
            role="alert"
            className="mb-4 flex items-center gap-2 rounded-xl bg-red-500/15 px-3 py-2 text-sm text-red-400"
          >
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
            {formError}
          </p>
        )}
        {success && (
          <p
            role="status"
            className="mb-4 flex items-center gap-2 rounded-xl bg-emerald-500/15 px-3 py-2 text-sm text-emerald-400"
          >
            <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
            Badge created
          </p>
        )}

        <BadgeFormFields idPrefix="create" form={form} setForm={setForm} />

        <div className="mt-5 flex items-center gap-3">
          <Button
            type="submit"
            variant="primary"
            size="sm"
            disabled={create.isPending}
            data-testid="create-badge-submit"
          >
            {create.isPending && (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            )}
            {create.isPending ? 'Saving…' : 'Create badge'}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClose}
            disabled={create.isPending}
          >
            Cancel
          </Button>
        </div>
      </form>
    </GlassCard>
  );
}

// ── Inline edit panel (expands below the row) ─────────────────────────────────

function EditPanel({
  badge,
  onClose,
}: {
  badge: Badge;
  onClose: () => void;
}) {
  const update = useUpdateBadge();
  const [form, setForm] = useState<BadgeFormValues>(badgeToForm(badge));
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const err = validateForm(form);
    if (err) {
      setFormError(err);
      return;
    }
    update.mutate(
      { id: badge.id, ...formToPayload(form) },
      {
        onSuccess: () => {
          setSuccess(true);
          window.setTimeout(onClose, 700);
        },
        onError: (err) => {
          setFormError(errMsg(err, 'Could not save changes. Please try again.'));
        },
      },
    );
  }

  return (
    <td
      colSpan={4}
      className="bg-white/[0.02] px-5 py-5"
      data-testid={`edit-panel-${badge.id}`}
    >
      <form onSubmit={onSubmit} noValidate>
        {formError && (
          <p
            role="alert"
            className="mb-4 flex items-center gap-2 rounded-xl bg-red-500/15 px-3 py-2 text-sm text-red-400"
          >
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
            {formError}
          </p>
        )}
        {success && (
          <p
            role="status"
            className="mb-4 flex items-center gap-2 rounded-xl bg-emerald-500/15 px-3 py-2 text-sm text-emerald-400"
          >
            <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
            Saved
          </p>
        )}

        <BadgeFormFields
          idPrefix={`edit-${badge.id}`}
          form={form}
          setForm={setForm}
        />

        <div className="mt-5 flex items-center gap-3">
          <Button
            type="submit"
            variant="primary"
            size="sm"
            disabled={update.isPending}
            data-testid={`save-badge-${badge.id}`}
          >
            {update.isPending && (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            )}
            {update.isPending ? 'Saving…' : 'Save changes'}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClose}
            disabled={update.isPending}
          >
            Cancel
          </Button>
        </div>
      </form>
    </td>
  );
}

// ── Table row ─────────────────────────────────────────────────────────────────

function BadgeRow({
  badge,
  isEditing,
  onEdit,
  onEditClose,
}: {
  badge: Badge;
  isEditing: boolean;
  onEdit: () => void;
  onEditClose: () => void;
}) {
  const deleteMutation = useDeleteBadge();
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <>
      <tr
        className={cn(
          'border-t border-white/5 transition-colors',
          isEditing ? 'bg-azure/[0.05]' : 'hover:bg-white/[0.03]',
        )}
        data-testid={`badge-row-${badge.id}`}
      >
        {/* Name */}
        <td className="px-5 py-3.5 font-semibold text-silver">
          {badge.name}
        </td>

        {/* Description */}
        <td className="px-5 py-3.5 text-sm text-slate">
          {badge.description ? (
            <span className="line-clamp-2">{badge.description}</span>
          ) : (
            <span className="italic text-slate/50">No description</span>
          )}
        </td>

        {/* Level requirement */}
        <td className="px-5 py-3.5">
          <LevelPill level={badge.level_required} />
        </td>

        {/* Actions */}
        <td className="px-5 py-3.5">
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={isEditing ? onEditClose : onEdit}
              aria-label={
                isEditing
                  ? `Cancel editing "${badge.name}"`
                  : `Edit "${badge.name}"`
              }
              data-testid={`edit-badge-${badge.id}`}
            >
              {isEditing ? (
                <X className="h-4 w-4" aria-hidden />
              ) : (
                <Pencil className="h-4 w-4" aria-hidden />
              )}
              <span className="hidden sm:inline">
                {isEditing ? 'Cancel' : 'Edit'}
              </span>
            </Button>

            <Button
              variant="danger"
              size="sm"
              onClick={() => setConfirmDelete(true)}
              aria-label={`Delete "${badge.name}"`}
              disabled={deleteMutation.isPending}
              data-testid={`delete-badge-${badge.id}`}
            >
              {deleteMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Trash2 className="h-4 w-4" aria-hidden />
              )}
              <span className="hidden sm:inline">Delete</span>
            </Button>
          </div>

          {deleteMutation.isError && (
            <p className="mt-1 text-right text-xs text-red-400" role="alert">
              {errMsg(deleteMutation.error, 'Delete failed.')}
            </p>
          )}
        </td>
      </tr>

      {/* Inline edit form */}
      {isEditing && (
        <tr
          className="border-t border-azure/20"
          data-testid={`edit-row-${badge.id}`}
        >
          <EditPanel badge={badge} onClose={onEditClose} />
        </tr>
      )}

      {/* Delete confirmation */}
      <ConfirmDialog
        open={confirmDelete}
        title="Delete badge"
        message={
          <>
            Permanently delete the{' '}
            <strong className="text-silver">"{badge.name}"</strong> badge? This
            cannot be undone. Existing awards on junior profiles will also be
            removed.
          </>
        }
        confirmLabel="Delete"
        destructive
        busy={deleteMutation.isPending}
        onConfirm={() =>
          deleteMutation.mutate(badge.id, {
            onSuccess: () => setConfirmDelete(false),
            onError: () => setConfirmDelete(false),
          })
        }
        onCancel={() => setConfirmDelete(false)}
      />
    </>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function AdminBadgesPage() {
  const { data: badges, isLoading, isError, error } = useBadges();

  const [editingId, setEditingId] = useState<number | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const sorted = [...(badges ?? [])].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="mx-auto max-w-5xl animate-fade-in-up">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-azure">
            Programme settings
          </p>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-black text-silver">
            <Award className="h-6 w-6 text-gold" aria-hidden />
            Badge catalog
          </h1>
          <p className="mt-1 text-sm text-slate">
            Recognition badges that staff can award to juniors. Manage
            definitions here; awarding happens on each junior's profile.
          </p>
        </div>
        <Button
          variant="primary"
          size="sm"
          onClick={() => {
            setShowCreate((v) => !v);
            setEditingId(null);
          }}
          aria-expanded={showCreate}
          data-testid="open-create-badge"
        >
          <Plus className="h-4 w-4" aria-hidden />
          New badge
        </Button>
      </div>

      {/* Create panel */}
      {showCreate && (
        <CreatePanel onClose={() => setShowCreate(false)} />
      )}

      {/* List area */}
      <div className="mt-6">
        {isLoading ? (
          <div
            className="flex items-center justify-center gap-3 py-16 text-slate"
            data-testid="badges-loading"
          >
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
            <span>Loading badges…</span>
          </div>
        ) : isError ? (
          <GlassCard
            className="border border-red-500/30 bg-red-500/10 p-5"
            role="alert"
            data-testid="badges-error"
          >
            <div className="flex items-center gap-3 text-red-400">
              <AlertCircle className="h-5 w-5 shrink-0" aria-hidden />
              <span className="text-sm font-semibold">
                {errMsg(error, 'Could not load badges. Please try again.')}
              </span>
            </div>
          </GlassCard>
        ) : sorted.length === 0 ? (
          <GlassCard
            className="p-12 text-center"
            data-testid="badges-empty"
          >
            <Award
              className="mx-auto mb-4 h-10 w-10 text-gold/50"
              aria-hidden
            />
            <p className="font-semibold text-silver">No badges yet</p>
            <p className="mt-1 text-sm text-slate">
              Create your first recognition badge to start celebrating junior
              achievements.
            </p>
            <Button
              variant="primary"
              size="sm"
              className="mt-5"
              onClick={() => setShowCreate(true)}
              data-testid="empty-create-badge"
            >
              <Plus className="h-4 w-4" aria-hidden />
              Create first badge
            </Button>
          </GlassCard>
        ) : (
          <GlassCard className="overflow-hidden">
            <div className="overflow-x-auto">
              <table
                className="w-full min-w-[36rem] text-left text-sm"
                aria-label="Badge catalog"
              >
                <thead>
                  <tr className="border-b border-white/10 text-[11px] uppercase tracking-wider text-slate">
                    <th scope="col" className="px-5 py-3 font-semibold">
                      Badge name
                    </th>
                    <th scope="col" className="px-5 py-3 font-semibold">
                      Description
                    </th>
                    <th scope="col" className="px-5 py-3 font-semibold">
                      Eligibility
                    </th>
                    <th scope="col" className="px-5 py-3 text-right font-semibold">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((b) => (
                    <BadgeRow
                      key={b.id}
                      badge={b}
                      isEditing={editingId === b.id}
                      onEdit={() => {
                        setEditingId(b.id);
                        setShowCreate(false);
                      }}
                      onEditClose={() => setEditingId(null)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </GlassCard>
        )}
      </div>

      <p className="mt-3 text-xs text-slate/60">
        {sorted.length > 0 && `${sorted.length} badge${sorted.length === 1 ? '' : 's'} in catalog. `}
        Badges are visible across all staff roles; only admins can manage the catalog.
      </p>
    </div>
  );
}
