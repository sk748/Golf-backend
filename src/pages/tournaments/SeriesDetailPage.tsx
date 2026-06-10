// Series DETAIL — shared across all signed-in roles. The standings table and
// the points-scheme reference are read-only for everyone. Admins additionally
// get an inline edit panel and a delete control. Standings are computed
// server-side from COMPLETED tournaments in the series (CLAUDE.md tournaments
// rules) — we only display them. The points_scheme is a JSON STRING on the wire
// (see series.queries.ts): read with parsePointsScheme, write with
// stringifyPointsScheme.

import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  CalendarRange,
  ListOrdered,
  Loader2,
  Medal,
  Pencil,
  Save,
  Table,
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
import { PointsSchemeEditor, type EditorRow } from './SeriesListPage';
import {
  parsePointsScheme,
  seriesStatusLabel,
  seriesStatusTone,
  stringifyPointsScheme,
  useDeleteSeries,
  useSeries,
  useSeriesStandings,
  useUpdateSeries,
  type Series,
  type SeriesStanding,
} from './series.queries';

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Something went wrong. Please try again.';
}

const inputClass =
  'w-full rounded-xl bg-white/5 px-4 py-3 text-sm text-silver placeholder:text-slate/60 outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-azure/60 disabled:opacity-50';
const labelClass = 'block text-sm font-semibold text-silver';

function BackLink() {
  return (
    <Link
      to="/series"
      className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate transition-colors hover:text-azure focus:outline-none focus-visible:ring-2 focus-visible:ring-azure/50 rounded"
      data-testid="series-back-link"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden />
      All series
    </Link>
  );
}

function SectionHeader({
  icon,
  title,
}: {
  icon: React.ReactNode;
  title: string;
}) {
  return (
    <div className="flex items-center gap-2 border-b border-white/5 px-5 py-4">
      {icon}
      <h2 className="text-sm font-bold uppercase tracking-widest text-azure">
        {title}
      </h2>
    </div>
  );
}

// ── Standings table ────────────────────────────────────────────────────────────

// Top-3 rank styling: gold / silver / bronze. Lower ranks are plain.
function rankClass(rank: number): string {
  if (rank === 1) return 'text-gold';
  if (rank === 2) return 'text-silver';
  if (rank === 3) return 'text-[#cd7f32]'; // bronze
  return 'text-slate';
}

