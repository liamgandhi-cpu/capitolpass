import { redirect } from 'next/navigation';
import {
  Button,
  Card,
  Field,
  InsetText,
  PageHeader,
  Panel,
  TextInput,
  Textarea,
} from '@/components/ui';
import { all, newId, nowIso, run } from '@/lib/db';

export const metadata = {
  title: 'Partner with CapitolPass',
  description: 'For restaurants near the Capitol that can seat a school group.',
};

async function submitLead(formData: FormData) {
  'use server';

  const businessName = String(formData.get('business_name') ?? '').trim();
  const email = String(formData.get('email') ?? '').trim().toLowerCase();

  if (businessName.length < 2 || !email.includes('@')) {
    redirect('/partners?error=1');
  }

  run(
    `INSERT INTO partner_leads (id, business_name, contact_name, email, phone, max_group, notes, created_at)
     VALUES (?,?,?,?,?,?,?,?)`,
    newId(),
    businessName,
    String(formData.get('contact_name') ?? '').trim() || null,
    email,
    String(formData.get('phone') ?? '').trim() || null,
    Number(formData.get('max_group')) || null,
    String(formData.get('notes') ?? '').trim() || null,
    nowIso(),
  );

  redirect('/partners?sent=1');
}

export default async function PartnersPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string }>;
}) {
  const query = await searchParams;

  let partnerCount = 0;
  let leadCount = 0;
  try {
    partnerCount = all<{ n: number }>('SELECT COUNT(*) AS n FROM venues WHERE is_partner = 1')[0]?.n ?? 0;
    leadCount = all<{ n: number }>('SELECT COUNT(*) AS n FROM partner_leads')[0]?.n ?? 0;
  } catch {
    // Not seeded.
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <PageHeader
        eyebrow="Roadmap, not a live programme"
        title="Partner with CapitolPass"
        lede="School groups are predictable, book weeks ahead, and arrive outside your lunch rush. If you can seat one, we want to list you accurately."
      />

      {/* --------------------------------------------------------------- */}
      {/* The honesty that makes this page worth having                    */}
      {/* --------------------------------------------------------------- */}
      <InsetText tone="warn">
        <p className="font-bold text-ink-950">
          Current partners: {partnerCount}. That is not a placeholder.
        </p>
        <p className="mt-1 text-slate-600">
          There are no restaurant partnerships yet, so no venue in our directory carries a Partner
          tag. We could have invented a few logos and nobody would have checked immediately — but the
          first person who did check would have been right to discount everything else we say. The
          directory is researched public information; a partnership is a relationship, and we do not
          have any of those yet.
          {leadCount > 0
            ? ` ${leadCount} ${leadCount === 1 ? 'business has' : 'businesses have'} registered interest through this form.`
            : ''}
        </p>
      </InsetText>

      {query.sent ? (
        <Panel title="Thank you — we have your details" tone="ok">
          <p>
            We will get in touch before listing you as a partner, and we will not tag you as one
            until you have agreed to it in writing.
          </p>
        </Panel>
      ) : null}

      {query.error ? (
        <Panel title="We need a business name and an email address" tone="stop">
          <p>Everything else is optional.</p>
        </Panel>
      ) : null}

      <Card>
        <h2 className="text-lg font-bold">What a partnership would mean</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-slate-600">
          <li>A verified listing with your real group capacity, lead time and price range.</li>
          <li>Advance group bookings from teachers who have already committed to a date.</li>
          <li>
            Honest placement. If a group is too big for you, we will say so rather than send them and
            waste everyone&rsquo;s time.
          </li>
          <li>No fee to be listed. We are not going to pretend otherwise later.</li>
        </ul>
      </Card>

      <Card>
        <h2 className="text-lg font-bold">Register your interest</h2>

        <form action={submitLead} className="mt-5 space-y-6">
          <Field label="Business name" name="business_name" required>
            <TextInput name="business_name" required />
          </Field>

          <Field label="Your name" name="contact_name">
            <TextInput name="contact_name" autoComplete="name" />
          </Field>

          <div className="grid gap-6 sm:grid-cols-2">
            <Field label="Email" name="email" required>
              <TextInput name="email" type="email" required inputMode="email" />
            </Field>
            <Field label="Phone" name="phone">
              <TextInput name="phone" type="tel" />
            </Field>
          </div>

          <Field
            label="Largest group you can seat"
            name="max_group"
            hint="An honest number is more useful to us than an optimistic one."
          >
            <TextInput name="max_group" type="number" min={1} max={500} inputMode="numeric" />
          </Field>

          <Field
            label="Anything else"
            name="notes"
            hint="Notice you need, dietary options, whether you can do a fixed-price group menu."
          >
            <Textarea name="notes" rows={4} />
          </Field>

          <Button>Register interest</Button>
        </form>
      </Card>
    </div>
  );
}
