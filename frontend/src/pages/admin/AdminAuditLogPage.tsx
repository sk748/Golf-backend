import { useState } from 'react';
import {
  ClipboardCheck,
  Flag,
  GraduationCap,
  Loader2,
  ScrollText,
  Trophy,
  UserPlus,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { ApiError } from '../../lib/api';
import { cn } from '../../lib/cn';
import { relativeTime } from '../../lib/time';
import { Button } from '../../components/ui/Button';
import { GlassCard } from '../../components/ui/GlassCard';
import { useAuditLog } from './admin-audit.queries';

const PAGE = 50;

const CATEGORIES: { value: string; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'user', label: 'Users' },
  { value: 'evaluation', label: 'Evaluations' },
  { value: 'tournament', label: 'Tournaments' },
  { value: 'round', label: 'Rounds' },
  { value: 'junior', label: 'Juniors' },
];

const ICON: Record<string, LucideIcon> = {
  user: UserPlus,
  evaluation: ClipboardCheck,
  tournament: Trophy,
  round: Flag,
  junior: GraduationCap,
};

function iconFor(category: string): LucideIcon {
  return ICON[category] ?? ScrollText;
}

export function AdminAuditLogPage() {
  const [category, setCategory] = useState('');
  const [limit, setLimit] = useState(PAGE);

  const { data, isLoading, isError, error } = useAuditLog(limit, category || undefined);
  const entries = data ?? [];
  const canLoadMore = entries.length === limit;

  return (
    <div className="mx-auto max-w-4xl animate-fade-in-up">
      <div className="flex items-center gap-2 text-slate">
        <ScrollText size={18} className="text-azure" />
        <h1 className="text-2xl font-black text-silver">Audit log</h1>
      </div>
      <p className="mt-1 text-sm text-slate">
        A record of who did what, across the club — newest first.
      </p>

      {/* Category filter */}
      <div className="mt-5 flex flex-wrap gap-2">
        {CATEGORIES.map((c) => {
          const active = category === c.value;
          return (
            <button
              key={c.value || 'all'}
              type="button"
              onClick={() => {
                setCategory(c.value);
                setLimit(PAGE);
              }}
              data-testid={`audit-filter-${c.value || 'all'}`}
              className={cn(
                'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                active
                  ? 'bg-azure text-white'
                  : 'glass text-slate hover:text-silver',
              )}
            >
              {c.label}
            </button>
          );
        })}
      </div>

      <GlassCard className="mt-5 p-5">
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-slate" data-testid="audit-loading">
            <Loader2 size={18} className="animate-spin text-azure" />
            Loading audit log…
          </div>
        ) : isError ? (
          <div
            role="alert"
            className="rounded-xl bg-red-500/15 p-3 text-sm text-red-400"
            data-testid="audit-error"
          >
            {error instanceof ApiError ? error.message : 'Could not load the audit log.'}
          </div>
        ) : entries.length === 0 ? (
          <p className="text-sm text-slate" data-testid="audit-empty">
            No activity recorded yet.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-white/5" data-testid="audit-list">
            {entries.map((e) => {
              const Icon = iconFor(e.category);
              return (
                <li
                  key={e.id}
                  className="flex items-start gap-3 py-3 first:pt-0 last:pb-0"
                  data-testid={`audit-entry-${e.id}`}
                >
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-azure/15">
                    <Icon size={16} className="text-azure" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-silver">{e.description}</p>
                    <p className="mt-0.5 text-xs text-slate">
                      {e.actor_name}
                      {e.actor_role ? ` · ${e.actor_role}` : ''} · {relativeTime(e.created_at)}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </GlassCard>

      {canLoadMore && (
        <div className="mt-4 flex justify-center">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setLimit((l) => l + PAGE)}
            data-testid="audit-load-more"
          >
            Load more
          </Button>
        </div>
      )}
    </div>
  );
}
