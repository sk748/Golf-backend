// Series / order-of-merit LIST — shared across all signed-in roles (route-
// guarded in App.tsx). Everyone can browse the series; admins additionally get
// an inline "New series" create form with a repeatable points-scheme editor.
// The points_scheme is serialized to a JSON STRING via stringifyPointsScheme
// before it's sent (see series.queries.ts header).

import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CalendarRange,
  ChevronRight,
  ListOrdered,
  Loader2,
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
import { useAuth } from '../../auth/useAuth';
import {
  pointsSchemePeek,
  seriesStatusLabel,
  seriesStatusTone,
  stringifyPointsScheme,
  useCreateSeries,
  useSeriesList,
  type Series,
} from './series.queries';

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Something went wrong. Please try again.';
}

const inputClass =
  'w-full rounded-xl bg-white/5 px-4 py-3 text-sm text-silver placeholder:text-slate/60 outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-azure/60 disabled:opacity-50';
const labelClass = 'block text-sm font-semibold text-silver';

// ── Points-scheme editor (repeatable position/points rows) ────────────────────
// String-backed so blank inputs stay blank; serialized at submit via
// stringifyPointsScheme. Exported so SeriesDetailPage's edit panel reuses it.

export interface EditorRow {
  position: string;
  points: string;
}

export function PointsSchemeEditor({
  rows,
  onChange,
  hint,
}: {
  rows: EditorRow[];
  onChange: (rows: EditorRow[]) => void;
  hint?: string;
}) {
  const update = (index: number, patch: Partial<EditorRow>) =>
    onChange(rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  const remove = (index: number) => onChange(rows.filter((_, i) => i !== index));
  const add = () => {
    // Suggest the next finishing position.
    const next =
      rows.reduce((max, r) => {
        const p = Number(r.position);
        return Number.isFinite(p) && p > max ? p : max;
      }, 0) + 1;
    onChange([...rows, { position: String(next), points: '' }]);
  };

  return (
    <div data-testid="points-scheme-editor">
      <span className={labelClass}>Points scheme</span>
      <p className="mt-0.5 text-xs text-slate">
        {hint ?? 'Points awarded by finishing position.'}
      </p>
      <div className="mt-2 space-y-2">
        <div className="grid grid-cols-[1fr_1fr_auto] items-center gap-2 px-1 text-xs font-semibold uppercase tracking-wider text-slate">
          <span>Position</span>
          <span>Points</span>
          <span className="sr-only">Remove</span>
        </div>
        {rows.map((row, index) => (
          <div
            key={index}
            className="grid grid-cols-[1fr_1fr_auto] items-center gap-2"
            data-testid={`points-row-${index}`}
          >
            <input
              type="number"
              min={1}
              inputMode="numeric"
              className={inputClass}
              value={row.position}
              placeholder="1"
              aria-label={`Position for row ${index + 1}`}
              onChange={(e) => update(index, { position: e.target.value })}
            />
            <input
              type="number"
              inputMode="numeric"
              className={inputClass}
              value={row.points}
              placeholder="Points"
              aria-label={`Points for row ${index + 1}`}
              onChange={(e) => update(index, { points: e.target.value })}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => remove(index)}
              aria-label={`Remove row ${index + 1}`}
              data-testid={`points-remove-${index}`}
            >
              <Trash2 className="h-4 w-4" aria-hidden />
            </Button>
          </div>
        ))}
        {rows.length === 0 ? (
          <p className="text-xs text-slate">No positions yet.</p>
        ) : null}
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={add}
        className="mt-2"
        data-testid="points-add"
      >
        <Plus className="h-4 w-4" aria-hidden />
        Add position
      </Button>
    </div>
  );
}

// ── A single series row ───────────────────────────────────────────────────────

