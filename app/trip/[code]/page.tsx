import { notFound } from 'next/navigation';
import {
  Button,
  Card,
  DescriptionList,
  Field,
  InsetText,
  PageHeader,
  Panel,
  StatusPill,
  TextInput,
  Textarea,
} from '@/components/ui';
import { getTripByJoinCode, addQuestion, questionsForTrip } from '@/lib/trips';
import { getSchool } from '@/lib/schools';
import { committeesFor, delegationFor } from '@/lib/congress/legislators';
import { buildTransitPlan } from '@/lib/transit/wmata';
import { RULES } from '@/lib/feasibility';
import { formatLong } from '@/lib/dates';
import { redirect } from 'next/navigation';

export const metadata = { title: 'Your trip' };

async function submitQuestion(formData: FormData) {
  'use server';
  const code = String(formData.get('code') ?? '');
  const name = String(formData.get('author_name') ?? '').trim();
  const body = String(formData.get('body') ?? '').trim();

  const trip = getTripByJoinCode(code);
  if (!trip) redirect('/join?error=not_found');
  if (name.length < 1 || body.length < 10) redirect(`/trip/${code}?q_error=1`);

  addQuestion(trip.id, name.slice(0, 60), body.slice(0, 500));
  redirect(`/trip/${code}?q_sent=1`);
}

