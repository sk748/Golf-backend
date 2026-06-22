// AwardBadgeCard — staff tool to award and revoke recognition badges for one junior.
// Roles: admin, coach, committee. Wired into the staff junior-profile page.
//
// Awarding fires a celebration on the backend (confetti + notification to the
// player and their parent), so this is a meaningful, encouraging action.

import { useState } from 'react';
import { Award, Medal, Loader2, AlertCircle } from 'lucide-react';

import { GlassCard } from '../../components/ui/GlassCard';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import {
  useBadges,
  useJuniorBadges,
  useAwardBadge,
  useRevokeBadge,
} from './badges.queries';
import { relativeTime } from '../../lib/time';

// ── Props ─────────────────────────────────────────────────────────────────────

export interface AwardBadgeCardProps {
  juniorId: number;
  juniorName?: string;
}

// ── Date formatting ───────────────────────────────────────────────────────────

function formatAwardedDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

// ── Skeleton loader ───────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <div className="flex animate-pulse items-center gap-3 py-2">
      <div className="h-8 w-8 rounded-full bg-white/10" />
      <div className="flex-1 space-y-1.5">
        <div className="h-3 w-36 rounded bg-white/10" />
        <div className="h-2 w-24 rounded bg-white/8" />
      </div>
      <div className="h-7 w-16 rounded-xl bg-white/10" />
    </div>
  );
}

// ── Revoke confirmation state ─────────────────────────────────────────────────

interface RevokeTarget {
  badgeId: number;
  badgeName: string;
}

// ── Main export ───────────────────────────────────────────────────────────────

