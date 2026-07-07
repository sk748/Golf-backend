// Course / Scorecard reference page (read-only). Shows the club's course header,
// its tee sets, and the per-hole scorecard. There is effectively one course
// (Karen Country Club); we take the first and offer a simple selector only if the
// API ever returns more than one. No golf math is computed here beyond display
// sums of par per nine — all ratings/yardages/SI come straight from the API.

import { useMemo, useState } from 'react';
import { Flag, Loader2, MapPin, Mountain, Sprout } from 'lucide-react';

import { ApiError } from '../../lib/api';
import { cn } from '../../lib/cn';
import { Badge } from '../../components/ui/Badge';
import { GlassCard } from '../../components/ui/GlassCard';
import type { CourseTee, CourseWithTees, Hole } from '../../types/api';
import { useCoursesWithTees, useHoles } from './admin-courses.queries';

// ── Helpers ──────────────────────────────────────────────────────────────────

// Map a tee colour to a swatch. Unknown colours fall back to a neutral slate.
const TEE_DOT: Record<string, string> = {
  white: 'bg-white',
  yellow: 'bg-yellow-400',
  blue: 'bg-blue-500',
  red: 'bg-red-500',
};

function teeDotClass(color: string): string {
  return TEE_DOT[color.toLowerCase()] ?? 'bg-slate';
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Something went wrong loading course data.';
}

function sumPar(holes: Hole[]): number {
  return holes.reduce((total, hole) => total + hole.par, 0);
}

// ── Small UI building blocks ─────────────────────────────────────────────────

function LoadingState({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 py-12 text-sm text-slate">
      <Loader2 className="h-5 w-5 animate-spin text-azure" aria-hidden />
      {label}
    </div>
  );
}

function ErrorState({ error }: { error: unknown }) {
  return (
    <div
      role="alert"
      className="rounded-xl bg-red-500/15 p-3 text-sm text-red-400"
      data-testid="courses-error"
    >
      {errorMessage(error)}
    </div>
  );
}

// ── Tee sets ─────────────────────────────────────────────────────────────────

