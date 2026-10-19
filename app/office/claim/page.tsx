import {
  Button,
  Card,
  ErrorSummary,
  Field,
  InsetText,
  PageHeader,
  Select,
  TextInput,
} from '@/components/ui';
import { searchMembers, memberByBioguide } from '@/lib/congress/legislators';
import { formatDistrict } from '@/lib/districts/states';
import { startOfficeClaim } from '../actions';

export const metadata = { title: 'Claim your office' };

const ERRORS: Record<string, string> = {
  invalid_email: 'Enter a valid email address.',
  no_office: 'Choose the office you work for.',
  domain:
    'Office accounts need an email address on a house.gov or senate.gov domain. This is the one thing we cannot work around — it is what makes the account meaningful.',
  expired: 'That confirmation link had expired. Start the claim again to get a fresh one.',
  used: 'That confirmation link had already been used. Try signing in instead.',
  not_found: 'That confirmation link was not recognised. Start the claim again.',
};

export default async function ClaimOfficePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; bioguide_id?: string; error?: string; claim_error?: string }>;
}) {
  const params = await searchParams;
  const query = params.q ?? '';
  const results = query.length >= 2 ? searchMembers(query, 12) : [];
  const preselected = params.bioguide_id ? memberByBioguide(params.bioguide_id) : null;
  const errorKey = params.error ?? params.claim_error;
  const error = errorKey ? ERRORS[errorKey] : undefined;

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <PageHeader
        eyebrow="For congressional offices"
        title="Claim your office"
        lede="Get a queue of school tour requests from schools whose district match is already proved, with a weekly capacity tracker built around the limit you actually work under."
      />

      {error ? <ErrorSummary errors={[error]} /> : null}

      <Card className="bg-paper-50">
        <h2 className="text-lg font-bold">What you get</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-slate-600">
          <li>
            <strong className="text-ink-950">Constituent status, already checked.</strong> Every
            request shows whether the school is in your district, resolved from the school&rsquo;s
            own coordinates through the US Census Geocoder — not guessed from a ZIP code.
          </li>
          <li>
            <strong className="text-ink-950">
              A weekly tracker for the tours you can take on.
            </strong>{' '}
            See at a glance which weeks are already spoken for before you promise one.
          </li>
          <li>
            <strong className="text-ink-950">One-click responses.</strong> Confirm, decline, or
            propose another date. The teacher sees it immediately, with no email thread.
          </li>
          <li>
            <strong className="text-ink-950">The right tour for the group size.</strong> A request
            for 34 people arrives marked as a guided school tour rather than a staff-led one, so it
            is not mistaken for a request you have to turn down.
          </li>
        </ul>
      </Card>

      {/* ------------------------------------------------------------------ */}
      <Card>
        <h2 className="text-lg font-bold">Find your office</h2>
        <form method="get" className="mt-4 flex flex-wrap items-end gap-3">
          <div className="flex-1">
            <Field label="Member name" name="q">
              <TextInput name="q" defaultValue={query} placeholder="e.g. Subramanyam" />
            </Field>
          </div>
          <div className="pb-0.5">
            <Button tone="secondary">Search</Button>
          </div>
        </form>

        {results.length > 0 ? (
          <ul className="mt-4 space-y-2 border-t border-slate-200 pt-4">
            {results.map((m) => (
              <li key={m.bioguideId} className="flex items-center justify-between gap-3">
                <span>
                  <strong>{m.name}</strong>
                  <span className="ml-2 text-slate-500">
                    {m.chamber === 'senate'
                      ? `Senator, ${m.state}`
                      : formatDistrict(m.state, m.district ?? 0)}
                  </span>
                </span>
                <a href={`/office/claim?bioguide_id=${m.bioguideId}`} className="font-bold">
                  Select
                </a>
              </li>
            ))}
          </ul>
        ) : query.length >= 2 ? (
          <p className="mt-4 text-slate-600">No current members matched &ldquo;{query}&rdquo;.</p>
        ) : null}
      </Card>

      {/* ------------------------------------------------------------------ */}
      {preselected ? (
        <Card>
          <h2 className="text-lg font-bold">
            Claiming: Office of {preselected.name}
          </h2>
          <p className="mt-1 text-slate-600">
            {preselected.chamber === 'senate'
              ? `Senator, ${preselected.state}`
              : formatDistrict(preselected.state, preselected.district ?? 0)}
          </p>

          <form action={startOfficeClaim} className="mt-5 space-y-6">
            <input type="hidden" name="bioguide_id" value={preselected.bioguideId} />

            <Field
              label="Your work email"
              name="email"
              required
              hint={
                preselected.chamber === 'senate'
                  ? 'Must be a senate.gov address.'
                  : 'Must be a house.gov address, including mail.house.gov.'
              }
            >
              <TextInput name="email" type="email" required inputMode="email" />
            </Field>

            <Field label="Your name" name="name" required>
              <TextInput name="name" required autoComplete="name" />
            </Field>

            <Field label="Your role" name="title" hint="Optional — helps us route future features.">
              <Select
                name="title"
                defaultValue="Scheduler"
                options={[
                  { value: 'Scheduler', label: 'Scheduler' },
                  { value: 'Staff Assistant', label: 'Staff Assistant' },
                  { value: 'Tour Coordinator', label: 'Tour Coordinator' },
                  { value: 'District Director', label: 'District Director' },
                  { value: 'Other', label: 'Other' },
                ]}
              />
            </Field>

            <Button>Send me a confirmation link</Button>
          </form>
        </Card>
      ) : null}

      {/* ------------------------------------------------------------------ */}
      <InsetText tone="warn">
        <p className="font-bold text-ink-950">How verification works, honestly</p>
        <p className="mt-1 text-slate-600">
          The house.gov / senate.gov domain check is real — you cannot get one of those addresses
          without working there. But it does not prove <em>which</em> office you work for. In this
          build a claim from a verified domain is approved automatically so the system is walkable
          end to end. A production deployment would add a confirmation step with the office itself.
          We would rather say that plainly than let you assume a check exists that does not.
        </p>
      </InsetText>
    </div>
  );
}
