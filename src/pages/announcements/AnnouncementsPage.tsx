// Announcements — route /announcements, ALL roles (guarded in App.tsx).
// One feed, two shapes:
//   • admin/committee — composer (internal targeting or public-website post)
//     plus the full feed with audience/status chrome, admin publish of
//     committee-drafted external posts, and author/admin delete.
//   • coach/parent/player — the warm, simple feed the backend already scoped
//     to them (published internal posts targeting their role/band/group).
//
// The backend is the security boundary: family roles never fetch bands,
// contacts or drafts — those lookups mount only inside the staff view.

import { useMemo, useState } from 'react';
import {
  Globe,
  Loader2,
  Megaphone,
  Send,
  Trash2,
  Users,
} from 'lucide-react';

import { ApiError } from '../../lib/api';
import { useAuth } from '../../auth/useAuth';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { GlassCard } from '../../components/ui/GlassCard';
import { useLevelBands } from '../committee/committee-evaluations.queries';
import {
  announcementDate,
  audienceLabel,
  useAnnouncements,
  useCoachContacts,
  useCreateAnnouncement,
  useDeleteAnnouncement,
  usePublishAnnouncement,
  type Announcement,
  type AnnouncementAudience,
  type CreateAnnouncementInput,
} from './announcements.queries';

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

const ALL_ROLES = ['admin', 'coach', 'committee', 'parent', 'player'] as const;

// ── Feed states shared by both views ──────────────────────────────────────────

function FeedLoading() {
  return (
    <div
      className="flex items-center gap-2 text-sm text-slate"
      data-testid="announcements-loading"
    >
      <Loader2 size={18} className="animate-spin text-azure" aria-hidden />
      Loading announcements…
    </div>
  );
}

function FeedError({ error }: { error: unknown }) {
  return (
    <p
      className="rounded-xl bg-red-500/15 p-3 text-sm text-red-400"
      role="alert"
      data-testid="announcements-error"
    >
      {errorMessage(error, 'Could not load announcements.')}
    </p>
  );
}

function FeedEmpty({ staff }: { staff: boolean }) {
  return (
    <GlassCard className="p-8 text-center" data-testid="announcements-empty">
      <Megaphone size={28} className="mx-auto text-azure/60" aria-hidden />
      <p className="mt-3 text-sm font-semibold text-silver">
        No announcements yet
      </p>
      <p className="mx-auto mt-1 max-w-sm text-xs text-slate">
        {staff
          ? 'Post the first one above — club news, schedule changes, or a public website update.'
          : 'Club news and updates will appear here — check back soon.'}
      </p>
    </GlassCard>
  );
}

// ── One announcement card ─────────────────────────────────────────────────────

