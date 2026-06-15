import { useState } from 'react';
import { X } from 'lucide-react';

import { ApiError } from '../../lib/api';
import { useAuth } from '../../auth/useAuth';
import { Button } from '../../components/ui/Button';
import { fieldClass, labelClass } from '../auth/AuthShell';
import { useLevelBands } from '../committee/committee-evaluations.queries';
import {
  useAllJuniors,
  useCoachJuniors,
  useCoachUsers,
} from '../admin/coach-assignment.queries';
import {
  useCreateEvent,
  type EventAudience,
  type EventInput,
} from './events.queries';

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

// The audiences each role may create. admin + committee get the full set; a
// coach may only target their own coaching group or one of their own juniors.
// (Backend enforces this too; the UI just never offers the disallowed options.)
function audiencesFor(role: string | undefined): EventAudience[] {
  if (role === 'admin' || role === 'committee') {
    return ['everyone', 'band', 'coach_group', 'individual'];
  }
  if (role === 'coach') return ['coach_group', 'individual'];
  return [];
}

const AUDIENCE_OPTION_LABELS: Record<EventAudience, string> = {
  everyone: 'Everyone',
  band: 'A band',
  coach_group: 'A coaching group',
  individual: 'One junior',
};

// A toggle row reused for the two booleans (mandatory / RSVP required).
function ToggleRow({
  id,
  label,
  hint,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label
      htmlFor={id}
      className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 p-3"
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 accent-azure"
        data-testid={`event-${id}`}
      />
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-silver">{label}</span>
        <span className="block text-xs text-slate">{hint}</span>
      </span>
    </label>
  );
}