function StandingsTable({ standings }: { standings: SeriesStanding[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wider text-slate">
            <th scope="col" className="px-5 py-2 font-semibold">
              #
            </th>
            <th scope="col" className="py-2 font-semibold">
              Golfer
            </th>
            <th scope="col" className="px-3 py-2 text-right font-semibold">
              Events
            </th>
            <th scope="col" className="px-5 py-2 text-right font-semibold">
              Points
            </th>
          </tr>
        </thead>
        <tbody>
          {standings.map((row) => (
            <tr
              key={row.junior_id}
              className="border-t border-white/5"
              data-testid={`standing-row-${row.junior_id}`}
            >
              <td className={cn('px-5 py-3 font-mono font-black', rankClass(row.rank))}>
                <span className="inline-flex items-center gap-1.5">
                  {row.rank <= 3 ? (
                    <Medal className="h-4 w-4" aria-hidden />
                  ) : null}
                  {row.rank}
                </span>
              </td>
              <td className="py-3 font-semibold text-silver">
                {row.name?.trim() || `Golfer #${row.junior_id}`}
              </td>
              <td className="px-3 py-3 text-right font-mono text-slate">
                {row.events}
              </td>
              <td className="px-5 py-3 text-right font-mono font-bold text-silver">
                {row.points}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StandingsSection({ seriesId }: { seriesId: number }) {
  const query = useSeriesStandings(seriesId);
  const standings = query.data?.standings ?? [];

  return (
    <GlassCard className="overflow-hidden" data-testid="standings-section">
      <SectionHeader
        icon={<ListOrdered className="h-4 w-4 text-azure" aria-hidden />}
        title="Standings"
      />
      {query.isLoading ? (
        <div className="flex items-center gap-3 px-5 py-8 text-sm text-slate">
          <Loader2 className="h-5 w-5 animate-spin text-azure" aria-hidden />
          Loading standings…
        </div>
      ) : query.isError ? (
        <div
          role="alert"
          className="m-5 rounded-xl bg-red-500/15 p-3 text-sm text-red-400"
          data-testid="standings-error"
        >
          {errorMessage(query.error)}
        </div>
      ) : standings.length === 0 ? (
        <p className="px-5 py-8 text-sm text-slate" data-testid="standings-empty">
          Standings appear once events in this series are completed.
        </p>
      ) : (
        <div className="pb-2">
          <StandingsTable standings={standings} />
        </div>
      )}
    </GlassCard>
  );
}

// ── Points-scheme reference (read-only) ───────────────────────────────────────

function PointsReference({ series }: { series: Series }) {
  const rows = parsePointsScheme(series.points_scheme);
  return (
    <GlassCard className="overflow-hidden" data-testid="points-reference">
      <SectionHeader
        icon={<Table className="h-4 w-4 text-azure" aria-hidden />}
        title="Points scheme"
      />
      {rows.length === 0 ? (
        <p className="px-5 py-8 text-sm text-slate" data-testid="points-reference-empty">
          No points scheme configured for this series.
        </p>
      ) : (
        <div className="overflow-x-auto pb-2">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-slate">
                <th scope="col" className="px-5 py-2 font-semibold">
                  Position
                </th>
                <th scope="col" className="px-5 py-2 text-right font-semibold">
                  Points
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.position} className="border-t border-white/5">
                  <td className="px-5 py-2.5 font-mono text-silver">{r.position}</td>
                  <td className="px-5 py-2.5 text-right font-mono font-bold text-silver">
                    {r.points}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </GlassCard>
  );
}

// ── Admin: edit panel + delete ─────────────────────────────────────────────────

function EditPanel({ series }: { series: Series }) {
  const update = useUpdateSeries();
  const del = useDeleteSeries();
  const navigate = useNavigate();

  const [open, setOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [name, setName] = useState(series.name);
  const [year, setYear] = useState(String(series.year));
  const [status, setStatus] = useState(series.status ?? '');
  const [rows, setRows] = useState<EditorRow[]>(() =>
    parsePointsScheme(series.points_scheme).map((r) => ({
      position: String(r.position),
      points: String(r.points),
    })),
  );
  const [nameError, setNameError] = useState<string | undefined>();
  const [yearError, setYearError] = useState<string | undefined>();

  // Re-seed the form whenever the panel is (re)opened or the source changes, so
  // a fresh edit always starts from the latest server values.
  useEffect(() => {
    if (!open) return;
    setName(series.name);
    setYear(String(series.year));
    setStatus(series.status ?? '');
    setRows(
      parsePointsScheme(series.points_scheme).map((r) => ({
        position: String(r.position),
        points: String(r.points),
      })),
    );
    setNameError(undefined);
    setYearError(undefined);
  }, [open, series]);

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

    const scheme = stringifyPointsScheme(
      rows.map((r) => ({ position: Number(r.position), points: Number(r.points) })),
    );

    update.mutate(
      {
        id: series.id,
        body: {
          name: name.trim(),
          year: Math.trunc(yearNum),
          points_scheme: scheme === '{}' ? null : scheme,
          status: status.trim() || null,
        },
      },
      { onSuccess: () => setOpen(false) },
    );
  }

  return (
    <GlassCard className="overflow-hidden" data-testid="series-admin-panel">
      <div className="flex items-center justify-between gap-2 border-b border-white/5 px-5 py-4">
        <h2 className="text-sm font-bold uppercase tracking-widest text-azure">
          Manage series
        </h2>
        {!open ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setOpen(true)}
            data-testid="series-edit-btn"
          >
            <Pencil className="h-4 w-4" aria-hidden />
            Edit
          </Button>
        ) : null}
      </div>

      <div className="px-5 py-5">
        {open ? (
          <form onSubmit={submit} className="space-y-5" noValidate>
            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label htmlFor="edit-name" className={labelClass}>
                  Name
                </label>
                <input
                  id="edit-name"
                  className={cn(inputClass, 'mt-1.5')}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
                {nameError ? (
                  <p className="mt-1 text-xs font-semibold text-red-400" role="alert">
                    {nameError}
                  </p>
                ) : null}
              </div>
              <div>
                <label htmlFor="edit-year" className={labelClass}>
                  Year
                </label>
                <input
                  id="edit-year"
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
              <label htmlFor="edit-status" className={labelClass}>
                Status
              </label>
              <select
                id="edit-status"
                className={cn(inputClass, 'mt-1.5')}
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="" className="bg-navy">
                  No status
                </option>
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

            {update.isError ? (
              <div
                role="alert"
                className="rounded-xl bg-red-500/15 p-3 text-sm text-red-400"
                data-testid="series-edit-error"
              >
                {errorMessage(update.error)}
              </div>
            ) : null}

            <div className="flex items-center gap-3">
              <Button type="submit" size="md" disabled={update.isPending} data-testid="series-edit-save">
                {update.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Save className="h-4 w-4" aria-hidden />
                )}
                Save changes
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="md"
                onClick={() => setOpen(false)}
              >
                <X className="h-4 w-4" aria-hidden />
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-slate">
              Edit the series details, points scheme, or remove it entirely.
            </span>
            <div className="ml-auto">
              {confirmDelete ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate">Delete this series?</span>
                  <Button
                    type="button"
                    variant="danger"
                    size="sm"
                    disabled={del.isPending}
                    onClick={() =>
                      del.mutate(series.id, {
                        onSuccess: () => navigate('/series'),
                      })
                    }
                    data-testid="series-confirm-delete"
                  >
                    {del.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    ) : (
                      <Trash2 className="h-4 w-4" aria-hidden />
                    )}
                    Delete
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setConfirmDelete(false)}
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmDelete(true)}
                  data-testid="series-delete-btn"
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                  Delete series
                </Button>
              )}
            </div>
          </div>
        )}

        {del.isError ? (
          <p
            role="alert"
            className="mt-3 rounded-xl bg-red-500/15 p-3 text-sm text-red-400"
            data-testid="series-delete-error"
          >
            {errorMessage(del.error)}
          </p>
        ) : null}
      </div>
    </GlassCard>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function SeriesDetailPage() {
  const { id } = useParams<{ id: string }>();
  const seriesId = Number(id);
  const validId = Number.isFinite(seriesId) && seriesId > 0;

  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const query = useSeries(validId ? seriesId : undefined);
  const series = query.data;

  const notFound =
    !validId ||
    (query.isError && query.error instanceof ApiError && query.error.status === 404);

  if (notFound) {
    return (
      <div className="mx-auto max-w-3xl animate-fade-in-up">
        <BackLink />
        <GlassCard className="mt-6 px-6 py-16 text-center" data-testid="series-not-found">
          <Trophy className="mx-auto h-10 w-10 text-slate/60" aria-hidden />
          <p className="mt-4 text-base font-bold text-silver">Series not found</p>
          <p className="mt-1 text-sm text-slate">
            This series may have been removed, or the link is incorrect.
          </p>
        </GlassCard>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl animate-fade-in-up">
      <BackLink />

      {query.isLoading ? (
        <div className="mt-6 flex items-center gap-3 py-12 text-sm text-slate">
          <Loader2 className="h-5 w-5 animate-spin text-azure" aria-hidden />
          Loading series…
        </div>
      ) : query.isError ? (
        <div
          role="alert"
          className="mt-6 rounded-xl bg-red-500/15 p-4 text-sm text-red-400"
          data-testid="series-error"
        >
          {errorMessage(query.error)}
        </div>
      ) : series ? (
        <>
          {/* Header */}
          <div className="mt-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="slate" shape="pill" className="gap-1">
                <CalendarRange className="h-3 w-3" aria-hidden />
                {series.year}
              </Badge>
              <Badge tone={seriesStatusTone(series.status)} shape="pill">
                {seriesStatusLabel(series.status)}
              </Badge>
            </div>
            <h1 className="mt-3 text-2xl font-black text-silver">{series.name}</h1>
          </div>

          {/* Admin: edit + delete */}
          {isAdmin ? (
            <div className="mt-6">
              <EditPanel series={series} />
            </div>
          ) : null}

          {/* Standings (all roles) */}
          <div className="mt-6">
            <StandingsSection seriesId={series.id} />
          </div>

          {/* Points-scheme reference */}
          <div className="mt-6">
            <PointsReference series={series} />
          </div>
        </>
      ) : null}
    </div>
  );
}
