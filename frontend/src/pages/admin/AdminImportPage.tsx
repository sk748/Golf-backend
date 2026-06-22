// Bulk junior intake import. Admins and committee members paste or upload a CSV
// (or use the textarea fallback), run a dry-run preview to see per-row status,
// then commit the importable rows. Two-step: preview first, commit only after
// an explicit confirmation dialog.
//
// Backend endpoints (both accept JSON { csv: string }):
//   POST /api/juniors/import/preview  — no writes
//   POST /api/juniors/import/commit   — creates juniors

import { useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  FileText,
  Loader2,
  Upload,
  X,
} from 'lucide-react';

import { ApiError } from '../../lib/api';
import { cn } from '../../lib/cn';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { GlassCard } from '../../components/ui/GlassCard';
import { fieldClass, labelClass } from '../auth/AuthShell';
import {
  useImportCommit,
  useImportPreview,
  type ImportPreviewRow,
  type ImportPreviewSummary,
  type ImportCommitResult,
  type ImportRowStatus,
} from './admin-import.queries';

// ── Helpers ───────────────────────────────────────────────────────────────────

function apiErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return fallback;
}

// Read a File object as text, returning a Promise<string>.
function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Could not read the file.'));
    reader.readAsText(file);
  });
}

// ── Status chip ───────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<ImportRowStatus, string> = {
  ok: 'bg-emerald-500/15 text-emerald-400',
  warning: 'bg-amber-500/15 text-amber-400',
  error: 'bg-red-500/15 text-red-400',
};

const STATUS_LABELS: Record<ImportRowStatus, string> = {
  ok: 'OK',
  warning: 'Warning',
  error: 'Error',
};

function StatusChip({ status }: { status: ImportRowStatus }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-lg px-2 py-1 text-xs font-bold',
        STATUS_STYLES[status],
      )}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

// ── Summary bar ───────────────────────────────────────────────────────────────

function SummaryBar({ summary }: { summary: ImportPreviewSummary }) {
  return (
    <div className="flex flex-wrap gap-3">
      <span className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500/15 px-3 py-1.5 text-sm font-semibold text-emerald-400">
        <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
        {summary.ok} ready
      </span>
      <span className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500/15 px-3 py-1.5 text-sm font-semibold text-amber-400">
        <AlertTriangle className="h-4 w-4" aria-hidden="true" />
        {summary.warning} warning{summary.warning !== 1 ? 's' : ''}
      </span>
      <span className="inline-flex items-center gap-1.5 rounded-xl bg-red-500/15 px-3 py-1.5 text-sm font-semibold text-red-400">
        <AlertCircle className="h-4 w-4" aria-hidden="true" />
        {summary.error} error{summary.error !== 1 ? 's' : ''}
      </span>
      <span className="inline-flex items-center gap-1.5 rounded-xl bg-white/5 px-3 py-1.5 text-sm font-semibold text-slate">
        {summary.total} total
      </span>
    </div>
  );
}

// ── Preview results table ─────────────────────────────────────────────────────

function PreviewTable({ rows }: { rows: ImportPreviewRow[] }) {
  return (
    <>
      {/* Desktop table */}
      <GlassCard className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr className="border-b border-white/10 text-xs uppercase tracking-wider text-slate">
              <th scope="col" className="px-4 py-3 font-semibold">
                Row
              </th>
              <th scope="col" className="px-4 py-3 font-semibold">
                Name
              </th>
              <th scope="col" className="px-4 py-3 font-semibold">
                DOB
              </th>
              <th scope="col" className="px-4 py-3 font-semibold">
                Parent
              </th>
              <th scope="col" className="px-4 py-3 font-semibold">
                Status
              </th>
              <th scope="col" className="px-4 py-3 font-semibold">
                Notes
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <PreviewTableRow key={row.row_number} row={row} />
            ))}
          </tbody>
        </table>
      </GlassCard>

      {/* Mobile cards */}
      <div className="space-y-3 md:hidden">
        {rows.map((row) => (
          <PreviewMobileCard key={row.row_number} row={row} />
        ))}
      </div>
    </>
  );
}