export default async function StudentTripPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ q_sent?: string; q_error?: string }>;
}) {
  const { code } = await params;
  const query = await searchParams;

  const trip = getTripByJoinCode(code);
  if (!trip) notFound();

  const school = trip.school_nces_id ? getSchool(trip.school_nces_id) : null;
  const delegation =
    trip.district_state && trip.district_number !== null
      ? delegationFor(trip.district_state, trip.district_number)
      : null;
  const rep = delegation?.representative ?? null;
  const committees = rep ? committeesFor(rep.bioguideId) : [];
  const transit = await buildTransitPlan(trip.arrival_method);
  const selected = questionsForTrip(trip.id, 'selected');

  return (
    <div className="mx-auto max-w-3xl space-y-12">
      <PageHeader
        eyebrow={school?.name ?? undefined}
        title={trip.title}
        lede={formatLong(trip.preferred_date)}
      />

      {/* ================================================================== */}
      {/* What to bring — the thing that actually goes wrong on the day      */}
      {/* ================================================================== */}
      <section>
        <h2 className="text-2xl font-bold">Before you leave the house</h2>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Panel title="Leave these behind" tone="stop">
            <ul className="list-disc space-y-1 pl-5">
              <li>
                <strong>Food and drink of any kind</strong>, including water bottles. None of it can
                come inside the Capitol.
              </li>
              <li>
                <strong>Backpacks and large bags.</strong> There is nowhere to store them — no
                lockers, no cloakroom, nothing. Whatever you bring, you carry all day.
              </li>
              <li>Anything sharp, including pocket knives and multi-tools.</li>
              <li>Aerosols, and liquids that are not medication.</li>
            </ul>
          </Panel>

          <Panel title="Bring these" tone="ok">
            <ul className="list-disc space-y-1 pl-5">
              <li>A phone, if you have one, with your teacher&rsquo;s number saved.</li>
              <li>Any medication you need, and tell your teacher you have it.</li>
              <li>Comfortable shoes. You will be standing and walking for hours.</li>
              <li>A small amount of money for lunch, if your group is buying.</li>
            </ul>
          </Panel>
        </div>

        <div className="mt-4">
          <InsetText tone="warn">
            <p className="text-slate-600">
              Everyone goes through airport-style security screening to get in. Your group is
              arriving about {RULES.securityScreeningBufferMinutes.value} minutes early specifically
              so that a group your size can get through it without losing the tour slot. If you
              bring something you should not have, that time disappears.
            </p>
          </InsetText>
        </div>
      </section>

      {/* ================================================================== */}
      {/* Getting there                                                      */}
      {/* ================================================================== */}
      <section>
        <h2 className="text-2xl font-bold">Getting there</h2>
        <Card className="mt-4">
          <h3 className="text-lg font-bold">
            {transit.station.name}{' '}
            <span className="font-normal text-slate-500">
              ({transit.station.lines.join(', ')})
            </span>
          </h3>
          <p className="mt-1 text-slate-600">{transit.station.note}</p>
          <p className="mt-2 font-bold">
            About {transit.walkMinutes} minutes on foot from the station to the Visitor Center.
          </p>

          <ul className="mt-4 list-disc space-y-2 pl-5 text-slate-600">
            {transit.guidance.map((g) => (
              <li key={g}>{g}</li>
            ))}
          </ul>

          <p className="mt-4 text-sm text-slate-500">{transit.fareNote}</p>
        </Card>
      </section>

      {/* ================================================================== */}
      {/* Your Representative                                                */}
      {/* ================================================================== */}
      {rep ? (
        <section>
          <h2 className="text-2xl font-bold">Who represents you</h2>

          <Card className="mt-4">
            <div className="flex flex-wrap gap-6">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={rep.photoUrl}
                alt={`Official portrait of ${rep.name}`}
                width={112}
                height={137}
                className="border border-slate-300 bg-slate-100"
              />
              <div className="flex-1">
                <h3 className="text-xl font-bold">{rep.name}</h3>
                <p className="text-slate-600">
                  {delegation?.districtDescription} · {rep.party}
                </p>
                {rep.capitolOffice ? (
                  <p className="mt-1 text-slate-600">{rep.capitolOffice}</p>
                ) : null}

                {committees.length > 0 ? (
                  <div className="mt-4">
                    <h4 className="font-bold">Committees</h4>
                    <ul className="mt-1 space-y-1 text-slate-600">
                      {committees.slice(0, 6).map((c) => (
                        <li key={c.name}>
                          {c.name}
                          {c.title ? (
                            <StatusPill tone="info" className="ml-2">
                              {c.title}
                            </StatusPill>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                    <p className="mt-2 text-sm text-slate-500">
                      Committees are where most of the actual work of Congress happens — bills are
                      written, amended and killed here long before anyone votes on the floor.
                    </p>
                  </div>
                ) : null}
              </div>
            </div>
          </Card>
        </section>
      ) : null}

      {/* ================================================================== */}
      {/* Questions                                                          */}
      {/* ================================================================== */}
      {trip.wants_meeting === 1 ? (
        <section>
          <h2 className="text-2xl font-bold">Ask a question</h2>
          <p className="mt-1 text-slate-600">
            Your teacher picks the strongest questions and sends them to the office ahead of time.
            That gives the Member a chance to actually answer rather than give a stock reply — which
            is the difference between a photo op and a conversation.
          </p>

          {query.q_sent ? (
            <Panel title="Question submitted" tone="ok">
              <p>Your teacher will see it. You can submit another if you think of one.</p>
            </Panel>
          ) : null}

          {query.q_error ? (
            <Panel title="That did not go through" tone="stop">
              <p>Add your name, and make the question at least a sentence long.</p>
            </Panel>
          ) : null}

          <Card className="mt-4">
            <form action={submitQuestion} className="space-y-5">
              <input type="hidden" name="code" value={code} />

              <Field label="Your first name" name="author_name" required>
                <TextInput name="author_name" required maxLength={60} />
              </Field>

              <Field
                label="Your question"
                name="body"
                required
                hint="Specific questions get real answers. “What is a vote you found hard to decide?” beats “What is it like being in Congress?”"
              >
                <Textarea name="body" rows={4} required maxLength={500} />
              </Field>

              <Button>Submit question</Button>
            </form>
          </Card>

          {selected.length > 0 ? (
            <div className="mt-6">
              <h3 className="text-lg font-bold">Questions your teacher chose</h3>
              <ul className="mt-3 space-y-3">
                {selected.map((q) => (
                  <li key={q.id} className="border-l-[6px] border-l-ink-800 pl-4">
                    <p>{q.body}</p>
                    <p className="text-sm text-slate-500">— {q.author_name}</p>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}

      {/* ================================================================== */}
      {/* Civics                                                             */}
      {/* ================================================================== */}
      <section>
        <h2 className="text-2xl font-bold">What you are actually walking into</h2>

        <div className="mt-4">
          <DescriptionList
            items={[
              {
                term: 'The building',
                description:
                  'The Capitol houses both chambers of Congress — the House of Representatives in the south wing, the Senate in the north. The dome and the Rotunda sit between them. It has been in use since 1800, and has been rebuilt and extended repeatedly since.',
              },
              {
                term: 'The House',
                description:
                  '435 voting members, each representing a district of roughly 760,000 people, all elected every two years. Yours is one of them. Because districts are drawn by population, a member from a dense city represents the same number of people as one from a large rural district.',
              },
              {
                term: 'The Senate',
                description:
                  '100 members, two per state regardless of population, elected for six-year terms with a third of the seats up every two years. Wyoming and California each get two.',
              },
              {
                term: 'What your Representative actually does',
                description:
                  'Far less floor voting than people expect. Most of the job is committee work, constituent casework — helping people in the district deal with federal agencies — and meetings. The tour you are on is itself a constituent service.',
              },
              {
                term: 'Why the chamber is often nearly empty',
                description:
                  'Members are usually in committee hearings, meetings, or their offices, and come to the floor for votes. A near-empty chamber during a speech is normal, not a sign that nobody cares.',
              },
            ]}
          />
        </div>
      </section>
    </div>
  );
}
