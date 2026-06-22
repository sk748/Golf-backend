// Admin CRUD page for Level Benchmark targets.
//
// Lists all benchmarks (currently L6/L7/L8 seeded by the backend), allows
// inline editing of an existing row, deletion with a confirm step, and
// creation of a new benchmark for any level that doesn't yet have one.
//
// Route: /admin/benchmarks (wired by the caller — not touched here).
// Access: admin only (RequireRole enforced at the route level).

import { useState, type FormEvent } from 'react';
import { AlertCircle, CheckCircle2, Loader2, Pencil, Plus, Trash2, X } from 'lucide-react';

import { ApiError } from '../../lib/api';
import { cn } from '../../lib/cn';
import type { LevelBenchmark } from '../../types/api';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { GlassCard } from '../../components/ui/GlassCard';
import { fieldClass, labelClass } from '../auth/AuthShell';
import {
  useCreateBenchmark,
  useDeleteBenchmark,
  useLevelBenchmarks,
  useUpdateBenchmark,
  type CreateBenchmarkInput,
} from '../../features/benchmarks/benchmarks.queries';

// ── Helpers ───────────────────────────────────────────────────────────────────

function errMsg(err: unknown, fallback: string): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return fallback;
}

// Parse a controlled input value; return NaN for blank so validation can fire.
function toInt(s: string): number {
  const n = parseInt(s, 10);
  return s.trim() === '' ? NaN : n;
}

// ── Benchmark form (shared by create + edit) ──────────────────────────────────

interface BenchmarkFormValues {
  level_number: string;
  full_swing_target: string;
  around_green_target: string;
  putting_target: string;
  nine_hole_target: string;
}

const EMPTY_FORM: BenchmarkFormValues = {
  level_number: '',
  full_swing_target: '',
  around_green_target: '',
  putting_target: '',
  nine_hole_target: '',
};

function benchmarkToForm(b: LevelBenchmark): BenchmarkFormValues {
  return {
    level_number: String(b.level_number),
    full_swing_target: String(b.full_swing_target),
    around_green_target: String(b.around_green_target),
    putting_target: String(b.putting_target),
    nine_hole_target: String(b.nine_hole_target),
  };
}

function validateForm(
  f: BenchmarkFormValues,
  existingLevels: number[],
  editingId: number | null,
): string | null {
  const level = toInt(f.level_number);
  if (isNaN(level) || level < 1 || level > 20) {
    return 'Level must be a whole number between 1 and 20.';
  }
  // When creating, the level must not already have a benchmark.
  if (editingId === null && existingLevels.includes(level)) {
    return `A benchmark for Level ${level} already exists. Edit it instead.`;
  }
  for (const [key, label] of [
    ['full_swing_target', 'Full swing target'],
    ['around_green_target', 'Around green target'],
    ['putting_target', 'Putting target'],
    ['nine_hole_target', '9-hole target'],
  ] as const) {
    const v = toInt(f[key]);
    if (isNaN(v) || v < 1) {
      return `${label} must be a positive whole number.`;
    }
  }
  return null;
}

function formToPayload(f: BenchmarkFormValues): CreateBenchmarkInput {
  return {
    level_number: toInt(f.level_number),
    full_swing_target: toInt(f.full_swing_target),
    around_green_target: toInt(f.around_green_target),
    putting_target: toInt(f.putting_target),
    nine_hole_target: toInt(f.nine_hole_target),
  };
}

// ── Number input sub-component ────────────────────────────────────────────────

function NumInput({
  id,
  label,
  value,
  onChange,
  hint,
  min = 1,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
  min?: number;
}) {
  return (
    <div>
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      <input
        id={id}
        type="number"
        min={min}
        inputMode="numeric"
        required
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={fieldClass}
      />
      {hint && <p className="mt-1 text-xs text-slate">{hint}</p>}
    </div>
  );
}

// ── Create panel ──────────────────────────────────────────────────────────────

