import {
  Button,
  Card,
  ErrorSummary,
  Field,
  InsetText,
  PageHeader,
  Select,
  StatusPill,
  TextInput,
} from '@/components/ui';
import { STATES } from '@/lib/districts/states';
import { emailDomain } from '@/lib/auth';
import { domainTrust, isConsumerDomain, lookupDomain, schoolForDomain, searchSchools } from '@/lib/schools';
import { createTeacherAccount } from '../signin/actions';

export const metadata = { title: 'Create your account' };

const ERRORS: Record<string, string> = {
  invalid_email: 'Enter a valid email address.',
  name_required: 'Enter your name so offices know who they are replying to.',
  school_required: 'Choose your school, or type its name if it is not listed.',
};

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; q?: string; state?: string; error?: string }>;
}) {
  const params = await searchParams;
  const email = params.email ?? '';
  const query = params.q ?? '';
  const state = params.state ?? '';
  const error = params.error ? ERRORS[params.error] : undefined;

  const domain = email ? emailDomain(email) : null;
  const domainMatch = domain ? schoolForDomain(domain) : null;
  const trust = domainTrust(domain ? lookupDomain(domain) : null);
  const consumer = domain ? isConsumerDomain(domain) : false;

  const results = query.length >= 2 ? searchSchools(query, state || undefined, 20) : [];

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <PageHeader
        title="Create your account"
        lede="We need to know which school you are at, because that is what determines which congressional office your requests go to."
      />

      {error ? <ErrorSummary errors={[error]} /> : null}

      {/* ------------------------------------------------------------------ */}
      {/* What we could work out from the email domain                        */}
      {/* ------------------------------------------------------------------ */}
      {domain ? (
        <Card className="bg-paper-50">
          <h2 className="text-lg font-bold">Your email domain</h2>
          <p className="mt-1 font-mono text-sm text-slate-600">{domain}</p>

          <div className="mt-3">
            {domainMatch ? (
              <>
                <StatusPill tone="ok">Matched</StatusPill>
                <p className="mt-2 text-slate-600">
                  We have this domain on file for <strong>{domainMatch.school.name}</strong> in{' '}
                  {domainMatch.school.city}, {domainMatch.school.state}. It is pre-selected below —
                  change it if that is wrong.
                </p>
              </>
            ) : consumer ? (
              <>
                <StatusPill tone="warn">Personal address</StatusPill>
                <p className="mt-2 text-slate-600">
                  This is a personal email provider, so it cannot identify a school on its own. You
                  can still plan the entire trip. To get a <strong>Verified Trip</strong> badge, have
                  an administrator co-sign it once it is created.
                </p>
              </>
            ) : (
              <>
                <StatusPill tone="info">Not on file</StatusPill>
                <p className="mt-2 text-slate-600">
                  We do not have this domain mapped to a school yet.{' '}
                  <strong>No federal dataset publishes school email domains</strong> — NCES has no
                  such field — so this mapping gets built as teachers use the app. Pick your school
                  below and we will remember the match for the next teacher at your school.
                </p>
              </>
            )}
          </div>

          {!domainMatch && !consumer ? (
            <p className="mt-3 text-sm text-slate-500">{trust.explanation}</p>
          ) : null}
        </Card>
      ) : null}

      {/* ------------------------------------------------------------------ */}
      {/* School search — plain GET form, no client JavaScript needed         */}
      {/* ------------------------------------------------------------------ */}
      <Card>
        <h2 className="text-lg font-bold">Find your school</h2>
        <p className="mt-1 text-slate-600">
          From the NCES Common Core of Data, the federal public school directory.
        </p>

        <form method="get" className="mt-4 grid gap-4 sm:grid-cols-[1fr_10rem_auto] sm:items-end">
          <input type="hidden" name="email" value={email} />
          <Field label="School name" name="q">
            <TextInput name="q" defaultValue={query} placeholder="e.g. Riverside High" />
          </Field>
          <Field label="State" name="state">
            <Select
              name="state"
              defaultValue={state}
              options={[
                { value: '', label: 'Any' },
                ...STATES.map((s) => ({ value: s.usps, label: s.usps })),
              ]}
            />
          </Field>
          <div className="pb-0.5">
            <Button tone="secondary">Search</Button>
          </div>
        </form>
      </Card>

      {/* ------------------------------------------------------------------ */}
      {/* Account form                                                        */}
      {/* ------------------------------------------------------------------ */}
      <Card>
        <form action={createTeacherAccount} className="space-y-6">
          <input type="hidden" name="email" value={email} />

          <Field label="Your email address" name="email_display">
            <TextInput name="email_display" defaultValue={email} type="email" />
            <p className="mt-1 text-sm text-slate-500">
              Editing this field does nothing — go back to <a href="/signin">sign in</a> to use a
              different address.
            </p>
          </Field>

          <Field
            label="Your name"
            name="name"
            required
            hint="This is what a congressional office sees on your request. Use the name you would sign an email with."
          >
            <TextInput name="name" required autoComplete="name" />
          </Field>

          <fieldset>
            <legend className="text-base font-bold text-ink-950">Your school</legend>

            {results.length > 0 ? (
              <div className="mt-3 max-h-96 space-y-2 overflow-y-auto border border-slate-200 p-3">
                {results.map((school) => (
                  <div key={school.nces_id} className="flex items-start gap-3">
                    <input
                      type="radio"
                      id={`school-${school.nces_id}`}
                      name="nces_id"
                      value={school.nces_id}
                      defaultChecked={domainMatch?.school.nces_id === school.nces_id}
                      className="mt-1.5 h-5 w-5 shrink-0 border-2 border-slate-600 accent-ink-900"
                    />
                    <label htmlFor={`school-${school.nces_id}`}>
                      <span className="font-medium">{school.name}</span>
                      <span className="block text-sm text-slate-500">
                        {[school.city, school.state].filter(Boolean).join(', ')}
                        {school.lea_name ? ` · ${school.lea_name}` : ''}
                        {school.is_charter === 1 ? ' · charter' : ''}
                      </span>
                    </label>
                  </div>
                ))}
              </div>
            ) : query.length >= 2 ? (
              <p className="mt-3 text-slate-600">
                No schools matched &ldquo;{query}&rdquo;
                {state ? ` in ${state}` : ''}. Try fewer words, or use the box below.
              </p>
            ) : domainMatch ? (
              <div className="mt-3 border border-slate-200 p-3">
                <div className="flex items-start gap-3">
                  <input
                    type="radio"
                    id={`school-${domainMatch.school.nces_id}`}
                    name="nces_id"
                    value={domainMatch.school.nces_id}
                    defaultChecked
                    className="mt-1.5 h-5 w-5 shrink-0 border-2 border-slate-600 accent-ink-900"
                  />
                  <label htmlFor={`school-${domainMatch.school.nces_id}`}>
                    <span className="font-medium">{domainMatch.school.name}</span>
                    <span className="block text-sm text-slate-500">
                      {domainMatch.school.city}, {domainMatch.school.state}
                    </span>
                  </label>
                </div>
              </div>
            ) : (
              <p className="mt-3 text-slate-600">Search for your school above.</p>
            )}
          </fieldset>

          <InsetText>
            <p className="font-bold text-ink-950">Not in the list?</p>
            <p className="mt-1 text-slate-600">
              The NCES directory covers public schools. If you are at a private school, a parochial
              school, a homeschool co-op, or a school that opened recently, type the name here
              instead. You get the whole product either way — verification affects the badge on your
              trip, never your access.
            </p>
          </InsetText>

          <Field label="Or type your school's name" name="school_freeform">
            <TextInput name="school_freeform" placeholder="St Anne's Academy" />
          </Field>

          <Button>Create account and email me a link</Button>
        </form>
      </Card>
    </div>
  );
}
