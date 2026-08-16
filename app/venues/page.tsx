import Link from 'next/link';
import { ButtonLink, Card, InsetText, PageHeader, StatusPill } from '@/components/ui';
import { all } from '@/lib/db';
import { RULES } from '@/lib/feasibility';

export const metadata = {
  title: 'Lunch near the Capitol',
  description:
    'Group-capable lunch options near the US Capitol. Researched public information — no partnerships, no invented prices.',
};

interface VenueRow {
  id: string;
  name: string;
  kind: string;
  address: string | null;
  walk_minutes: number | null;
  max_group: number | null;
  price_per_student_cents: number | null;
  takes_advance_orders: number;
  dietary: string;
  notes: string | null;
  source_url: string | null;
  is_partner: number;
}

const KIND_LABELS: Record<string, string> = {
  cafeteria: 'Cafeteria',
  fast_casual: 'Fast casual',
  food_hall: 'Food hall',
  sit_down: 'Sit-down',
  outdoor: 'Outdoor / bring your own',
};

const DIETARY_LABELS: Record<string, string> = {
  vegetarian: 'Vegetarian',
  vegan: 'Vegan',
  halal: 'Halal',
  kosher: 'Kosher',
  gluten_free: 'Gluten free',
};

function price(cents: number | null): string {
  if (cents === null) return 'Not published — call to confirm';
  if (cents === 0) return 'Free';
  return `About $${(cents / 100).toFixed(2)} per student`;
}

export default function VenuesPage() {
  let venues: VenueRow[] = [];
  try {
    venues = all<VenueRow>('SELECT * FROM venues ORDER BY walk_minutes NULLS LAST, name');
  } catch {
    // Database not seeded yet.
  }

  const partners = venues.filter((v) => v.is_partner === 1);

  return (
    <div className="space-y-10">
      <PageHeader
        title="Lunch near the Capitol"
        lede="No food or drink is allowed inside the Capitol, water bottles included. So lunch happens before you go in or after you come out, and it has to work for a group your size."
      />

      <InsetText tone="warn">
        <p className="font-bold text-ink-950">What this list is, exactly</p>
        <p className="mt-1 text-slate-600">
          Researched public information about places that can plausibly handle a school group. It is{' '}
          <strong>not</strong> a list of partners — there are{' '}
          {partners.length === 0 ? 'none' : partners.length}, and we are not going to tag anyone as
          one until an agreement actually exists. Where a group capacity or a price is not published,
          the field says so rather than showing a number we guessed. Call ahead and confirm before
          you commit thirty students to anything.
        </p>
      </InsetText>

      <section>
        <ul className="space-y-5">
          {venues.map((venue) => {
            const dietary = JSON.parse(venue.dietary || '[]') as string[];
            return (
              <Card key={venue.id} as="li">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-bold">{venue.name}</h2>
                    <p className="mt-1 text-slate-600">{venue.address}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <StatusPill tone="neutral">{KIND_LABELS[venue.kind] ?? venue.kind}</StatusPill>
                    {venue.walk_minutes !== null ? (
                      <StatusPill tone="info">
                        {venue.walk_minutes === 0 ? 'On site' : `${venue.walk_minutes} min walk`}
                      </StatusPill>
                    ) : null}
                    {venue.takes_advance_orders === 1 ? (
                      <StatusPill tone="ok">Takes advance orders</StatusPill>
                    ) : null}
                  </div>
                </div>

                {venue.notes ? <p className="mt-3 text-slate-700">{venue.notes}</p> : null}

                <dl className="mt-4 grid gap-x-6 gap-y-2 border-t border-slate-200 pt-3 text-sm sm:grid-cols-3">
                  <div>
                    <dt className="font-bold text-slate-500">Cost</dt>
                    <dd className="text-slate-700">{price(venue.price_per_student_cents)}</dd>
                  </div>
                  <div>
                    <dt className="font-bold text-slate-500">Max group</dt>
                    <dd className="text-slate-700">
                      {venue.max_group ?? 'Not published — call to confirm'}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-bold text-slate-500">Dietary</dt>
                    <dd className="text-slate-700">
                      {dietary.length === 0
                        ? 'Ask when you call'
                        : dietary.map((d) => DIETARY_LABELS[d] ?? d).join(', ')}
                    </dd>
                  </div>
                </dl>

                {venue.source_url ? (
                  <p className="mt-3 text-sm">
                    <a href={venue.source_url} target="_blank" rel="noopener noreferrer">
                      Official site
                    </a>
                  </p>
                ) : null}
              </Card>
            );
          })}
        </ul>
      </section>

      <section className="border-t border-slate-200 pt-8">
        <h2 className="text-2xl font-bold">Two things that catch groups out</h2>
        <ul className="mt-4 space-y-3 text-slate-600">
          <li>
            <strong className="text-ink-950">Eat before you go through security, not after.</strong>{' '}
            Nothing edible comes through screening, and there is no bag storage{' '}
            <Link href="/rules#R10">(R10)</Link>, so a packed lunch has to be eaten outside or left
            on the bus.
          </li>
          <li>
            <strong className="text-ink-950">
              Budget {RULES.securityScreeningBufferMinutes.value} minutes for screening on top of
              lunch.
            </strong>{' '}
            A group that eats until its tour time does not make its tour.
          </li>
        </ul>
      </section>

      <section className="border-t border-slate-200 pt-8">
        <h2 className="text-2xl font-bold">Run a restaurant near the Capitol?</h2>
        <p className="mt-2 max-w-2xl text-slate-600">
          School groups are predictable, book in advance, and arrive off-peak. If you can seat one,
          tell us what you can handle and we will list it accurately — including saying no when a
          group is too big.
        </p>
        <div className="mt-4">
          <ButtonLink href="/partners" tone="secondary">
            List your restaurant
          </ButtonLink>
        </div>
      </section>
    </div>
  );
}
