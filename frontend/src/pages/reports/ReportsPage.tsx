// Cross-role Reports page (route /reports, any signed-in role). Downloads
// backend-built report files (Excel or PDF): admin/committee get the
// programme-wide report plus any junior's individual report; a coach their
// assigned juniors; a parent their own child(ren); a player themselves. The
// backend scopes every report to the caller — this page only picks and downloads.

import { useState } from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';

import { useAuth } from '../../auth/useAuth';
import { GlassCard } from '../../components/ui/GlassCard';
import { ApiError } from '../../lib/api';
import {
  useAllJuniors,
  useCoachJuniors,
  type AssignableJunior,
} from '../admin/coach-assignment.queries';
import { childName, useMyChildren } from '../parent/parent-children.queries';
import { useMyJunior } from '../player/player-progress.queries';
import { ExportButton } from '../coaches/CoachManagementShared';
import {
  useExportJuniorReport,
  useExportProgrammeReport,
  type ReportFormat,
} from './reports.queries';

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

interface ReportOptions {
  format: ReportFormat;
  dateFrom: string;
  dateTo: string;
}

const DEFAULT_OPTIONS: ReportOptions = { format: 'xlsx', dateFrom: '', dateTo: '' };

function exportLabel(format: ReportFormat): string {
  return format === 'pdf' ? 'Export PDF' : 'Export .xlsx';
}

const controlClass =
  'rounded-lg border border-white/10 bg-navy px-2.5 py-1.5 text-xs text-silver outline-none transition-colors focus:border-azure';

// Format picker + optional date range, shared by every section. Blank dates
// are omitted from the request (all-time report).
function OptionsRow({
  idPrefix,
  options,
  onChange,
}: {
  idPrefix: string;
  options: ReportOptions;
  onChange: (options: ReportOptions) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label htmlFor={`${idPrefix}-format`} className="text-xs font-bold text-slate">
        Format
      </label>
      <select
        id={`${idPrefix}-format`}
        value={options.format}
        onChange={(e) => onChange({ ...options, format: e.target.value as ReportFormat })}
        className={controlClass}
      >
        <option value="xlsx">Excel (.xlsx)</option>
        <option value="pdf">PDF</option>
      </select>
      <label htmlFor={`${idPrefix}-from`} className="text-xs font-bold text-slate">
        From
      </label>
      <input
        id={`${idPrefix}-from`}
        type="date"
        value={options.dateFrom}
        onChange={(e) => onChange({ ...options, dateFrom: e.target.value })}
        className={controlClass}
      />
      <label htmlFor={`${idPrefix}-to`} className="text-xs font-bold text-slate">
        To
      </label>
      <input
        id={`${idPrefix}-to`}
        type="date"
        value={options.dateTo}
        onChange={(e) => onChange({ ...options, dateTo: e.target.value })}
        className={controlClass}
      />
    </div>
  );
}

function ErrorRow({ error, fallback }: { error: unknown; fallback: string }) {
  return (
    <p className="flex items-center gap-2 text-sm text-red-400" role="alert">
      <AlertCircle size={16} />
      {errorMessage(error, fallback)}
    </p>
  );
}

function LoadingCard({ label }: { label: string }) {
  return (
    <GlassCard className="flex items-center justify-center p-12 text-slate">
      <Loader2 className="mr-2 animate-spin" size={18} /> {label}
    </GlassCard>
  );
}

function ProgrammeReportCard() {
  const [options, setOptions] = useState(DEFAULT_OPTIONS);
  const exportProgramme = useExportProgrammeReport();

  return (
    <GlassCard className="space-y-3 p-4 sm:p-6">
      <div>
        <h2 className="text-sm font-bold text-silver">Programme report</h2>
        <p className="mt-1 text-xs text-slate">
          Every junior in the programme in one file. Leave the dates blank for an
          all-time report.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <OptionsRow idPrefix="programme" options={options} onChange={setOptions} />
        <ExportButton
          label={exportLabel(options.format)}
          pending={exportProgramme.isPending}
          onClick={() =>
            exportProgramme.mutate({
              format: options.format,
              dateFrom: options.dateFrom || undefined,
              dateTo: options.dateTo || undefined,
            })
          }
        />
      </div>
      {exportProgramme.isError && (
        <ErrorRow error={exportProgramme.error} fallback="Export failed. Please try again." />
      )}
    </GlassCard>
  );
}

function juniorLabel(junior: AssignableJunior): string {
  return junior.full_name?.trim() || `Golfer #${junior.id}`;
}

function JuniorReportCard({
  juniors,
  isLoading,
  isError,
  loadError,
  description,
  emptyMessage,
}: {
  juniors: AssignableJunior[];
  isLoading: boolean;
  isError: boolean;
  loadError: unknown;
  description: string;
  emptyMessage: string;
}) {
  const [juniorId, setJuniorId] = useState('');
  const [options, setOptions] = useState(DEFAULT_OPTIONS);
  const exportJunior = useExportJuniorReport();

  return (
    <GlassCard className="space-y-3 p-4 sm:p-6">
      <div>
        <h2 className="text-sm font-bold text-silver">Junior report</h2>
        <p className="mt-1 text-xs text-slate">{description}</p>
      </div>
      {isLoading ? (
        <p className="flex items-center gap-2 text-sm text-slate">
          <Loader2 className="animate-spin" size={16} /> Loading juniors…
        </p>
      ) : isError ? (
        <ErrorRow error={loadError} fallback="Could not load juniors." />
      ) : juniors.length === 0 ? (
        <p className="text-sm text-slate">{emptyMessage}</p>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="report-junior" className="text-xs font-bold text-slate">
              Junior
            </label>
            <select
              id="report-junior"
              value={juniorId}
              onChange={(e) => setJuniorId(e.target.value)}
              className={controlClass}
            >
              <option value="">Select a junior…</option>
              {juniors.map((j) => (
                <option key={j.id} value={j.id}>
                  {juniorLabel(j)}
                </option>
              ))}
            </select>
          </div>
          <OptionsRow idPrefix="junior" options={options} onChange={setOptions} />
          <ExportButton
            label={exportLabel(options.format)}
            pending={exportJunior.isPending}
            onClick={() => {
              if (!juniorId) return;
              exportJunior.mutate({
                juniorId: Number(juniorId),
                format: options.format,
                dateFrom: options.dateFrom || undefined,
                dateTo: options.dateTo || undefined,
              });
            }}
          />
        </div>
      )}
      {exportJunior.isError && (
        <ErrorRow error={exportJunior.error} fallback="Export failed. Please try again." />
      )}
    </GlassCard>
  );
}

