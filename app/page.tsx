import Link from 'next/link';
import { ButtonLink, Card, InsetText, Panel, RuleTag, StatusPill } from '@/components/ui';
import { DemoEntry } from '@/components/demo';
import { RULES } from '@/lib/feasibility';
import { schoolCount } from '@/lib/schools';
import { toIsoDate } from '@/lib/dates';
import { allMembers } from '@/lib/congress/legislators';

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ demo?: string }>;
}) {
  const query = await searchParams;

  // Real numbers from the loaded data, not marketing copy.
  let schools = 0;
  let members = 0;
  try {
    schools = schoolCount();
    members = allMembers().length;
  } catch {
    // Data not loaded yet; the page still renders.
  }

  return (
    <div className="space-y-16">
      {/*
        The demo route bounces here when it cannot honour a link. Saying
        nothing would leave someone who followed a stale demo URL looking at a
        marketing page, concluding the app is broken and never finding out that
        the door simply moved.
      */}
      {query.demo === 'unknown' ? (
        <Panel title="That demo link does not point at anything" tone="warn">
          <p>
            The persona in that URL is not one we have. The three that exist are below — any of
            them opens a populated trip with no sign-up.
          </p>
        </Panel>
      ) : null}

      {query.demo === 'unseeded' ? (
        <Panel title="Demo mode is on, but there is no demo data" tone="stop">
          <p>
            The accounts the demo doors sign in as are created by the seed, and this database does
            not have them. Run <code className="font-mono">npm run db:seed</code>, or redeploy so
            the container installs the database built into its image.
          </p>
        </Panel>
      ) : null}

      {/* ------------------------------------------------------------------ */}
      <section className="max-w-3xl">
        <p className="mb-3 text-sm font-bold uppercase tracking-wider text-accent-600">
          Field trips to the US Capitol
        </p>
        <h1 className="text-4xl font-bold leading-tight sm:text-5xl">
          Bringing a class to the Capitol takes more steps than it should, and they are not written
          down in one place.
        </h1>
        <p className="mt-6 text-xl text-slate-600">
          Every congressional office runs its own tour page, the Visitor Center runs its own
          reservations, and the details that decide whether a trip works are spread across both.
          CapitolPass puts them in one plan: who represents your school, the right kind of tour for
          your group, and every deadline. The office gets a complete request it can answer.
        </p>

        <div className="mt-8 flex flex-wrap gap-4">
          <ButtonLink href="/signin">Plan a trip</ButtonLink>
          <ButtonLink href="/join" tone="secondary">
            Join with a code
          </ButtonLink>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/*
        R15's window closes, and this page is read long after it does. Once the
        anniversary season is over the banner stops talking about "this year"
        and says the part that was always true: the weekly cap never moved.
      */}
      {toIsoDate(new Date()) <= RULES.semiquincentennial.value.peakEnd ? (
        <section className="border-l-[6px] border-l-accent-600 bg-accent-100 py-5 pl-6 pr-5">
          <p className="text-sm font-bold uppercase tracking-wider text-accent-700">
            Why this year <RuleTag id="R15" />
          </p>
          <h2 className="mt-1 text-2xl font-bold">
            July 4, 2026 is the 250th anniversary. The tours an office can arrange each week stay
            the same.
          </h2>
          <p className="mt-3 max-w-3xl text-slate-700">
            More schools want to come this year, and offices can still run only a limited number of
            staff-led tours a week. Every constraint in this app gets tighter in an anniversary
            year, and lead time is the only one a teacher actually controls — which is why the plan
            puts your deadlines first and why it says so in{' '}
            <Link href="/rules#R15" className="font-bold">
              a rule we have labelled as our own judgment
            </Link>
            , not as federal policy.
          </p>
        </section>
      ) : (
        <section className="border-l-[6px] border-l-accent-600 bg-accent-100 py-5 pl-6 pr-5">
          <p className="text-sm font-bold uppercase tracking-wider text-accent-700">
            Why lead time matters <RuleTag id="R2" />
          </p>
          <h2 className="mt-1 text-2xl font-bold">
            2026 was the 250th anniversary. The weekly tour limits never moved.
          </h2>
          <p className="mt-3 max-w-3xl text-slate-700">
            Offices can run only a limited number of staff-led tours a week, in an anniversary year
            and in every other year. Demand rises and falls; that number does not. Lead time is the
            only constraint a teacher actually controls, which is why the plan puts your deadlines
            first.
          </p>
        </section>
      )}

      {/* Renders nothing unless CAPITOLPASS_DEMO=1. */}
      <DemoEntry />

      {/* ------------------------------------------------------------------ */}
      <section>
        <h2 className="text-2xl font-bold">What trips up a first-time trip</h2>
        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <Card>
            <h3 className="text-lg font-bold">Two systems, no shared front door</h3>
            <p className="mt-2 text-slate-600">
              A tour can come from the Capitol Visitor Center&rsquo;s reservation system or from your
              own Representative&rsquo;s office. Neither system knows the other exists. Booking one
              does not tell the other anything.
            </p>
            <p className="mt-3">
              <Link href="/front-doors" className="font-bold">
                See all 537 offices measured →
              </Link>
            </p>
          </Card>
          <Card>
            <h3 className="text-lg font-bold">
              A full class needs a different kind of tour <RuleTag id="R1" /> <RuleTag id="R16" />
            </h3>
            <p className="mt-2 text-slate-600">
              Staff-led tours take up to {RULES.staffLedMaxGuests.value} people per guide, adults
              included. Offices can also book a guided tour for a school group of up to{' '}
              {RULES.officeGuidedSchoolMaxGuests.value} — but you have to ask for it by name.
            </p>
          </Card>
          <Card>
            <h3 className="text-lg font-bold">
              Office tours are limited each week <RuleTag id="R2" />
            </h3>
            <p className="mt-2 text-slate-600">
              Offices can run only a few staff-led tours a week, so you may be asking for the same week
              as another school in your district. The week you request matters more than the day.
            </p>
          </Card>
          <Card>
            <h3 className="text-lg font-bold">
              The meeting is a different request entirely <RuleTag id="R7" />
            </h3>
            <p className="mt-2 text-slate-600">
              A meeting with your Member goes to the scheduler, on a different timeline, and is
              confirmed far later because it depends on the floor schedule. Bundled with a tour
              request, it disappears.
            </p>
          </Card>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      <section>
        <h2 className="text-2xl font-bold">What the app actually does</h2>

        <ol className="mt-6 space-y-6">
          <li className="border-l-[6px] border-ink-800 pl-5">
            <h3 className="text-lg font-bold">You never type &ldquo;who is my representative&rdquo;</h3>
            <p className="mt-1 text-slate-600">
              Your school address comes from the NCES directory. Its coordinates go to the US Census
              Geocoder, which returns your congressional district. From there we resolve your
              Representative and Senators. {schools > 0 ? `${schools.toLocaleString()} schools` : 'The school directory'} and{' '}
              {members > 0 ? `${members} current members` : 'every current member'} are already loaded.
            </p>
          </li>
          <li className="border-l-[6px] border-ink-800 pl-5">
            <h3 className="text-lg font-bold">You get a plan, not a form</h3>
            <p className="mt-1 text-slate-600">
              The feasibility engine checks your group size against the tour limits, your dates
              against the lead-time windows and the days the Capitol is closed, and gives you a
              dated critical path — request by this date, lock your headcount by that one.
            </p>
          </li>
          <li className="border-l-[6px] border-ink-800 pl-5">
            <h3 className="text-lg font-bold">Requests go where they are actually read</h3>
            <p className="mt-1 text-slate-600">
              We generate a complete packet per destination and take you to that office&rsquo;s own
              form with everything ready to paste. If the office has claimed their CapitolPass
              account, it goes straight into their queue instead.
            </p>
          </li>
        </ol>

        <div className="mt-8">
          <InsetText>
            <p className="font-bold text-ink-950">CapitolPass does not send email for you.</p>
            <p className="mt-1 text-slate-600">
              Automated mail to .house.gov and .senate.gov gets filtered, and it lands on staff who
              are already answering constituents. Every request leaves through a channel a person
              chose: the office&rsquo;s own form, your mailbox, or the office&rsquo;s queue.
            </p>
          </InsetText>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      <section className="border-t border-slate-200 pt-10">
        <h2 className="text-2xl font-bold">For congressional offices</h2>
        <div className="mt-4 grid gap-6 md:grid-cols-[2fr_1fr]">
          <div>
            <p className="text-slate-600">
              Claim your office and get a queue of school tour requests from schools whose district
              match is already proved — resolved from the school&rsquo;s own coordinates, not guessed
              from a ZIP code. Confirm, decline, or propose another date in one click.
            </p>
            <p className="mt-3 text-slate-600">
              The queue includes a weekly tracker, so you can see at a glance which weeks already
              have a school on the books, and publish the weeks you can take one.
            </p>
            <div className="mt-5">
              <ButtonLink href="/office/claim" tone="secondary">
                Claim your office
              </ButtonLink>
            </div>
          </div>
          <Card className="bg-paper-50">
            <h3 className="font-bold">Status is honest</h3>
            <div className="mt-3 space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <StatusPill tone="neutral">Draft</StatusPill>
                <span className="text-slate-600">not sent yet</span>
              </div>
              <div className="flex items-center gap-2">
                <StatusPill tone="info">Sent</StatusPill>
                <span className="text-slate-600">waiting on the office</span>
              </div>
              <div className="flex items-center gap-2">
                <StatusPill tone="warn">Alternate proposed</StatusPill>
                <span className="text-slate-600">they offered another date</span>
              </div>
              <div className="flex items-center gap-2">
                <StatusPill tone="ok">Confirmed</StatusPill>
                <span className="text-slate-600">you have a slot</span>
              </div>
            </div>
          </Card>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      <section className="border-t border-slate-200 pt-10">
        <h2 className="text-2xl font-bold">Every rule we encode is written down</h2>
        <p className="mt-2 max-w-2xl text-slate-600">
          The group-size limits, the weekly office limit, the lead-time windows, the days the building is
          closed. Each one carries the source it came from and the date we last checked it, and each
          one is labelled as published guidance, documented practice, or our own planning judgment.
        </p>
        <p className="mt-4">
          <Link href="/rules" className="font-bold">
            Read the rules the engine runs on →
          </Link>
        </p>
      </section>
    </div>
  );
}