function CreatePanel({
  existingLevels,
  onClose,
}: {
  existingLevels: number[];
  onClose: () => void;
}) {
  const create = useCreateBenchmark();
  const [form, setForm] = useState<BenchmarkFormValues>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  function set(key: keyof BenchmarkFormValues) {
    return (v: string) => setForm((f) => ({ ...f, [key]: v }));
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const err = validateForm(form, existingLevels, null);
    if (err) { setFormError(err); return; }

    create.mutate(formToPayload(form), {
      onSuccess: () => {
        setSuccess(true);
        setForm(EMPTY_FORM);
        window.setTimeout(onClose, 900);
      },
      onError: (err) => {
        setFormError(errMsg(err, 'Could not create benchmark. Please try again.'));
      },
    });
  }

  return (
    <GlassCard className="mt-5 p-5 sm:p-6" data-testid="create-benchmark-panel">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-bold text-silver">New benchmark</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close create form"
          className="rounded-lg p-1.5 text-slate transition-colors hover:bg-white/5 hover:text-silver focus:outline-none focus-visible:ring-2 focus-visible:ring-azure/50"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>

      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {formError && (
          <p
            role="alert"
            className="flex items-center gap-2 rounded-xl bg-red-500/15 px-3 py-2 text-sm text-red-400"
          >
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
            {formError}
          </p>
        )}
        {success && (
          <p
            role="status"
            className="flex items-center gap-2 rounded-xl bg-emerald-500/15 px-3 py-2 text-sm text-emerald-400"
          >
            <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
            Benchmark created
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <NumInput
            id="create-level"
            label="Level"
            value={form.level_number}
            onChange={set('level_number')}
            hint="1 – 9+ (must not already have a benchmark)"
            min={1}
          />
          <NumInput
            id="create-full-swing"
            label="Full swing target"
            value={form.full_swing_target}
            onChange={set('full_swing_target')}
          />
          <NumInput
            id="create-around-green"
            label="Around green target"
            value={form.around_green_target}
            onChange={set('around_green_target')}
          />
          <NumInput
            id="create-putting"
            label="Putting target"
            value={form.putting_target}
            onChange={set('putting_target')}
          />
          <NumInput
            id="create-nine-hole"
            label="9-hole score target"
            value={form.nine_hole_target}
            onChange={set('nine_hole_target')}
          />
        </div>

        <div className="flex items-center gap-3 pt-1">
          <Button
            type="submit"
            variant="primary"
            size="sm"
            disabled={create.isPending}
            data-testid="create-benchmark-submit"
          >
            {create.isPending && (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            )}
            {create.isPending ? 'Saving…' : 'Create benchmark'}
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

// ── Edit panel (inline, per row) ──────────────────────────────────────────────

function EditPanel({
  benchmark,
  existingLevels,
  onClose,
}: {
  benchmark: LevelBenchmark;
  existingLevels: number[];
  onClose: () => void;
}) {
  const update = useUpdateBenchmark();
  const [form, setForm] = useState<BenchmarkFormValues>(benchmarkToForm(benchmark));
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  function set(key: keyof BenchmarkFormValues) {
    return (v: string) => setForm((f) => ({ ...f, [key]: v }));
  }

  // Validation: pass the current id so the "already exists" check ignores self.
  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);

    // For the edit case we allow the same level number (it's the same row).
    const levelsExcludingSelf = existingLevels.filter(
      (l) => l !== benchmark.level_number,
    );
    const err = validateForm(form, levelsExcludingSelf, benchmark.id);
    if (err) { setFormError(err); return; }

    update.mutate(
      { id: benchmark.id, ...formToPayload(form) },
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
      colSpan={6}
      className="bg-white/[0.02] px-5 py-5"
      data-testid={`edit-panel-${benchmark.id}`}
    >
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {formError && (
          <p
            role="alert"
            className="flex items-center gap-2 rounded-xl bg-red-500/15 px-3 py-2 text-sm text-red-400"
          >
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
            {formError}
          </p>
        )}
        {success && (
          <p
            role="status"
            className="flex items-center gap-2 rounded-xl bg-emerald-500/15 px-3 py-2 text-sm text-emerald-400"
          >
            <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
            Saved
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {/* Level is read-only in edit mode */}
          <div>
            <p className={labelClass}>Level</p>
            <p
              className={cn(
                fieldClass,
                'flex items-center opacity-60',
              )}
              aria-disabled="true"
            >
              {benchmark.level_number}
            </p>
            {/* Hidden so validation still reads the same form values */}
            <input type="hidden" value={form.level_number} readOnly />
          </div>
          <NumInput
            id={`edit-full-swing-${benchmark.id}`}
            label="Full swing"
            value={form.full_swing_target}
            onChange={set('full_swing_target')}
          />
          <NumInput
            id={`edit-around-green-${benchmark.id}`}
            label="Around green"
            value={form.around_green_target}
            onChange={set('around_green_target')}
          />
          <NumInput
            id={`edit-putting-${benchmark.id}`}
            label="Putting"
            value={form.putting_target}
            onChange={set('putting_target')}
          />
          <NumInput
            id={`edit-nine-hole-${benchmark.id}`}
            label="9-hole"
            value={form.nine_hole_target}
            onChange={set('nine_hole_target')}
          />
        </div>

        <div className="flex items-center gap-3">
          <Button
            type="submit"
            variant="primary"
            size="sm"
            disabled={update.isPending}
            data-testid={`save-benchmark-${benchmark.id}`}
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

function BenchmarkRow({
  benchmark,
  existingLevels,
  isEditing,
  onEdit,
  onEditClose,
}: {
  benchmark: LevelBenchmark;
  existingLevels: number[];
  isEditing: boolean;
  onEdit: () => void;
  onEditClose: () => void;
}) {
  const deleteMutation = useDeleteBenchmark();
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <>
      <tr
        className={cn(
          'border-t border-white/5 transition-colors',
          isEditing
            ? 'bg-azure/[0.05]'
            : 'hover:bg-white/[0.03]',
        )}
        data-testid={`benchmark-row-${benchmark.id}`}
      >
        {/* Level */}
        <td className="px-5 py-3.5 font-mono font-bold text-azure">
          L{benchmark.level_number}
        </td>
        {/* Four targets */}
        <td className="px-5 py-3.5 text-right font-mono text-silver">
          {benchmark.full_swing_target}
        </td>
        <td className="px-5 py-3.5 text-right font-mono text-silver">
          {benchmark.around_green_target}
        </td>
        <td className="px-5 py-3.5 text-right font-mono text-silver">
          {benchmark.putting_target}
        </td>
        <td className="px-5 py-3.5 text-right font-mono text-silver">
          {benchmark.nine_hole_target}
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
                  ? `Cancel editing Level ${benchmark.level_number}`
                  : `Edit Level ${benchmark.level_number} benchmark`
              }
              data-testid={`edit-benchmark-${benchmark.id}`}
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
              aria-label={`Delete Level ${benchmark.level_number} benchmark`}
              disabled={deleteMutation.isPending}
              data-testid={`delete-benchmark-${benchmark.id}`}
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

      {/* Inline edit form (expands below the row as a full-width cell) */}
      {isEditing && (
        <tr
          className="border-t border-azure/20"
          data-testid={`edit-row-${benchmark.id}`}
        >
          <EditPanel
            benchmark={benchmark}
            existingLevels={existingLevels}
            onClose={onEditClose}
          />
        </tr>
      )}

      {/* Delete confirmation dialog */}
      <ConfirmDialog
        open={confirmDelete}
        title="Delete benchmark"
        message={
          <>
            Delete the benchmark targets for{' '}
            <strong className="text-silver">Level {benchmark.level_number}</strong>?
            This cannot be undone.
          </>
        }
        confirmLabel="Delete"
        destructive
        busy={deleteMutation.isPending}
        onConfirm={() =>
          deleteMutation.mutate(benchmark.id, {
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

export function AdminBenchmarksPage() {
  const { data: benchmarks, isLoading, isError, error } = useLevelBenchmarks();

  const [editingId, setEditingId] = useState<number | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const sorted = [...(benchmarks ?? [])].sort(
    (a, b) => a.level_number - b.level_number,
  );
  const existingLevels = sorted.map((b) => b.level_number);

  return (
    <div className="mx-auto max-w-5xl animate-fade-in-up">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-azure">
            Programme settings
          </p>
          <h1 className="mt-1 text-2xl font-black text-silver">
            Benchmark targets
          </h1>
          <p className="mt-1 text-sm text-slate">
            Skill targets per level. Lower scores are better (golf scoring).
            Displayed alongside actuals on junior progress screens.
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
          data-testid="open-create-benchmark"
        >
          <Plus className="h-4 w-4" aria-hidden />
          New benchmark
        </Button>
      </div>

      {/* Create panel */}
      {showCreate && (
        <CreatePanel
          existingLevels={existingLevels}
          onClose={() => setShowCreate(false)}
        />
      )}

      {/* List area */}
      <div className="mt-6">
        {isLoading ? (
          <div
            className="flex items-center justify-center gap-3 py-16 text-slate"
            data-testid="benchmarks-loading"
          >
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
            <span>Loading benchmarks…</span>
          </div>
        ) : isError ? (
          <GlassCard
            className="border border-red-500/30 bg-red-500/10 p-5"
            role="alert"
            data-testid="benchmarks-error"
          >
            <div className="flex items-center gap-3 text-red-400">
              <AlertCircle className="h-5 w-5 shrink-0" aria-hidden />
              <span className="text-sm font-semibold">
                {errMsg(error, 'Could not load benchmarks. Please try again.')}
              </span>
            </div>
          </GlassCard>
        ) : sorted.length === 0 ? (
          <GlassCard className="p-10 text-center text-slate" data-testid="benchmarks-empty">
            No benchmark targets defined yet. Create the first one above.
          </GlassCard>
        ) : (
          <GlassCard className="overflow-hidden">
            <div className="overflow-x-auto">
              <table
                className="w-full min-w-[44rem] text-left text-sm"
                aria-label="Level benchmark targets"
              >
                <thead>
                  <tr className="border-b border-white/10 text-[11px] uppercase tracking-wider text-slate">
                    <th scope="col" className="px-5 py-3 font-semibold">
                      Level
                    </th>
                    <th
                      scope="col"
                      className="px-5 py-3 text-right font-semibold"
                      title="Full swing target (lower is better)"
                    >
                      Full swing
                    </th>
                    <th
                      scope="col"
                      className="px-5 py-3 text-right font-semibold"
                      title="Around green target"
                    >
                      Around green
                    </th>
                    <th
                      scope="col"
                      className="px-5 py-3 text-right font-semibold"
                      title="Putting target"
                    >
                      Putting
                    </th>
                    <th
                      scope="col"
                      className="px-5 py-3 text-right font-semibold"
                      title="9-hole score target"
                    >
                      9-hole
                    </th>
                    <th
                      scope="col"
                      className="px-5 py-3 text-right font-semibold"
                    >
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((b) => (
                    <BenchmarkRow
                      key={b.id}
                      benchmark={b}
                      existingLevels={existingLevels}
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

      {/* Key for the four target columns */}
      <p className="mt-3 text-xs text-slate/60">
        All targets: lower score = better performance. Full swing / around green
        / putting = shot count targets; 9-hole = gross score target.
      </p>
    </div>
  );
}