function TeeSetsCard({ tees }: { tees: CourseTee[] }) {
  return (
    <GlassCard className="overflow-hidden">
      <div className="border-b border-white/5 px-5 py-4">
        <h2 className="text-sm font-bold uppercase tracking-widest text-azure">
          Tee sets
        </h2>
      </div>
      {tees.length === 0 ? (
        <p className="px-5 py-8 text-sm text-slate">
          No tee sets recorded for this course.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[34rem] text-left text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wider text-slate">
                <th scope="col" className="px-5 py-3 font-semibold">Tee</th>
                <th scope="col" className="px-5 py-3 font-semibold">Gender</th>
                <th scope="col" className="px-5 py-3 text-right font-semibold">CR</th>
                <th scope="col" className="px-5 py-3 text-right font-semibold">Slope</th>
                <th scope="col" className="px-5 py-3 text-right font-semibold">Total yards</th>
              </tr>
            </thead>
            <tbody>
              {tees.map((tee) => (
                <tr
                  key={tee.id}
                  data-testid={`tee-row-${tee.id}`}
                  className="border-t border-white/5"
                >
                  <td className="px-5 py-3 text-silver">
                    <span className="flex items-center gap-2">
                      <span
                        className={cn(
                          'h-3 w-3 shrink-0 rounded-full ring-1 ring-white/20',
                          teeDotClass(tee.color),
                        )}
                        aria-hidden
                      />
                      <span className="font-medium">{tee.name || tee.color}</span>
                    </span>
                  </td>
                  <td className="px-5 py-3 capitalize text-slate">{tee.gender}</td>
                  <td className="px-5 py-3 text-right font-mono text-silver">
                    {tee.course_rating}
                  </td>
                  <td className="px-5 py-3 text-right font-mono text-silver">
                    {tee.slope_rating}
                  </td>
                  <td className="px-5 py-3 text-right font-mono text-silver">
                    {tee.total_yards.toLocaleString()}
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

// ── Scorecard (holes) ────────────────────────────────────────────────────────

const HOLE_COLS: { key: keyof Hole; label: string; mono: boolean; accent?: boolean }[] = [
  { key: 'par', label: 'Par', mono: true },
  { key: 'stroke_index', label: 'SI', mono: true, accent: true },
  { key: 'white_yards', label: 'White', mono: true },
  { key: 'yellow_yards', label: 'Yellow', mono: true },
  { key: 'blue_yards', label: 'Blue', mono: true },
  { key: 'red_yards', label: 'Red', mono: true },
];

function ScorecardRow({ hole }: { hole: Hole }) {
  return (
    <tr
      data-testid={`hole-row-${hole.hole_number}`}
      className="border-t border-white/5"
    >
      <td className="px-4 py-2.5 font-mono font-semibold text-silver">
        {hole.hole_number}
      </td>
      {HOLE_COLS.map((col) => (
        <td
          key={col.key}
          className={cn(
            'px-4 py-2.5 text-right font-mono',
            col.accent ? 'text-azure' : 'text-silver',
          )}
        >
          {hole[col.key]}
        </td>
      ))}
    </tr>
  );
}

// A summary row (OUT / IN / TOTAL) showing only the par sum — display-only.
function ScorecardSummaryRow({ label, parSum }: { label: string; parSum: number }) {
  return (
    <tr className="border-t border-white/10 bg-white/[0.02]">
      <td className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-azure">
        {label}
      </td>
      <td className="px-4 py-2.5 text-right font-mono font-bold text-silver">
        {parSum}
      </td>
      {/* SI + the four yardage columns carry no meaningful sum here. */}
      <td colSpan={HOLE_COLS.length - 1} aria-hidden />
    </tr>
  );
}

function ScorecardNine({ title, holes }: { title: string; holes: Hole[] }) {
  if (holes.length === 0) return null;
  const outLabel = title.toLowerCase().includes('front') ? 'OUT' : 'IN';
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[40rem] text-left text-sm">
        <thead>
          <tr className="text-[11px] uppercase tracking-wider text-slate">
            <th scope="col" className="px-4 py-3 font-semibold">{title}</th>
            {HOLE_COLS.map((col) => (
              <th key={col.key} scope="col" className="px-4 py-3 text-right font-semibold">
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {holes.map((hole) => (
            <ScorecardRow key={hole.id} hole={hole} />
          ))}
          <ScorecardSummaryRow label={outLabel} parSum={sumPar(holes)} />
        </tbody>
      </table>
    </div>
  );
}

function ScorecardCard({
  holes,
  isLoading,
  isError,
  error,
}: {
  holes: Hole[] | undefined;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
}) {
  const { front, back, totalPar } = useMemo(() => {
    const sorted = [...(holes ?? [])].sort(
      (a, b) => a.hole_number - b.hole_number,
    );
    return {
      front: sorted.filter((h) => h.hole_number <= 9),
      back: sorted.filter((h) => h.hole_number > 9),
      totalPar: sumPar(sorted),
    };
  }, [holes]);

  return (
    <GlassCard className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-white/5 px-5 py-4">
        <h2 className="text-sm font-bold uppercase tracking-widest text-azure">
          Scorecard
        </h2>
        {holes && holes.length > 0 && (
          <span className="text-xs text-slate">
            Total par{' '}
            <span className="font-mono font-bold text-silver">{totalPar}</span>
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="px-5">
          <LoadingState label="Loading scorecard…" />
        </div>
      ) : isError ? (
        <div className="px-5 py-5">
          <ErrorState error={error} />
        </div>
      ) : !holes || holes.length === 0 ? (
        <p className="px-5 py-8 text-sm text-slate">
          No hole data found for this course.
        </p>
      ) : (
        <div className="divide-y divide-white/5">
          <ScorecardNine title="Front 9" holes={front} />
          <ScorecardNine title="Back 9" holes={back} />
        </div>
      )}
    </GlassCard>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export function AdminCoursesPage() {
  const coursesQuery = useCoursesWithTees();
  const courses = coursesQuery.data;

  // Default to the first (and, in practice, only) course. A selector appears
  // only if the API ever returns more than one.
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selected: CourseWithTees | undefined = useMemo(() => {
    if (!courses || courses.length === 0) return undefined;
    return courses.find((c) => c.id === selectedId) ?? courses[0];
  }, [courses, selectedId]);

  const holesQuery = useHoles(selected?.id);

  return (
    <div className="mx-auto max-w-5xl animate-fade-in-up">
      <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-azure">
        Reference data
      </p>

      {coursesQuery.isLoading ? (
        <>
          <h1 className="mt-1 text-2xl font-black text-silver">Course</h1>
          <GlassCard className="mt-6 px-5">
            <LoadingState label="Loading course…" />
          </GlassCard>
        </>
      ) : coursesQuery.isError ? (
        <>
          <h1 className="mt-1 text-2xl font-black text-silver">Course</h1>
          <div className="mt-6">
            <ErrorState error={coursesQuery.error} />
          </div>
        </>
      ) : !selected ? (
        <>
          <h1 className="mt-1 text-2xl font-black text-silver">Course</h1>
          <GlassCard className="mt-6 px-5 py-10">
            <p className="text-sm text-slate" data-testid="courses-empty">
              No course data found.
            </p>
          </GlassCard>
        </>
      ) : (
        <>
          {/* Course header */}
          <h1 className="mt-1 text-2xl font-black text-silver">{selected.name}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Badge tone="gold" className="gap-1.5">
              <Flag className="h-3.5 w-3.5" aria-hidden />
              Par <span className="font-mono">{selected.par}</span>
            </Badge>
            {selected.altitude_ft !== null && (
              <Badge tone="azure" className="gap-1.5">
                <Mountain className="h-3.5 w-3.5" aria-hidden />
                <span className="font-mono">
                  {selected.altitude_ft.toLocaleString()}
                </span>{' '}
                ft
              </Badge>
            )}
            {selected.grass_type && (
              <Badge tone="emerald" className="gap-1.5">
                <Sprout className="h-3.5 w-3.5" aria-hidden />
                {selected.grass_type}
              </Badge>
            )}
          </div>

          {/* Course selector — only when there's genuinely a choice. */}
          {courses && courses.length > 1 && (
            <div className="mt-4 flex items-center gap-2">
              <MapPin className="h-4 w-4 text-slate" aria-hidden />
              <label htmlFor="course-select" className="sr-only">
                Select course
              </label>
              <select
                id="course-select"
                value={selected.id}
                onChange={(e) => setSelectedId(Number(e.target.value))}
                className="rounded-lg bg-white/5 px-3 py-1.5 text-sm text-silver outline-none ring-1 ring-white/10 focus:ring-azure"
              >
                {courses.map((c) => (
                  <option key={c.id} value={c.id} className="bg-navy">
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="mt-6 space-y-6">
            <TeeSetsCard tees={selected.tees} />
            <ScorecardCard
              holes={holesQuery.data}
              isLoading={holesQuery.isLoading}
              isError={holesQuery.isError}
              error={holesQuery.error}
            />
          </div>
        </>
      )}
    </div>
  );
}