function AnnouncementCard({
  a,
  staff,
  canPublish,
  canDelete,
  audience,
}: {
  a: Announcement;
  staff: boolean;
  canPublish: boolean;
  canDelete: boolean;
  audience?: string; // staff-only audience summary
}) {
  const publish = usePublishAnnouncement();
  const del = useDeleteAnnouncement();
  const isDraft = a.status === 'draft';

  return (
    <GlassCard
      className="p-5"
      data-testid={`announcement-${a.id}`}
    >
      {staff ? (
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          {a.is_external ? (
            <Badge tone="azure" shape="pill">
              <Globe size={10} className="mr-1" aria-hidden />
              Public website
            </Badge>
          ) : (
            <Badge tone="slate" shape="pill">
              <Users size={10} className="mr-1" aria-hidden />
              {audience ?? 'Everyone'}
            </Badge>
          )}
          {isDraft ? (
            <Badge tone="gold" shape="pill" data-testid={`awaiting-publish-${a.id}`}>
              Awaiting publish
            </Badge>
          ) : null}
        </div>
      ) : null}

      <h3 className="text-lg font-bold text-silver">{a.title}</h3>
      <p className="mt-2 whitespace-pre-wrap text-sm text-silver/90">{a.body}</p>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-slate">
          {a.author_name ?? 'Club staff'}
          {announcementDate(a.published_at ?? a.created_at)
            ? ` · ${announcementDate(a.published_at ?? a.created_at)}`
            : ''}
        </p>

        {staff && (canPublish || canDelete) ? (
          <div className="flex items-center gap-2">
            {canPublish && isDraft ? (
              <Button
                type="button"
                size="sm"
                disabled={publish.isPending}
                onClick={() => publish.mutate(a.id)}
                data-testid={`publish-announcement-${a.id}`}
              >
                {publish.isPending ? (
                  <Loader2 size={14} className="animate-spin" aria-hidden />
                ) : (
                  <Send size={14} aria-hidden />
                )}
                Publish
              </Button>
            ) : null}
            {canDelete ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={del.isPending}
                onClick={() => del.mutate(a.id)}
                data-testid={`delete-announcement-${a.id}`}
              >
                {del.isPending ? (
                  <Loader2 size={14} className="animate-spin" aria-hidden />
                ) : (
                  <Trash2 size={14} aria-hidden />
                )}
                Delete
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      {publish.isError ? (
        <p className="mt-2 text-xs text-red-400" role="alert">
          {errorMessage(publish.error, 'Could not publish this announcement.')}
        </p>
      ) : null}
      {del.isError ? (
        <p className="mt-2 text-xs text-red-400" role="alert">
          {errorMessage(del.error, 'Could not delete this announcement.')}
        </p>
      ) : null}
    </GlassCard>
  );
}

// ── Composer (admin/committee only) ───────────────────────────────────────────

const inputClass =
  'mt-1.5 w-full rounded-xl border border-white/15 bg-navy/60 px-3 py-3 text-sm font-semibold text-silver placeholder:font-normal placeholder:text-slate focus:outline-none focus-visible:ring-2 focus-visible:ring-azure/50';

const labelClass = 'text-xs font-bold uppercase tracking-wider text-slate';

function Composer({
  isAdmin,
  bandOptions,
  coachOptions,
}: {
  isAdmin: boolean;
  bandOptions: { id: number; label: string }[];
  coachOptions: { id: string; label: string }[];
}) {
  const create = useCreateAnnouncement();

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [isExternal, setIsExternal] = useState(false);
  const [audience, setAudience] = useState<AnnouncementAudience>('everyone');
  const [roles, setRoles] = useState<string[]>([]);
  const [bandId, setBandId] = useState<number | ''>('');
  const [coachId, setCoachId] = useState('');
  const [notice, setNotice] = useState<string | null>(null);

  function toggleRole(role: string) {
    setRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role],
    );
  }

  // External posts always target the public site — audience is sent as
  // 'everyone' and the internal targeting picker is hidden entirely.
  const effectiveAudience: AnnouncementAudience = isExternal
    ? 'everyone'
    : audience;

  const valid =
    title.trim().length > 0 &&
    title.trim().length <= 200 &&
    body.trim().length > 0 &&
    (effectiveAudience !== 'roles' || roles.length > 0) &&
    (effectiveAudience !== 'band' || bandId !== '') &&
    (effectiveAudience !== 'coach_group' || coachId !== '');

  function handleSubmit() {
    if (!valid) return;
    const input: CreateAnnouncementInput = {
      title: title.trim(),
      body: body.trim(),
      audience: effectiveAudience,
      is_external: isExternal,
    };
    if (effectiveAudience === 'roles') input.roles = roles;
    if (effectiveAudience === 'band') input.band_id = bandId as number;
    if (effectiveAudience === 'coach_group') input.coach_id = coachId;

    setNotice(null);
    create.mutate(input, {
      onSuccess: (created) => {
        setTitle('');
        setBody('');
        setRoles([]);
        setBandId('');
        setCoachId('');
        setNotice(
          created.status === 'draft'
            ? 'Sent for admin approval — it will appear on the public website once an admin publishes it.'
            : created.is_external
              ? 'Published to the public website.'
              : 'Announcement posted.',
        );
      },
    });
  }

  return (
    <GlassCard className="p-5 sm:p-6" data-testid="announcement-composer">
      <h2 className="text-lg font-bold text-silver">New announcement</h2>

      {/* Internal / external destination */}
      <div className="mt-4 grid grid-cols-2 gap-2" role="group" aria-label="Destination">
        <button
          type="button"
          onClick={() => setIsExternal(false)}
          aria-pressed={!isExternal}
          data-testid="composer-internal"
          className={`rounded-xl border px-3 py-3 text-left transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-azure/50 ${
            !isExternal
              ? 'border-azure/40 bg-azure/15'
              : 'border-white/10 hover:bg-white/5'
          }`}
        >
          <span className="flex items-center gap-2 text-sm font-bold text-silver">
            <Megaphone size={15} className="text-azure" aria-hidden />
            Club feed
          </span>
          <span className="mt-0.5 block text-xs text-slate">
            Members only — goes live immediately
          </span>
        </button>
        <button
          type="button"
          onClick={() => setIsExternal(true)}
          aria-pressed={isExternal}
          data-testid="composer-external"
          className={`rounded-xl border px-3 py-3 text-left transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-azure/50 ${
            isExternal
              ? 'border-azure/40 bg-azure/15'
              : 'border-white/10 hover:bg-white/5'
          }`}
        >
          <span className="flex items-center gap-2 text-sm font-bold text-silver">
            <Globe size={15} className="text-azure" aria-hidden />
            Public website
          </span>
          <span className="mt-0.5 block text-xs text-slate">
            {isAdmin
              ? 'Shown on the landing page'
              : 'Sent to an admin for approval'}
          </span>
        </button>
      </div>

      <div className="mt-4">
        <label htmlFor="announcement-title" className={labelClass}>
          Title
        </label>
        <input
          id="announcement-title"
          type="text"
          maxLength={200}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Junior Challenge tee times this Saturday"
          className={inputClass}
          data-testid="composer-title"
        />
      </div>

      <div className="mt-4">
        <label htmlFor="announcement-body" className={labelClass}>
          Message
        </label>
        <textarea
          id="announcement-body"
          rows={4}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="What does the club need to know?"
          className={inputClass}
          data-testid="composer-body"
        />
      </div>

      {/* Audience targeting — internal posts only */}
      {!isExternal ? (
        <div className="mt-4">
          <label htmlFor="announcement-audience" className={labelClass}>
            Who should see this?
          </label>
          <select
            id="announcement-audience"
            value={audience}
            onChange={(e) => setAudience(e.target.value as AnnouncementAudience)}
            className={inputClass}
            data-testid="composer-audience"
          >
            <option value="everyone" className="bg-navy">
              Everyone
            </option>
            <option value="roles" className="bg-navy">
              Specific roles
            </option>
            <option value="band" className="bg-navy">
              A level band
            </option>
            <option value="coach_group" className="bg-navy">
              A coaching group
            </option>
          </select>

          {audience === 'roles' ? (
            <fieldset className="mt-3">
              <legend className="sr-only">Roles</legend>
              <div className="flex flex-wrap gap-2" data-testid="composer-roles">
                {ALL_ROLES.map((role) => {
                  const checked = roles.includes(role);
                  return (
                    <label
                      key={role}
                      className={`inline-flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold capitalize transition-all ${
                        checked
                          ? 'border-azure/40 bg-azure/15 text-silver'
                          : 'border-white/10 text-slate hover:bg-white/5'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleRole(role)}
                        className="accent-[#0082CD]"
                        data-testid={`composer-role-${role}`}
                      />
                      {role}
                    </label>
                  );
                })}
              </div>
            </fieldset>
          ) : null}

          {audience === 'band' ? (
            <div className="mt-3">
              <label htmlFor="announcement-band" className={labelClass}>
                Level band
              </label>
              <select
                id="announcement-band"
                value={bandId}
                onChange={(e) =>
                  setBandId(e.target.value === '' ? '' : Number(e.target.value))
                }
                className={inputClass}
                data-testid="composer-band"
              >
                <option value="" className="bg-navy">
                  Choose a band…
                </option>
                {bandOptions.map((b) => (
                  <option key={b.id} value={b.id} className="bg-navy">
                    {b.label}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          {audience === 'coach_group' ? (
            <div className="mt-3">
              <label htmlFor="announcement-coach" className={labelClass}>
                Coach
              </label>
              <select
                id="announcement-coach"
                value={coachId}
                onChange={(e) => setCoachId(e.target.value)}
                className={inputClass}
                data-testid="composer-coach"
              >
                <option value="" className="bg-navy">
                  Choose a coach…
                </option>
                {coachOptions.map((c) => (
                  <option key={c.id} value={c.id} className="bg-navy">
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="mt-5">
        <Button
          type="button"
          fullWidth
          disabled={!valid || create.isPending}
          onClick={handleSubmit}
          data-testid="composer-submit"
        >
          {create.isPending ? (
            <>
              <Loader2 size={16} className="animate-spin" aria-hidden />
              Posting…
            </>
          ) : (
            <>
              <Send size={16} aria-hidden />
              {isExternal && !isAdmin ? 'Send for approval' : 'Post announcement'}
            </>
          )}
        </Button>

        {notice ? (
          <p
            className="mt-3 rounded-xl bg-emerald-500/15 p-3 text-sm font-semibold text-emerald-400"
            role="status"
            data-testid="composer-notice"
          >
            {notice}
          </p>
        ) : null}
        {create.isError ? (
          <p
            className="mt-3 rounded-xl bg-red-500/15 p-3 text-sm text-red-400"
            role="alert"
            data-testid="composer-error"
          >
            {errorMessage(create.error, 'Could not post the announcement.')}
          </p>
        ) : null}
      </div>
    </GlassCard>
  );
}

// ── Staff view (admin/committee) — composer + full feed with chrome ───────────

function StaffView() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const feed = useAnnouncements();
  const bands = useLevelBands();
  const coaches = useCoachContacts();

  const bandOptions = useMemo(
    () =>
      (bands.data ?? []).map((b) => ({
        id: b.id,
        label: `${b.band_label} (${b.name})`,
      })),
    [bands.data],
  );
  const coachOptions = useMemo(
    () =>
      (coaches.data ?? []).map((c) => ({ id: c.user_id, label: c.full_name })),
    [coaches.data],
  );

  const bandName = (bandId: number) =>
    (bands.data ?? []).find((b) => b.id === bandId)?.band_label;
  const coachName = (coachId: string) =>
    (coaches.data ?? []).find((c) => c.user_id === coachId)?.full_name;

  const items = feed.data ?? [];

  return (
    <>
      <Composer
        isAdmin={isAdmin}
        bandOptions={bandOptions}
        coachOptions={coachOptions}
      />

      <div className="mt-8 flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-black text-silver">All announcements</h2>
        <span className="text-xs text-slate">newest first</span>
      </div>

      <div className="mt-4">
        {feed.isLoading ? (
          <FeedLoading />
        ) : feed.isError ? (
          <FeedError error={feed.error} />
        ) : items.length === 0 ? (
          <FeedEmpty staff />
        ) : (
          <ul className="flex flex-col gap-4" data-testid="announcements-list">
            {items.map((a) => (
              <li key={a.id}>
                <AnnouncementCard
                  a={a}
                  staff
                  canPublish={isAdmin}
                  canDelete={isAdmin || a.author_id === user?.id}
                  audience={audienceLabel(a, { bandName, coachName })}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

// ── Family/coach view — just the feed, no staff chrome ────────────────────────

function FeedView() {
  const feed = useAnnouncements();
  const items = feed.data ?? [];

  return (
    <div className="mt-6">
      {feed.isLoading ? (
        <FeedLoading />
      ) : feed.isError ? (
        <FeedError error={feed.error} />
      ) : items.length === 0 ? (
        <FeedEmpty staff={false} />
      ) : (
        <ul className="flex flex-col gap-4" data-testid="announcements-list">
          {items.map((a) => (
            <li key={a.id}>
              <AnnouncementCard
                a={a}
                staff={false}
                canPublish={false}
                canDelete={false}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function AnnouncementsPage() {
  const { user } = useAuth();
  const isStaff = user?.role === 'admin' || user?.role === 'committee';

  return (
    <div className="animate-fade-in-up mx-auto max-w-3xl" data-testid="announcements-page">
      <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-azure">
        Club news
      </p>
      <h1 className="mt-1 text-2xl font-black text-silver sm:text-3xl">
        Announcements
      </h1>
      <p className="mt-2 max-w-2xl text-sm text-slate">
        {isStaff
          ? 'Post club news to members — everyone, specific roles, a level band, or one coaching group — or publish to the public website.'
          : 'News and updates from the club, picked for you.'}
      </p>

      <div className="mt-6">{isStaff ? <StaffView /> : <FeedView />}</div>
    </div>
  );
}
