import { redirect } from 'next/navigation';
import {
  Button,
  Card,
  CheckboxGroup,
  ErrorSummary,
  Field,
  InsetText,
  PageHeader,
  RadioGroup,
  RuleTag,
  TextInput,
} from '@/components/ui';
import { currentUser } from '@/lib/auth';
import { RULES } from '@/lib/feasibility';
import { addDays, toIsoDate } from '@/lib/dates';
import { createTripAction } from '../../actions';

export const metadata = { title: 'Plan a trip' };

const ERROR_LABELS: Record<string, string> = {
  title: 'Give the trip a name so you can tell it apart from your others.',
  preferred_date: 'Enter a valid preferred date.',
  alternate_date: 'One of your alternate dates is not a valid date.',
  students: 'Enter how many students are coming — at least one.',
  teachers: 'At least one teacher has to travel with the group.',
  grade_band: 'Choose a grade level.',
  arrival_method: 'Choose how the group is getting to Washington.',
  wants_nothing: 'Choose at least one of a tour or a meeting, otherwise there is nothing to request.',
};

export default async function NewTripPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await currentUser();
  if (!user) redirect('/signin');

  const { error } = await searchParams;
  const errors = (error?.split(',') ?? [])
    .map((code) => ERROR_LABELS[code])
    .filter((label): label is string => Boolean(label));

  const today = toIsoDate(new Date());
  const suggested = addDays(today, 100);

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <PageHeader
        title="Plan a trip"
        lede="Answer these once. We work out what is actually possible, generate the right requests, and give you a dated critical path."
      />

      <ErrorSummary errors={errors} />

      <form action={createTripAction} className="space-y-8">
        {/* ---------------------------------------------------------------- */}
        <Card>
          <h2 className="text-xl font-bold">The basics</h2>

          <div className="mt-5 space-y-6">
            <Field
              label="Trip name"
              name="title"
              required
              hint="Something you will recognise later, like “8th Grade Civics — Capitol Trip”."
            >
              <TextInput name="title" required />
            </Field>
          </div>
        </Card>

        {/* ---------------------------------------------------------------- */}
        <Card>
          <h2 className="text-xl font-bold">Dates</h2>
          <p className="mt-1 text-slate-600">
            Give us two alternates. Offices very often come back with a different date, and having
            alternates ready is the difference between a quick yes and starting over.
          </p>

          <div className="mt-5 grid gap-6 sm:grid-cols-3">
            <Field label="Preferred date" name="preferred_date" required>
              <TextInput name="preferred_date" type="date" defaultValue={suggested} required />
            </Field>
            <Field label="Alternate 1" name="alternate_date_1">
              <TextInput name="alternate_date_1" type="date" defaultValue={addDays(suggested, 7)} />
            </Field>
            <Field label="Alternate 2" name="alternate_date_2">
              <TextInput name="alternate_date_2" type="date" defaultValue={addDays(suggested, 14)} />
            </Field>
          </div>

          <div className="mt-5">
            <InsetText>
              <p className="text-slate-600">
                The Capitol is closed to tours on Sundays and federal holidays{' '}
                <RuleTag id="R8" />. Saturday tours run, but congressional offices are generally not
                staffed, so a staff-led tour or a meeting is unlikely on a Saturday. We check all of
                this against the dates you give us.
              </p>
            </InsetText>
          </div>
        </Card>

        {/* ---------------------------------------------------------------- */}
        <Card>
          <h2 className="text-xl font-bold">Who is coming</h2>
          <p className="mt-1 text-slate-600">
            Count everybody. The {RULES.staffLedMaxGuests.value}-guest limit on a staff-led tour
            includes teachers and chaperones, not just students <RuleTag id="R1" /> — this is the
            single most common surprise in this whole process.
          </p>

          <div className="mt-5 grid gap-6 sm:grid-cols-3">
            <Field label="Students" name="students" required>
              <TextInput name="students" type="number" min={1} max={500} required inputMode="numeric" />
            </Field>
            <Field label="Teachers" name="teachers" required>
              <TextInput name="teachers" type="number" min={1} max={50} defaultValue={1} required inputMode="numeric" />
            </Field>
            <Field label="Chaperones" name="chaperones">
              <TextInput name="chaperones" type="number" min={0} max={100} defaultValue={0} inputMode="numeric" />
            </Field>
          </div>

          <div className="mt-6">
            <RadioGroup
              legend="Grade level"
              name="grade_band"
              defaultValue="middle"
              options={[
                { value: 'elementary', label: 'Elementary' },
                { value: 'middle', label: 'Middle school' },
                { value: 'high', label: 'High school' },
                { value: 'mixed', label: 'Mixed grades' },
              ]}
              hint="We use this for the suggested chaperone ratio. Your district's own policy always takes precedence."
            />
          </div>
        </Card>

        {/* ---------------------------------------------------------------- */}
        <Card>
          <h2 className="text-xl font-bold">Getting there</h2>

          <div className="mt-5">
            <RadioGroup
              legend="How is the group arriving?"
              name="arrival_method"
              defaultValue="charter_bus"
              options={[
                {
                  value: 'charter_bus',
                  label: 'Charter bus',
                  hint: 'We will warn you about drop-off and the fact that there is nowhere to park.',
                },
                { value: 'amtrak', label: 'Train — arriving Union Station' },
                { value: 'flying', label: 'Flying into the DC area' },
                { value: 'local', label: 'Local — already in the DC area' },
              ]}
            />
          </div>

          <div className="mt-6">
            <CheckboxGroup
              legend="Accessibility needs"
              name="accessibility"
              hint="Visitors with disabilities go through a separate screening process, and accommodations can be arranged in advance if the office knows. We include this on every request."
              options={[
                { value: 'wheelchair', label: 'Wheelchair users in the group' },
                { value: 'mobility_limited', label: 'Group members with limited mobility' },
                { value: 'deaf_hoh', label: 'Deaf or hard-of-hearing group members' },
                { value: 'blind_low_vision', label: 'Blind or low-vision group members' },
                { value: 'sensory_sensitive', label: 'Group members with sensory sensitivities' },
                { value: 'other', label: 'Something else — we will ask for details' },
              ]}
            />
          </div>
        </Card>

        {/* ---------------------------------------------------------------- */}
        <Card>
          <h2 className="text-xl font-bold">What are you asking for?</h2>
          <p className="mt-1 text-slate-600">
            These are two different requests, to two different people, on two different timelines{' '}
            <RuleTag id="R7" />. We generate and track them separately, which is the part that
            usually goes wrong when it is done by hand.
          </p>

          <div className="mt-5 space-y-3">
            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                id="wants_tour"
                name="wants_tour"
                defaultChecked
                className="mt-1.5 h-5 w-5 shrink-0 border-2 border-slate-600 accent-ink-900"
              />
              <label htmlFor="wants_tour">
                <span className="font-medium">A tour of the Capitol</span>
                <span className="block text-sm text-slate-500">
                  Either through your congressional office or the Capitol Visitor Center — we work
                  out which one your group size actually allows.
                </span>
              </label>
            </div>

            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                id="wants_meeting"
                name="wants_meeting"
                className="mt-1.5 h-5 w-5 shrink-0 border-2 border-slate-600 accent-ink-900"
              />
              <label htmlFor="wants_meeting">
                <span className="font-medium">A meeting with your Member</span>
                <span className="block text-sm text-slate-500">
                  Goes to the office scheduler, and is usually confirmed very close to the date
                  because it depends on the floor schedule. Expect a maybe for a long time.
                </span>
              </label>
            </div>
          </div>
        </Card>

        <div className="flex flex-wrap gap-4">
          <Button>Build my plan</Button>
        </div>
      </form>
    </div>
  );
}