function StaffJuniorReportCard() {
  const query = useAllJuniors();
  return (
    <JuniorReportCard
      juniors={query.data ?? []}
      isLoading={query.isLoading}
      isError={query.isError}
      loadError={query.error}
      description="Pick any junior in the programme to download their individual report."
      emptyMessage="No juniors in the programme yet."
    />
  );
}

function CoachReportsCard({ coachId }: { coachId: string }) {
  const query = useCoachJuniors(coachId);
  return (
    <JuniorReportCard
      juniors={query.data ?? []}
      isLoading={query.isLoading}
      isError={query.isError}
      loadError={query.error}
      description="Pick one of your assigned juniors to download their report."
      emptyMessage="No juniors are assigned to you yet."
    />
  );
}

function ParentReportsCard() {
  const query = useMyChildren();
  const [options, setOptions] = useState(DEFAULT_OPTIONS);
  const exportJunior = useExportJuniorReport();

  if (query.isLoading) return <LoadingCard label="Loading your family…" />;
  if (query.isError) {
    return (
      <GlassCard className="p-4 sm:p-6">
        <ErrorRow error={query.error} fallback="Could not load your family." />
      </GlassCard>
    );
  }

  const children = query.data ?? [];

  return (
    <GlassCard className="space-y-3 p-4 sm:p-6">
      <div>
        <h2 className="text-sm font-bold text-silver">
          {children.length > 1 ? "Your children's reports" : "Your child's report"}
        </h2>
        <p className="mt-1 text-xs text-slate">
          Download a progress report. Leave the dates blank for an all-time report.
        </p>
      </div>
      {children.length === 0 ? (
        <p className="text-sm text-slate">
          No child is linked to your account yet. Add your child from the dashboard first.
        </p>
      ) : (
        <>
          <OptionsRow idPrefix="child" options={options} onChange={setOptions} />
          <ul className="space-y-2">
            {children.map((child) => (
              <li
                key={child.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white/[0.02] px-3 py-2"
              >
                <span className="text-sm font-bold text-silver">{childName(child)}</span>
                <ExportButton
                  label={exportLabel(options.format)}
                  pending={exportJunior.isPending}
                  onClick={() =>
                    exportJunior.mutate({
                      juniorId: child.id,
                      format: options.format,
                      dateFrom: options.dateFrom || undefined,
                      dateTo: options.dateTo || undefined,
                    })
                  }
                />
              </li>
            ))}
          </ul>
        </>
      )}
      {exportJunior.isError && (
        <ErrorRow error={exportJunior.error} fallback="Export failed. Please try again." />
      )}
    </GlassCard>
  );
}

function PlayerReportCard() {
  const junior = useMyJunior();
  const [options, setOptions] = useState(DEFAULT_OPTIONS);
  const exportJunior = useExportJuniorReport();

  if (junior.isLoading) return <LoadingCard label="Loading your profile…" />;
  if (junior.isError || !junior.data) {
    return (
      <GlassCard className="p-10 text-center text-slate">
        No player profile is linked to your account yet — ask the club to set one up.
      </GlassCard>
    );
  }

  const juniorId = junior.data.id;

  return (
    <GlassCard className="space-y-3 p-4 sm:p-6">
      <div>
        <h2 className="text-sm font-bold text-silver">My report</h2>
        <p className="mt-1 text-xs text-slate">
          Download your own progress report. Leave the dates blank for an all-time
          report.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <OptionsRow idPrefix="me" options={options} onChange={setOptions} />
        <ExportButton
          label={exportLabel(options.format)}
          pending={exportJunior.isPending}
          onClick={() =>
            exportJunior.mutate({
              juniorId,
              format: options.format,
              dateFrom: options.dateFrom || undefined,
              dateTo: options.dateTo || undefined,
            })
          }
        />
      </div>
      {exportJunior.isError && (
        <ErrorRow error={exportJunior.error} fallback="Export failed. Please try again." />
      )}
    </GlassCard>
  );
}

export function ReportsPage() {
  const { user } = useAuth();
  if (!user) return null;

  const isStaffReporter = user.role === 'admin' || user.role === 'committee';

  return (
    <div className="mx-auto max-w-4xl animate-fade-in-up space-y-6">
      <header>
        <h1 className="text-2xl font-black text-silver sm:text-3xl">Reports</h1>
        <p className="mt-1 text-sm text-slate">
          Progress reports built by the club, downloaded as Excel or PDF.
        </p>
      </header>

      {isStaffReporter && (
        <>
          <ProgrammeReportCard />
          <StaffJuniorReportCard />
        </>
      )}
      {user.role === 'coach' && <CoachReportsCard coachId={user.id} />}
      {user.role === 'parent' && <ParentReportsCard />}
      {user.role === 'player' && <PlayerReportCard />}
    </div>
  );
}