export function CreateEventModal({
  defaultDate,
  onClose,
}: {
  defaultDate: string;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const role = user?.role;
  const isStaff = role === 'admin' || role === 'committee';
  const isCoach = role === 'coach';
  const audiences = audiencesFor(role);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [date, setDate] = useState(defaultDate);
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [audience, setAudience] = useState<EventAudience>(audiences[0] ?? 'everyone');
  const [bandId, setBandId] = useState('');
  const [coachId, setCoachId] = useState('');
  const [juniorId, setJuniorId] = useState('');
  const [rsvpRequired, setRsvpRequired] = useState(false);
  const [mandatory, setMandatory] = useState(false);

  // Conditional picker data — mounted (and fetched) only when the chosen
  // audience needs it, so a coach never requests the club-wide juniors list.
  const bands = useLevelBands();
  const staffCoaches = useCoachUsers();
  const allJuniors = useAllJuniors(isStaff && audience === 'individual');
  const coachJuniors = useCoachJuniors(
    isCoach && audience === 'individual' ? user?.id : undefined,
  );
  const juniorOptions = isCoach ? coachJuniors.data ?? [] : allJuniors.data ?? [];

  const create = useCreateEvent();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !date) return;

    const body: EventInput = {
      title: title.trim(),
      date,
      audience,
      description: description.trim() || undefined,
      location: location.trim() || undefined,
      start_time: startTime || undefined,
      end_time: endTime || undefined,
      rsvp_required: rsvpRequired,
      mandatory,
    };

    if (audience === 'band') body.band_id = bandId ? Number(bandId) : undefined;
    if (audience === 'coach_group') {
      // A coach's group is implicitly themselves; staff pick a coach.
      body.coach_id = isCoach ? user?.id : coachId || undefined;
    }
    if (audience === 'individual') {
      body.junior_id = juniorId ? Number(juniorId) : undefined;
    }

    create.mutate(body, { onSuccess: () => onClose() });
  }

  // Disable submit until the audience's required target is chosen.
  const needsBand = audience === 'band' && !bandId;
  const needsCoach = isStaff && audience === 'coach_group' && !coachId;
  const needsJunior = audience === 'individual' && !juniorId;
  const canSubmit =
    Boolean(title.trim() && date) && !needsBand && !needsCoach && !needsJunior;

  return (
    <>
      {/* Transparent click-catcher — never dims the background (house rule). */}
      <button
        type="button"
        aria-hidden="true"
        tabIndex={-1}
        onClick={onClose}
        className="fixed inset-0 z-40 cursor-default"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Create event"
        className="fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[min(32rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-white/10 bg-navy/95 p-5 shadow-2xl backdrop-blur"
        data-testid="create-event-modal"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-black text-silver">New event</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1 text-slate hover:bg-white/5 hover:text-silver"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label htmlFor="event-title" className={labelClass}>
              Title
            </label>
            <input
              id="event-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={fieldClass}
              placeholder="e.g. Junior clinic"
              required
              data-testid="event-title"
            />
          </div>

          <div>
            <label htmlFor="event-description" className={labelClass}>
              Description <span className="text-slate">(optional)</span>
            </label>
            <textarea
              id="event-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className={`${fieldClass} min-h-[4.5rem] resize-y`}
              placeholder="What's happening?"
            />
          </div>

          <div>
            <label htmlFor="event-location" className={labelClass}>
              Location <span className="text-slate">(optional)</span>
            </label>
            <input
              id="event-location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className={fieldClass}
              placeholder="e.g. Practice range"
            />
          </div>

          <div>
            <label htmlFor="event-date" className={labelClass}>
              Date
            </label>
            <input
              id="event-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className={fieldClass}
              required
              data-testid="event-date"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="event-start" className={labelClass}>
                Start <span className="text-slate">(optional)</span>
              </label>
              <input
                id="event-start"
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className={fieldClass}
              />
            </div>
            <div>
              <label htmlFor="event-end" className={labelClass}>
                End <span className="text-slate">(optional)</span>
              </label>
              <input
                id="event-end"
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className={fieldClass}
              />
            </div>
          </div>

          <div>
            <label htmlFor="event-audience" className={labelClass}>
              Who's it for?
            </label>
            <select
              id="event-audience"
              value={audience}
              onChange={(e) => setAudience(e.target.value as EventAudience)}
              className={fieldClass}
              data-testid="event-audience"
            >
              {audiences.map((a) => (
                <option key={a} value={a}>
                  {AUDIENCE_OPTION_LABELS[a]}
                </option>
              ))}
            </select>
          </div>

          {/* Conditional target pickers. */}
          {audience === 'band' && (
            <div>
              <label htmlFor="event-band" className={labelClass}>
                Band
              </label>
              <select
                id="event-band"
                value={bandId}
                onChange={(e) => setBandId(e.target.value)}
                className={fieldClass}
                disabled={bands.isLoading}
                data-testid="event-band"
              >
                <option value="">
                  {bands.isLoading ? 'Loading bands…' : 'Choose a band…'}
                </option>
                {(bands.data ?? []).map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.band_label} — {b.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {isStaff && audience === 'coach_group' && (
            <div>
              <label htmlFor="event-coach" className={labelClass}>
                Coach
              </label>
              <select
                id="event-coach"
                value={coachId}
                onChange={(e) => setCoachId(e.target.value)}
                className={fieldClass}
                disabled={staffCoaches.isLoading}
                data-testid="event-coach"
              >
                <option value="">
                  {staffCoaches.isLoading ? 'Loading coaches…' : 'Choose a coach…'}
                </option>
                {(staffCoaches.data ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.full_name || c.email}
                  </option>
                ))}
              </select>
            </div>
          )}

          {audience === 'individual' && (
            <div>
              <label htmlFor="event-junior" className={labelClass}>
                Junior
              </label>
              <select
                id="event-junior"
                value={juniorId}
                onChange={(e) => setJuniorId(e.target.value)}
                className={fieldClass}
                disabled={isCoach ? coachJuniors.isLoading : allJuniors.isLoading}
                data-testid="event-junior"
              >
                <option value="">
                  {(isCoach ? coachJuniors.isLoading : allJuniors.isLoading)
                    ? 'Loading juniors…'
                    : 'Choose a junior…'}
                </option>
                {juniorOptions.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.full_name || `Golfer #${j.id}`}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="space-y-2">
            <ToggleRow
              id="rsvp"
              label="Ask for RSVPs"
              hint="Invitees can mark whether they're coming."
              checked={rsvpRequired}
              onChange={setRsvpRequired}
            />
            <ToggleRow
              id="mandatory"
              label="Mandatory"
              hint="Flag this as required attendance."
              checked={mandatory}
              onChange={setMandatory}
            />
          </div>

          {create.isError && (
            <p
              className="rounded-xl bg-red-500/15 p-3 text-sm text-red-400"
              role="alert"
              data-testid="event-create-error"
            >
              {errorMessage(create.error, 'Could not create the event.')}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={!canSubmit || create.isPending}
              data-testid="event-create-submit"
            >
              {create.isPending ? 'Creating…' : 'Create event'}
            </Button>
          </div>
        </form>
      </div>
    </>
  );
}