function PreviewTableRow({ row }: { row: ImportPreviewRow }) {
  const { parsed, parent_match, status, messages, row_number } = row;
  const name =
    [parsed.first_name, parsed.last_name].filter(Boolean).join(' ') || '—';

  return (
    <tr className="border-b border-white/5 last:border-0 hover:bg-white/[0.03]">
      <td className="px-4 py-3 tabular-nums text-slate">{row_number}</td>
      <td className="px-4 py-3">
        <span className="font-semibold text-silver">{name}</span>
        {parsed.synthesized_email && (
          <span className="ml-2 text-xs text-slate">(no email)</span>
        )}
      </td>
      <td className="px-4 py-3 tabular-nums text-silver">
        {parsed.date_of_birth ?? <span className="text-red-400">missing</span>}
      </td>
      <td className="px-4 py-3">
        {parent_match ? (
          <span className="text-emerald-400">{parent_match.name}</span>
        ) : parsed.parent_email ? (
          <span className="text-slate">{parsed.parent_email}</span>
        ) : (
          <span className="text-slate">—</span>
        )}
      </td>
      <td className="px-4 py-3">
        <StatusChip status={status} />
      </td>
      <td className="px-4 py-3">
        {messages.length > 0 ? (
          <ul className="space-y-0.5">
            {messages.map((msg, i) => (
              <li key={i} className="text-xs text-slate">
                {msg}
              </li>
            ))}
          </ul>
        ) : (
          <span className="text-xs text-slate">—</span>
        )}
      </td>
    </tr>
  );
}

function PreviewMobileCard({ row }: { row: ImportPreviewRow }) {
  const { parsed, parent_match, status, messages, row_number } = row;
  const name =
    [parsed.first_name, parsed.last_name].filter(Boolean).join(' ') || '—';

  return (
    <GlassCard className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className="font-semibold text-silver">{name}</span>
          <span className="ml-2 text-xs text-slate">row {row_number}</span>
        </div>
        <StatusChip status={status} />
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
        <dt className="text-slate">DOB</dt>
        <dd className="text-silver tabular-nums">
          {parsed.date_of_birth ?? (
            <span className="text-red-400">missing</span>
          )}
        </dd>
        <dt className="text-slate">Parent</dt>
        <dd className="text-silver">
          {parent_match
            ? parent_match.name
            : parsed.parent_email ?? '—'}
        </dd>
      </dl>
      {messages.length > 0 && (
        <ul className="mt-3 space-y-1">
          {messages.map((msg, i) => (
            <li key={i} className="text-xs text-slate">
              {msg}
            </li>
          ))}
        </ul>
      )}
    </GlassCard>
  );
}

// ── Commit result ─────────────────────────────────────────────────────────────

