import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  ButtonLink,
  Card,
  DescriptionList,
  EmptyState,
  PageHeader,
  StatusPill,
  type StatusTone,
} from '@/components/ui';
import { currentUser } from '@/lib/auth';
import { getSchool, domainTrust, lookupDomain } from '@/lib/schools';
import { emailDomain } from '@/lib/auth';
import { requestsForTrip, tripsForTeacher, storedPlan } from '@/lib/trips';
import { delegationFor } from '@/lib/congress/legislators';
import { formatShort, relativeDays, toIsoDate } from '@/lib/dates';

export const metadata = { title: 'My trips' };

const TRIP_TONES: Record<string, StatusTone> = {
  planning: 'neutral',
  requesting: 'info',
  confirmed: 'ok',
  completed: 'ok',
  cancelled: 'stop',
};

export default async function TeacherDashboard() {
  const user = await currentUser();
  if (!user) redirect('/signin');
  if (user.role === 'staff') redirect('/office');

  const trips = tripsForTeacher(user.id);
  const school = user.school_nces_id ? getSchool(user.school_nces_id) : null;
  const domain = emailDomain(user.email);
  const trust = domainTrust(domain ? lookupDomain(domain) : null);
  const today = toIsoDate(new Date());

  const delegation =
    school?.district_state && school.district_number !== null
      ? delegationFor(school.district_state, school.district_number)
      : null;

  return (
    <div className="space-y-10">
      <PageHeader
        eyebrow={school?.name ?? user.school_freeform ?? undefined}
        title="My trips"
        lede={`Signed in as ${user.email}`}
        actions={<ButtonLink href="/teacher/trips/new">Plan a new trip</ButtonLink>}
      />

      {/* ------------------------------------------------------------------ */}
      {/* The "we already know who your representative is" moment            */}
      {/* ------------------------------------------------------------------ */}
      {delegation ? (
        <Card className="bg-paper-50">
          <h2 className="text-lg font-bold">Your delegation</h2>
          <p className="mt-1 text-sm text-slate-500">
            Resolved from your school&rsquo;s coordinates through the US Census Geocoder —{' '}
            {delegation.districtDescription}. You never had to look this up.
          </p>

          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            {[delegation.representative, ...delegation.senators]
              .filter((m) => m !== null)
              .map((member) => (
                <div key={member.bioguideId} className="flex items-start gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={member.photoUrl}
                    alt=""
                    width={48}
                    height={59}
                    className="border border-slate-300 bg-slate-100"
                  />
                  <div>
                    <p className="font-bold leading-tight">{member.name}</p>
                    <p className="text-sm text-slate-500">
                      {member.chamber === 'senate'
                        ? `Senator, ${member.state}`
                        : delegation.districtLabel}
                    </p>
                    {member.phone ? (
                      <p className="text-sm text-slate-500">{member.phone}</p>
                    ) : null}
                  </div>
                </div>
              ))}
          </div>

          {delegation.senators.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">
              {delegation.delegateOnly
                ? 'Your district is represented by a Delegate and has no Senators, so Senate offices are not part of your options.'
                : null}
            </p>
          ) : null}
        </Card>
      ) : null}

      {/* ------------------------------------------------------------------ */}
      <section>
        <h2 className="sr-only">Trips</h2>

        {trips.length === 0 ? (
          <EmptyState
            title="No trips yet"
            action={<ButtonLink href="/teacher/trips/new">Plan your first trip</ButtonLink>}
          >
            <p>
              Tell us your dates, your group size and whether you want a tour, a meeting with your
              Member, or both. We will work out what is actually possible and what has to be
              requested separately.
            </p>
          </EmptyState>
        ) : (
          <ul className="space-y-5">
            {trips.map((trip) => {
              const requests = requestsForTrip(trip.id);
              const plan = storedPlan(trip);
              const guests = trip.students + trip.teachers + trip.chaperones;
              const blockers = plan?.findings.filter((f) => f.severity === 'blocker').length ?? 0;
              const nextMilestone = plan?.criticalPath.find((m) => m.dueDate >= today);

              return (
                <Card key={trip.id} as="li">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <h3 className="text-xl font-bold">
                        <Link href={`/teacher/trips/${trip.id}`}>{trip.title}</Link>
                      </h3>
                      <p className="mt-1 text-slate-600">
                        {formatShort(trip.preferred_date)} · {guests} people ·{' '}
                        {trip.students} students
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusPill tone={TRIP_TONES[trip.status] ?? 'neutral'}>
                        {trip.status}
                      </StatusPill>
                      {trip.cosign_status === 'confirmed' ? (
                        <StatusPill tone="ok">Verified trip</StatusPill>
                      ) : null}
                      {blockers > 0 ? <StatusPill tone="stop">{blockers} blocker</StatusPill> : null}
                    </div>
                  </div>

                  <div className="mt-4">
                    <DescriptionList
                      items={[
                        {
                          term: 'Requests',
                          description:
                            requests.length === 0 ? (
                              'None yet'
                            ) : (
                              <ul className="space-y-1">
                                {requests.map((r) => (
                                  <li key={r.id} className="flex flex-wrap items-center gap-2">
                                    <StatusPill
                                      tone={
                                        r.status === 'confirmed'
                                          ? 'ok'
                                          : r.status === 'declined'
                                            ? 'stop'
                                            : r.status === 'alternate_proposed'
                                              ? 'warn'
                                              : r.status === 'draft'
                                                ? 'neutral'
                                                : 'info'
                                      }
                                    >
                                      {r.status.replace('_', ' ')}
                                    </StatusPill>
                                    <span>{r.title}</span>
                                  </li>
                                ))}
                              </ul>
                            ),
                        },
                        {
                          term: 'Next deadline',
                          description: nextMilestone ? (
                            <>
                              <strong>{nextMilestone.label}</strong> —{' '}
                              {formatShort(nextMilestone.dueDate)} (
                              {relativeDays(today, nextMilestone.dueDate)})
                            </>
                          ) : (
                            'Nothing upcoming'
                          ),
                        },
                        {
                          term: 'Student join code',
                          description: (
                            <code className="font-mono text-lg font-bold tracking-widest">
                              {trip.join_code}
                            </code>
                          ),
                        },
                      ]}
                    />
                  </div>
                </Card>
              );
            })}
          </ul>
        )}
      </section>

      {/* ------------------------------------------------------------------ */}
      <section className="border-t border-slate-200 pt-8">
        <h2 className="text-lg font-bold">Your verification status</h2>
        <p className="mt-2 max-w-2xl text-slate-600">{trust.explanation}</p>
        {!trust.canEarnVerifiedBadge ? (
          <p className="mt-2 max-w-2xl text-slate-600">
            This does not limit what you can do here. It only affects whether a congressional office
            sees a <strong>Verified Trip</strong> badge next to your request — ask an administrator
            at your school to co-sign a trip and that badge appears.
          </p>
        ) : null}
      </section>
    </div>
  );
}