export function AwardBadgeCard({ juniorId, juniorName }: AwardBadgeCardProps) {
  const displayName = juniorName ?? 'this junior';

  // Server state
  const catalog = useBadges();
  const held = useJuniorBadges(juniorId);
  const awardMutation = useAwardBadge(juniorId);
  const revokeMutation = useRevokeBadge(juniorId);

  // Local UI state
  const [selectedBadgeId, setSelectedBadgeId] = useState<number | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<RevokeTarget | null>(null);

  // ── Loading ──
  const isLoading = catalog.isLoading || held.isLoading;
  if (isLoading) {
    return (
      <GlassCard className="p-5">
        <div className="mb-4 flex items-center gap-2">
          <div className="h-4.5 w-4.5 rounded bg-white/10" />
          <div className="h-4 w-28 rounded bg-white/10 animate-pulse" />
        </div>
        <SkeletonRow />
        <SkeletonRow />
      </GlassCard>
    );
  }

  // ── Error ──
  const loadError = catalog.error ?? held.error;
  if (catalog.isError || held.isError) {
    return (
      <GlassCard className="p-5">
        <div className="flex items-start gap-3">
          <AlertCircle size={18} className="mt-0.5 shrink-0 text-red-400" aria-hidden />
          <p className="text-sm text-red-400">
            Could not load badges:{' '}
            {(loadError as Error | null)?.message ?? 'Unknown error'}
          </p>
        </div>
      </GlassCard>
    );
  }

  const allBadges = catalog.data ?? [];
  const juniorBadges = held.data ?? [];

  // Build a lookup: badge_id → catalog entry
  const catalogMap = new Map(allBadges.map((b) => [b.id, b]));
  // Set of held badge IDs for O(1) membership check
  const heldIds = new Set(juniorBadges.map((jb) => jb.badge_id));
  // Badges available to award (not yet held)
  const available = allBadges.filter((b) => !heldIds.has(b.id));

  // ── Handlers ──

  function handleAward() {
    if (selectedBadgeId == null) return;
    awardMutation.mutate(selectedBadgeId, {
      onSuccess: () => setSelectedBadgeId(null),
    });
  }

  function handleRevokeConfirm() {
    if (!revokeTarget) return;
    revokeMutation.mutate(revokeTarget.badgeId, {
      onSuccess: () => setRevokeTarget(null),
      onError: () => setRevokeTarget(null),
    });
  }

  const isAwarding = awardMutation.isPending;
  const isRevoking = revokeMutation.isPending;

  // ── Render ──

  return (
    <>
      <GlassCard className="p-5">
        {/* Header */}
        <div className="mb-1 flex items-center gap-2">
          <Award size={18} className="shrink-0 text-gold" aria-hidden />
          <h3 className="font-bold text-silver">Badges</h3>
        </div>
        <p className="mb-5 text-xs text-slate">
          Awarding a badge celebrates {displayName} and notifies their parent.
        </p>

        {/* ── Section: Badges earned ── */}
        <section aria-label="Badges earned">
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate">
            Badges earned
          </p>

          {juniorBadges.length === 0 ? (
            <div className="mb-5 rounded-xl bg-white/5 px-4 py-4 text-center">
              <Medal size={22} className="mx-auto mb-1.5 text-white/20" aria-hidden />
              <p className="text-sm text-slate">
                No badges yet — recognise{' '}
                <span className="font-semibold text-silver">{displayName}</span> for
                great progress.
              </p>
            </div>
          ) : (
            <ul className="mb-5 divide-y divide-white/8" role="list">
              {juniorBadges.map((jb) => {
                const badgeInfo = catalogMap.get(jb.badge_id);
                const name = badgeInfo?.name ?? `Badge #${jb.badge_id}`;
                const description = badgeInfo?.description;
                const levelReq = badgeInfo?.level_required;
                const isThisRevoking =
                  isRevoking && revokeTarget?.badgeId === jb.badge_id;

                return (
                  <li
                    key={jb.badge_id}
                    className="flex items-start gap-3 py-3 first:pt-0 last:pb-0"
                  >
                    {/* Badge icon */}
                    <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gold/10 text-gold">
                      <Medal size={18} aria-hidden />
                    </span>

                    {/* Badge info */}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-silver">{name}</span>
                        {levelReq != null && (
                          <Badge tone="azure" shape="pill">
                            L{levelReq}+
                          </Badge>
                        )}
                      </div>
                      {description && (
                        <p className="mt-0.5 text-xs text-slate">{description}</p>
                      )}
                      <p className="mt-1 text-xs text-slate/60">
                        Awarded {formatAwardedDate(jb.awarded_date)}
                        {' · '}
                        <span title={jb.awarded_date}>{relativeTime(jb.awarded_date)}</span>
                        {' · by '}
                        <span className="text-slate">{jb.awarded_by}</span>
                      </p>
                    </div>

                    {/* Revoke */}
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={isRevoking}
                      aria-label={`Revoke badge: ${name}`}
                      className="shrink-0 border-red-500/20 text-red-400 hover:bg-red-500/10 hover:border-red-500/40"
                      onClick={() =>
                        setRevokeTarget({ badgeId: jb.badge_id, badgeName: name })
                      }
                    >
                      {isThisRevoking ? (
                        <Loader2 size={14} className="animate-spin" aria-hidden />
                      ) : null}
                      Revoke
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Divider */}
        <div className="mb-5 border-t border-white/8" />

        {/* ── Section: Award a badge ── */}
        <section aria-label="Award a badge">
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate">
            Award a badge
          </p>

          {allBadges.length === 0 ? (
            <p className="text-sm text-slate">
              No badges available yet. An admin can add them on the Badges page.
            </p>
          ) : available.length === 0 ? (
            <div className="rounded-xl bg-emerald-500/8 px-4 py-3 text-center">
              <p className="text-sm font-semibold text-emerald-400">
                All available badges awarded.
              </p>
              <p className="mt-0.5 text-xs text-emerald-400/60">
                {displayName} has earned every badge in the catalog.
              </p>
            </div>
          ) : (
            <>
              {/* Chip list */}
              <div
                className="mb-4 flex flex-wrap gap-2"
                role="listbox"
                aria-label="Select a badge to award"
                aria-activedescendant={
                  selectedBadgeId != null
                    ? `badge-chip-${selectedBadgeId}`
                    : undefined
                }
              >
                {available.map((b) => {
                  const isSelected = selectedBadgeId === b.id;
                  return (
                    <button
                      key={b.id}
                      id={`badge-chip-${b.id}`}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      disabled={isAwarding}
                      onClick={() =>
                        setSelectedBadgeId(isSelected ? null : b.id)
                      }
                      title={b.description ?? b.name}
                      className={[
                        'inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-semibold transition-all',
                        'focus:outline-none focus-visible:ring-2 focus-visible:ring-azure/50',
                        'disabled:pointer-events-none disabled:opacity-50',
                        isSelected
                          ? 'border-gold bg-gold/15 text-gold'
                          : 'border-white/15 bg-white/5 text-silver hover:border-gold/40 hover:bg-gold/8 hover:text-gold',
                      ].join(' ')}
                    >
                      <Medal size={14} aria-hidden />
                      {b.name}
                      {b.level_required != null && (
                        <span className="ml-0.5 text-xs font-normal opacity-60">
                          L{b.level_required}+
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Award action */}
              <div className="flex items-center gap-3">
                <Button
                  variant="gold"
                  size="sm"
                  disabled={selectedBadgeId == null || isAwarding}
                  onClick={handleAward}
                  className="min-w-[120px]"
                  aria-label={
                    selectedBadgeId != null
                      ? `Award badge: ${catalogMap.get(selectedBadgeId)?.name ?? ''}`
                      : 'Select a badge above to award'
                  }
                >
                  {isAwarding ? (
                    <>
                      <Loader2 size={14} className="animate-spin" aria-hidden />
                      Awarding…
                    </>
                  ) : (
                    <>
                      <Award size={14} aria-hidden />
                      Award badge
                    </>
                  )}
                </Button>

                {awardMutation.isError && (
                  <p className="text-xs text-red-400" role="alert">
                    {(awardMutation.error as Error)?.message ?? 'Award failed'}
                  </p>
                )}

                {awardMutation.isSuccess && !isAwarding && (
                  <p className="text-xs text-emerald-400" role="status">
                    Badge awarded!
                  </p>
                )}
              </div>

              {selectedBadgeId == null && (
                <p className="mt-2 text-xs text-slate/60">
                  Select a badge above, then click Award.
                </p>
              )}
            </>
          )}
        </section>
      </GlassCard>

      {/* Revoke confirmation dialog — rendered outside the card via a portal */}
      <ConfirmDialog
        open={revokeTarget != null}
        title="Revoke badge?"
        message={
          <>
            This will remove the{' '}
            <strong className="text-silver">{revokeTarget?.badgeName}</strong> badge
            from{' '}
            <strong className="text-silver">{displayName}</strong>. The junior will
            not be notified — revoke quietly if needed.
          </>
        }
        confirmLabel="Revoke badge"
        cancelLabel="Keep badge"
        destructive
        busy={isRevoking}
        onConfirm={handleRevokeConfirm}
        onCancel={() => !isRevoking && setRevokeTarget(null)}
      />
    </>
  );
}