function SeriesCard({ series }: { series: Series }) {
  const peek = pointsSchemePeek(series.points_scheme);
  return (
    <Link
      to={`/series/${series.id}`}
      className="group block focus:outline-none focus-visible:ring-2 focus-visible:ring-azure/50 rounded-2xl"
      data-testid={`series-card-${series.id}`}
    >
      <GlassCard className="flex items-center gap-4 px-5 py-4 transition-colors group-hover:bg-white/[0.06]">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate font-bold text-silver">{series.name}</p>
            <Badge tone="slate" shape="pill" className="gap-1">
              <CalendarRange className="h-3 w-3" aria-hidden />
              {series.year}
            </Badge>
            <Badge tone={seriesStatusTone(series.status)} shape="pill">
              {seriesStatusLabel(series.status)}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-slate">
            {peek ?? 'No points scheme set yet.'}
          </p>
        </div>
        <ChevronRight
          className="h-5 w-5 shrink-0 text-slate transition-colors group-hover:text-azure"
          aria-hidden
        />
      </GlassCard>
    </Link>
  );
}

// ── Admin: inline create form ─────────────────────────────────────────────────

function CreateSeriesForm({ onDone }: { onDone: () => void }) {
  const create = useCreateSeries();
  const currentYear = new Date().getFullYear();

  const [name, setName] = useState('');
  const [year, setYear] = useState(String(currentYear));
  const [status, setStatus] = useState('active');
  const [rows, setRows] = useState<EditorRow[]>([
    { position: '1', points: '' },
  ]);
  const [nameError, setNameError] = useState<string | undefined>();
  const [yearError, setYearError] = useState<string | undefined>();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    let bad = false;
    if (!name.trim()) {
      setNameError('A series name is required.');
      bad = true;
    } else {
      setNameError(undefined);
    }
    const yearNum = Number(year);
    if (!year.trim() || !Number.isFinite(yearNum)) {
      setYearError('A valid year is required.');
      bad = true;
    } else {
      setYearError(undefined);
    }
    if (bad) return;

    const points_scheme = stringifyPointsScheme(
      rows.map((r) => ({ position: Number(r.position), points: Number(r.points) })),
    );

    create.mutate(
      {
        name: name.trim(),
        year: Math.trunc(yearNum),
        // '{}' means "no positions configured" — send null instead.
        points_scheme: points_scheme === '{}' ? null : points_scheme,
        status: status.trim() || null,
      },
      {
        onSuccess: () => {
          setName('');
          setYear(String(currentYear));
          setStatus('active');
          setRows([{ position: '1', points: '' }]);
          onDone();
        },
      },
    );
  }

  return (
    <GlassCard className="overflow-hidden" data-testid="series-create-form">
      <div className="flex items-center gap-2 border-b border-white/5 px-5 py-4">
        <Plus className="h-4 w-4 text-azure" aria-hidden />
        <h2 className="text-sm font-bold uppercase tracking-widest text-azure">
          New series
        </h2>
      </div>
      <form onSubmit={submit} className="space-y-5 px-5 py-5" noValidate>
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="series-name" className={labelClass}>
              Name
            </label>
            <input
              id="series-name"
              className={cn(inputClass, 'mt-1.5')}
              value={name}
              placeholder="Junior Order of Merit"
              onChange={(e) => setName(e.target.value)}
            />
            {nameError ? (
              <p className="mt-1 text-xs font-semibold text-red-400" role="alert">
                {nameError}
              </p>
            ) : null}
          </div>
          <div>
            <label htmlFor="series-year" className={labelClass}>
              Year
            </label>
            <input
              id="series-year"
              type="number"
              inputMode="numeric"
              className={cn(inputClass, 'mt-1.5')}
              value={year}
              onChange={(e) => setYear(e.target.value)}
            />
            {yearError ? (
              <p className="mt-1 text-xs font-semibold text-red-400" role="alert">
                {yearError}
              </p>
            ) : null}
          </div>
        </div>

        <div>
          <label htmlFor="series-status" className={labelClass}>
            Status
          </label>
          <p className="mt-0.5 text-xs text-slate">Optional — e.g. active, completed.</p>
          <select
            id="series-status"
            className={cn(inputClass, 'mt-1.5')}
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="active" className="bg-navy">
              Active
            </option>
            <option value="completed" className="bg-navy">
              Completed
            </option>
            <option value="draft" className="bg-navy">
              Draft
            </option>
            <option value="cancelled" className="bg-navy">
              Cancelled
            </option>
          </select>
        </div>

        <PointsSchemeEditor
          rows={rows}
          onChange={setRows}
          hint="Points awarded by finishing position in each completed event."
        />

        {create.isError ? (
          <div
            role="alert"
            className="rounded-xl bg-red-500/15 p-3 text-sm text-red-400"
            data-testid="series-create-error"
          >
            {errorMessage(create.error)}
          </div>
        ) : null}

        <div className="flex items-center gap-3">
          <Button type="submit" size="md" disabled={create.isPending} data-testid="series-create-save">
            {create.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Save className="h-4 w-4" aria-hidden />
            )}
            Create series
          </Button>
          <Button type="button" variant="ghost" size="md" onClick={onDone}>
            <X className="h-4 w-4" aria-hidden />
            Cancel
          </Button>
        </div>
      </form>
    </GlassCard>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function SeriesListPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [yearFilter, setYearFilter] = useState('');
  const [creating, setCreating] = useState(false);

  const parsedYear = yearFilter.trim() === '' ? undefined : Number(yearFilter);
  const year = parsedYear !== undefined && Number.isFinite(parsedYear)
    ? Math.trunc(parsedYear)
    : undefined;

  const query = useSeriesList(year);
  const list = query.data ?? [];

  return (
    <div className="mx-auto max-w-3xl animate-fade-in-up">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ListOrdered className="h-6 w-6 text-azure" aria-hidden />
          <h1 className="text-2xl font-black text-silver">Series &amp; standings</h1>
        </div>
        {isAdmin && !creating ? (
          <Button size="sm" onClick={() => setCreating(true)} data-testid="series-new-btn">
            <Plus className="h-4 w-4" aria-hidden />
            New series
          </Button>
        ) : null}
      </div>
      <p className="mt-1 text-sm text-slate">
        Order-of-merit standings across a season&apos;s events.
      </p>

      {/* Year filter */}
      <div className="mt-5 flex items-center gap-2">
        <label htmlFor="series-year-filter" className="text-sm text-slate">
          Year
        </label>
        <input
          id="series-year-filter"
          type="number"
          inputMode="numeric"
          className="w-32 rounded-xl bg-white/5 px-3 py-2 text-sm text-silver placeholder:text-slate/60 outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-azure/60"
          value={yearFilter}
          placeholder="All years"
          onChange={(e) => setYearFilter(e.target.value)}
          data-testid="series-year-filter"
        />
        {yearFilter ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setYearFilter('')}
          >
            Clear
          </Button>
        ) : null}
      </div>

      {/* Admin create form */}
      {isAdmin && creating ? (
        <div className="mt-6">
          <CreateSeriesForm onDone={() => setCreating(false)} />
        </div>
      ) : null}

      {/* List */}
      <div className="mt-6">
        {query.isLoading ? (
          <div className="flex items-center gap-3 py-12 text-sm text-slate">
            <Loader2 className="h-5 w-5 animate-spin text-azure" aria-hidden />
            Loading series…
          </div>
        ) : query.isError ? (
          <div
            role="alert"
            className="rounded-xl bg-red-500/15 p-4 text-sm text-red-400"
            data-testid="series-list-error"
          >
            {errorMessage(query.error)}
          </div>
        ) : list.length === 0 ? (
          <GlassCard className="px-6 py-16 text-center" data-testid="series-list-empty">
            <Trophy className="mx-auto h-10 w-10 text-slate/60" aria-hidden />
            <p className="mt-4 text-base font-bold text-silver">No series yet.</p>
            <p className="mt-1 text-sm text-slate">
              {isAdmin
                ? 'Create a series to start tracking an order of merit.'
                : 'Order-of-merit standings will appear here once a series is set up.'}
            </p>
          </GlassCard>
        ) : (
          <ul className="space-y-3" data-testid="series-list">
            {list.map((series) => (
              <li key={series.id}>
                <SeriesCard series={series} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