function CommitResult({ result }: { result: ImportCommitResult }) {
  return (
    <GlassCard className="border border-emerald-500/20 bg-emerald-500/5 p-5">
      <div className="flex items-center gap-3">
        <CheckCircle2
          className="h-5 w-5 shrink-0 text-emerald-400"
          aria-hidden="true"
        />
        <div>
          <p className="font-bold text-silver">Import complete</p>
          <p className="mt-0.5 text-sm text-slate">
            {result.created} junior{result.created !== 1 ? 's' : ''} created
            {result.skipped > 0 && `, ${result.skipped} skipped`}
            {result.errors.length > 0 &&
              `, ${result.errors.length} error${result.errors.length !== 1 ? 's' : ''}`}
            .
          </p>
        </div>
      </div>
      {result.errors.length > 0 && (
        <ul className="mt-4 space-y-1.5">
          {result.errors.map((e) => (
            <li
              key={e.row_number}
              className="flex items-start gap-2 text-sm text-red-400"
            >
              <AlertCircle
                className="mt-0.5 h-4 w-4 shrink-0"
                aria-hidden="true"
              />
              <span>
                Row {e.row_number}: {e.message}
              </span>
            </li>
          ))}
        </ul>
      )}
    </GlassCard>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function AdminImportPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [csvText, setCsvText] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  const [confirmOpen, setConfirmOpen] = useState(false);

  // Track whether a commit has been done so we can disable re-submit.
  const [commitResult, setCommitResult] = useState<ImportCommitResult | null>(
    null,
  );
  const [committed, setCommitted] = useState(false);

  const preview = useImportPreview();
  const commit = useImportCommit();

  // ── File handling ──────────────────────────────────────────────────────────

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileError(null);
    try {
      const text = await readFileAsText(file);
      setCsvText(text);
      setFileName(file.name);
      // Clear any prior preview/commit when a new file is loaded.
      preview.reset();
      setCommitResult(null);
      setCommitted(false);
    } catch {
      setFileError('Could not read the file. Please try the paste option.');
    }
    // Reset the input so the same file can be re-selected after clearing.
    e.target.value = '';
  }

  function clearFile() {
    setCsvText('');
    setFileName(null);
    setFileError(null);
    preview.reset();
    setCommitResult(null);
    setCommitted(false);
  }

  // ── Preview ────────────────────────────────────────────────────────────────

  function handlePreview() {
    const csv = csvText.trim();
    if (!csv) return;
    setCommitResult(null);
    setCommitted(false);
    preview.mutate(csv);
  }

  // ── Commit ─────────────────────────────────────────────────────────────────

  function handleCommitConfirm() {
    setConfirmOpen(false);
    const csv = csvText.trim();
    if (!csv) return;
    commit.mutate(csv, {
      onSuccess: (result) => {
        setCommitResult(result);
        setCommitted(true);
      },
    });
  }

  // ── Derived state ──────────────────────────────────────────────────────────

  const previewData = preview.data;
  const importableCount = previewData
    ? previewData.summary.ok + previewData.summary.warning
    : 0;
  const canCommit =
    !committed &&
    !commit.isPending &&
    importableCount > 0 &&
    csvText.trim().length > 0;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-5xl animate-fade-in-up space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-black text-silver">Bulk junior import</h1>
        <p className="mt-1 text-sm text-slate">
          Upload or paste a CSV to import junior golfer records from the intake
          spreadsheet.
        </p>
      </div>

      {/* Requirement callout */}
      <GlassCard className="border border-amber-500/20 bg-amber-500/5 p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle
            className="mt-0.5 h-5 w-5 shrink-0 text-amber-400"
            aria-hidden="true"
          />
          <div className="space-y-1.5 text-sm">
            <p className="font-semibold text-silver">
              Date of Birth column is required
            </p>
            <p className="text-slate">
              The spreadsheet records age <em>groups</em>, not birthdates. You
              must include a{' '}
              <code className="rounded bg-white/10 px-1 py-0.5 font-mono text-xs text-silver">
                Date of Birth
              </code>{' '}
              column (ISO YYYY-MM-DD format) for every junior. Rows without it
              will come back as <span className="text-red-400">errors</span> and
              will not be imported.
            </p>
            <p className="text-slate">
              Juniors without an email address will receive a synthesised
              placeholder email — these rows import as{' '}
              <span className="text-amber-400">warnings</span> and will still be
              created. The placeholder can be replaced later. Parent linkage is
              matched by membership number or parent email.
            </p>
          </div>
        </div>
      </GlassCard>

      {/* CSV input */}
      <GlassCard className="p-5 sm:p-6">
        <h2 className="mb-4 text-base font-bold text-silver">CSV source</h2>

        {/* File picker */}
        <div>
          <p className={labelClass}>Upload a .csv file</p>
          <div className="flex flex-wrap items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              aria-label="Upload CSV file"
              className="sr-only"
              onChange={handleFileChange}
              data-testid="file-input"
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={committed}
            >
              <Upload className="h-4 w-4" aria-hidden="true" />
              Choose file
            </Button>

            {fileName && (
              <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-silver">
                <FileText className="h-4 w-4 shrink-0 text-slate" aria-hidden="true" />
                <span className="max-w-[200px] truncate">{fileName}</span>
                <button
                  type="button"
                  aria-label="Remove file"
                  onClick={clearFile}
                  className="ml-1 rounded p-0.5 text-slate transition-colors hover:text-silver focus:outline-none focus-visible:ring-1 focus-visible:ring-azure/50"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            )}
          </div>
          {fileError && (
            <p className="mt-2 text-sm text-red-400" role="alert">
              {fileError}
            </p>
          )}
        </div>

        {/* Divider */}
        <div className="my-5 flex items-center gap-3">
          <div className="h-px flex-1 bg-white/10" />
          <span className="text-xs uppercase tracking-wider text-slate">
            or
          </span>
          <div className="h-px flex-1 bg-white/10" />
        </div>

        {/* Textarea fallback */}
        <div>
          <label htmlFor="csv-paste" className={labelClass}>
            Paste CSV directly
          </label>
          <textarea
            id="csv-paste"
            rows={8}
            value={csvText}
            onChange={(e) => {
              setCsvText(e.target.value);
              setFileName(null);
              preview.reset();
              setCommitResult(null);
              setCommitted(false);
            }}
            disabled={committed}
            placeholder={`Junior First Name,Junior Last Name,Date of Birth,Gender,Junior Email,Parent Email\nAmelia,Wanjiku,2012-03-15,Female,,parent@example.com`}
            spellCheck={false}
            className={cn(
              fieldClass,
              'resize-y font-mono text-xs leading-relaxed',
            )}
            data-testid="csv-textarea"
          />
        </div>

        {/* Preview button */}
        <div className="mt-4">
          <Button
            variant="secondary"
            size="sm"
            disabled={!csvText.trim() || preview.isPending || committed}
            onClick={handlePreview}
            data-testid="preview-button"
          >
            {preview.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Analysing…
              </>
            ) : (
              'Preview import'
            )}
          </Button>
        </div>

        {/* Preview error */}
        {preview.isError && (
          <GlassCard
            className="mt-4 border border-red-500/30 bg-red-500/10 p-4"
            role="alert"
          >
            <div className="flex items-center gap-2 text-sm text-red-400">
              <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
              {apiErrorMessage(preview.error, 'Preview failed. Please try again.')}
            </div>
          </GlassCard>
        )}
      </GlassCard>

      {/* Preview results */}
      {previewData && !committed && (
        <div className="space-y-4" data-testid="preview-results">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-silver">Preview results</h2>
              <p className="mt-0.5 text-sm text-slate">
                No changes have been made yet. Review the rows below, then
                import.
              </p>
            </div>
            <SummaryBar summary={previewData.summary} />
          </div>

          <PreviewTable rows={previewData.rows} />

          {/* Commit area */}
          <div className="flex flex-wrap items-center gap-4">
            <Button
              variant="primary"
              size="sm"
              disabled={!canCommit}
              onClick={() => setConfirmOpen(true)}
              data-testid="commit-button"
            >
              Import {importableCount} row{importableCount !== 1 ? 's' : ''}
            </Button>
            {previewData.summary.error > 0 && (
              <p className="text-sm text-slate">
                {previewData.summary.error} row
                {previewData.summary.error !== 1 ? 's' : ''} with errors will
                be skipped.
              </p>
            )}
            {importableCount === 0 && (
              <p className="text-sm text-slate">
                No importable rows — fix the errors above and preview again.
              </p>
            )}
          </div>

          {/* Commit mutation error */}
          {commit.isError && (
            <GlassCard
              className="border border-red-500/30 bg-red-500/10 p-4"
              role="alert"
            >
              <div className="flex items-center gap-2 text-sm text-red-400">
                <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                {apiErrorMessage(
                  commit.error,
                  'Import failed. Please try again.',
                )}
              </div>
            </GlassCard>
          )}
        </div>
      )}

      {/* Commit result */}
      {commitResult && <CommitResult result={commitResult} />}

      {/* After commit: offer to start a new import */}
      {committed && (
        <div>
          <Button
            variant="ghost"
            size="sm"
            onClick={clearFile}
            data-testid="new-import-button"
          >
            Start another import
          </Button>
        </div>
      )}

      {/* Confirm dialog */}
      <ConfirmDialog
        open={confirmOpen}
        title={`Import ${importableCount} junior${importableCount !== 1 ? 's' : ''}?`}
        message={
          <span>
            {previewData?.summary.warning !== undefined &&
            previewData.summary.warning > 0 ? (
              <>
                This will create{' '}
                <strong className="text-silver">
                  {importableCount} junior{importableCount !== 1 ? 's' : ''}
                </strong>{' '}
                ({previewData.summary.ok} clean,{' '}
                {previewData.summary.warning} with synthesised emails).{' '}
                {previewData.summary.error > 0 &&
                  `${previewData.summary.error} error row${previewData.summary.error !== 1 ? 's' : ''} will be skipped. `}
                Junior profiles without a real email can be updated later.
              </>
            ) : (
              <>
                This will create{' '}
                <strong className="text-silver">
                  {importableCount} junior{importableCount !== 1 ? 's' : ''}
                </strong>
                .{' '}
                {previewData?.summary.error !== undefined &&
                  previewData.summary.error > 0 &&
                  `${previewData.summary.error} error row${previewData.summary.error !== 1 ? 's' : ''} will be skipped. `}
                This action cannot be undone.
              </>
            )}
          </span>
        }
        confirmLabel={
          commit.isPending
            ? 'Importing…'
            : `Import ${importableCount} row${importableCount !== 1 ? 's' : ''}`
        }
        busy={commit.isPending}
        onConfirm={handleCommitConfirm}
        onCancel={() => setConfirmOpen(false)}
        data-testid="import-confirm-dialog"
      />
    </div>
  );
}
