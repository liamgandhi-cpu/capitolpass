import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Button, Card, EmptyState, InsetText, PageHeader, StatusPill } from '@/components/ui';
import { CopyBlock } from '@/components/copy-block';
import { currentUser } from '@/lib/auth';
import { getTrip, questionsForTrip } from '@/lib/trips';
import { delegationFor } from '@/lib/congress/legislators';
import { moderateQuestionAction } from '../../../actions';

export const metadata = { title: 'Student questions' };

export default async function QuestionsPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) redirect('/signin');

  const { id } = await params;
  const trip = getTrip(id);
  if (!trip) notFound();
  if (trip.teacher_id !== user.id && user.role !== 'admin') notFound();

  const all = questionsForTrip(trip.id);
  const submitted = all.filter((q) => q.status === 'submitted');
  const selected = all.filter((q) => q.status === 'selected');
  const hidden = all.filter((q) => q.status === 'hidden');

  const delegation =
    trip.district_state && trip.district_number !== null
      ? delegationFor(trip.district_state, trip.district_number)
      : null;
  const rep = delegation?.representative;

  const sendAhead = [
    `Questions from ${trip.students} students at ${trip.title}`,
    '',
    ...selected.map((q, i) => `${i + 1}. ${q.body}\n   — ${q.author_name}`),
  ].join('\n');

  return (
    <div className="mx-auto max-w-3xl space-y-10">
      <p>
        <Link href={`/teacher/trips/${trip.id}`}>← Back to {trip.title}</Link>
      </p>

      <PageHeader
        eyebrow={trip.title}
        title="Student questions"
        lede="Pick the strongest questions and send them to the office ahead of the meeting. It turns a photo op into a conversation, and it gives the office something genuinely useful in advance."
      />

      {all.length === 0 ? (
        <EmptyState title="No questions yet">
          <p>
            Students submit questions from the trip page using join code{' '}
            <strong className="font-mono tracking-widest">{trip.join_code}</strong>.
          </p>
        </EmptyState>
      ) : null}

      {/* ------------------------------------------------------------------ */}
      {selected.length > 0 ? (
        <section>
          <h2 className="text-2xl font-bold">Selected ({selected.length})</h2>
          <ul className="mt-4 space-y-3">
            {selected.map((q) => (
              <Card key={q.id} as="li">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-lg">{q.body}</p>
                    <p className="mt-1 text-sm text-slate-500">— {q.author_name}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusPill tone="ok">Selected</StatusPill>
                    <form action={moderateQuestionAction}>
                      <input type="hidden" name="question_id" value={q.id} />
                      <input type="hidden" name="trip_id" value={trip.id} />
                      <input type="hidden" name="status" value="submitted" />
                      <Button tone="quiet">Unselect</Button>
                    </form>
                  </div>
                </div>
              </Card>
            ))}
          </ul>

          <div className="mt-6">
            <CopyBlock
              text={sendAhead}
              label={`Ready to send to ${rep ? `the office of ${rep.name}` : 'the office'}`}
            />
          </div>

          <div className="mt-3">
            <InsetText>
              <p className="text-slate-600">
                Send this with your meeting request, or as a short follow-up a week before the trip.
                Schedulers and legislative staff genuinely prefer having questions in advance — it
                lets them prepare something real instead of improvising.
              </p>
            </InsetText>
          </div>
        </section>
      ) : null}

      {/* ------------------------------------------------------------------ */}
      {submitted.length > 0 ? (
        <section>
          <h2 className="text-2xl font-bold">Waiting for you ({submitted.length})</h2>
          <ul className="mt-4 space-y-3">
            {submitted.map((q) => (
              <Card key={q.id} as="li">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-lg">{q.body}</p>
                    <p className="mt-1 text-sm text-slate-500">— {q.author_name}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <form action={moderateQuestionAction}>
                      <input type="hidden" name="question_id" value={q.id} />
                      <input type="hidden" name="trip_id" value={trip.id} />
                      <input type="hidden" name="status" value="selected" />
                      <Button>Select</Button>
                    </form>
                    <form action={moderateQuestionAction}>
                      <input type="hidden" name="question_id" value={q.id} />
                      <input type="hidden" name="trip_id" value={trip.id} />
                      <input type="hidden" name="status" value="hidden" />
                      <Button tone="quiet">Hide</Button>
                    </form>
                  </div>
                </div>
              </Card>
            ))}
          </ul>
        </section>
      ) : null}

      {/* ------------------------------------------------------------------ */}
      {hidden.length > 0 ? (
        <details className="border border-slate-200 bg-white p-5">
          <summary className="cursor-pointer font-bold">{hidden.length} hidden</summary>
          <ul className="mt-4 space-y-3">
            {hidden.map((q) => (
              <li key={q.id} className="flex items-start justify-between gap-3 border-b border-slate-200 pb-3">
                <div>
                  <p className="text-slate-600">{q.body}</p>
                  <p className="text-sm text-slate-400">— {q.author_name}</p>
                </div>
                <form action={moderateQuestionAction}>
                  <input type="hidden" name="question_id" value={q.id} />
                  <input type="hidden" name="trip_id" value={trip.id} />
                  <input type="hidden" name="status" value="submitted" />
                  <Button tone="quiet">Restore</Button>
                </form>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
