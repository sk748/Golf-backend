// EditChildDetailsCard — "Tell us about your golfer": the small, collapsible
// form where a PARENT keeps the family-owned coaching context fresh on their
// own child's profile. Exactly the four backend-allowed fields (availability,
// experience, medical_conditions, golf_goals — anything else is a 403), sent
// via PUT /api/juniors/:id. Prefills from the child row already on the page;
// fetches nothing extra. No mock data, no other profile fields.

import { useState } from 'react';
import { ChevronDown, Loader2, Send, UserPen } from 'lucide-react';

import { ApiError } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { GlassCard } from '../../components/ui/GlassCard';
import { cn } from '../../lib/cn';
import {
  CHILD_AVAILABILITY_OPTIONS,
  CHILD_EXPERIENCE_OPTIONS,
  childName,
  useUpdateChildDetails,
  type ParentChild,
} from './parent-children.queries';

const inputClass =
  'w-full rounded-xl bg-white/5 px-4 py-3 text-sm text-silver placeholder:text-slate/60 outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-azure/60 disabled:opacity-50';
const labelClass = 'block text-sm font-semibold text-silver';

interface FormState {
  availability: string;
  experience: string;
  medicalConditions: string;
  golfGoals: string;
}

function formFromChild(child: ParentChild): FormState {
  return {
    availability: child.availability ?? '',
    experience: child.experience ?? '',
    medicalConditions: child.medical_conditions ?? '',
    golfGoals: child.golf_goals ?? '',
  };
}

export function EditChildDetailsCard({ child }: { child: ParentChild }) {
  const update = useUpdateChildDetails();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(() => formFromChild(child));
  const [saved, setSaved] = useState(false);

  const name = childName(child);

  const change = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  };

  const submit = () => {
    update.mutate(
      {
        juniorId: child.id,
        availability: form.availability,
        experience: form.experience,
        medical_conditions:
          form.medicalConditions.trim() === ''
            ? null
            : form.medicalConditions.trim(),
        golf_goals:
          form.golfGoals.trim() === '' ? null : form.golfGoals.trim(),
      },
      { onSuccess: () => setSaved(true) },
    );
  };

  return (
    <GlassCard className="p-5 sm:p-6" data-testid="edit-child-details-card">
      {/* Collapsible header */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="edit-child-details-form"
        className="flex w-full items-center gap-2.5 rounded text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-azure/50"
        data-testid="edit-child-details-toggle"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-azure/15">
          <UserPen size={16} className="text-azure" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold text-silver">
            Tell us about your golfer
          </span>
          <span className="block text-xs text-slate">
            Availability, experience, medical notes and goals — helps the
            coaches plan for {name}.
          </span>
        </span>
        <ChevronDown
          size={18}
          className={cn(
            'shrink-0 text-slate transition-transform',
            open && 'rotate-180',
          )}
          aria-hidden
        />
      </button>

      {open ? (
        <div id="edit-child-details-form" className="mt-5">
          <div className="grid gap-4 sm:grid-cols-2">
            {/* Availability */}
            <div>
              <label className={labelClass} htmlFor="child-availability">
                Availability
              </label>
              <select
                id="child-availability"
                className={inputClass + ' mt-1.5'}
                value={form.availability}
                onChange={(e) => change('availability', e.target.value)}
                disabled={update.isPending}
                data-testid="child-availability"
              >
                {CHILD_AVAILABILITY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value} className="bg-navy">
                    {o.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Experience */}
            <div>
              <label className={labelClass} htmlFor="child-experience">
                Golf experience
              </label>
              <select
                id="child-experience"
                className={inputClass + ' mt-1.5'}
                value={form.experience}
                onChange={(e) => change('experience', e.target.value)}
                disabled={update.isPending}
                data-testid="child-experience"
              >
                {CHILD_EXPERIENCE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value} className="bg-navy">
                    {o.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Medical conditions */}
            <div className="sm:col-span-2">
              <label className={labelClass} htmlFor="child-medical">
                Medical conditions
              </label>
              <p className="mt-0.5 text-xs text-slate">
                Visible to club staff so coaches can keep {name} safe.
              </p>
              <textarea
                id="child-medical"
                rows={2}
                className={inputClass + ' mt-1.5 resize-y'}
                value={form.medicalConditions}
                onChange={(e) => change('medicalConditions', e.target.value)}
                placeholder="Allergies, asthma, anything coaches should know…"
                disabled={update.isPending}
                data-testid="child-medical"
              />
            </div>

            {/* Golf goals */}
            <div className="sm:col-span-2">
              <label className={labelClass} htmlFor="child-goals">
                Golf goals
              </label>
              <textarea
                id="child-goals"
                rows={2}
                className={inputClass + ' mt-1.5 resize-y'}
                value={form.golfGoals}
                onChange={(e) => change('golfGoals', e.target.value)}
                placeholder="What would they love to achieve this year?"
                disabled={update.isPending}
                data-testid="child-goals"
              />
            </div>
          </div>

          {update.isError ? (
            <p
              role="alert"
              className="mt-4 rounded-xl bg-red-500/15 p-3 text-sm text-red-400"
              data-testid="child-details-error"
            >
              {update.error instanceof ApiError
                ? update.error.message
                : 'Could not save these details. Please try again.'}
            </p>
          ) : null}

          {saved ? (
            <p
              className="mt-4 rounded-xl bg-emerald-500/10 p-3 text-sm font-semibold text-emerald-300"
              data-testid="child-details-saved"
            >
              Saved — thanks! The coaching team can see the update right away.
            </p>
          ) : null}

          <div className="mt-5">
            <Button
              size="md"
              onClick={submit}
              disabled={update.isPending}
              data-testid="child-details-submit"
            >
              {update.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Send className="h-4 w-4" aria-hidden />
              )}
              {update.isPending ? 'Saving…' : 'Save details'}
            </Button>
          </div>
        </div>
      ) : null}
    </GlassCard>
  );
}
