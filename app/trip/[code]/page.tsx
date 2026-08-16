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
import { buildTransitPlan, stationNote } from '@/lib/transit/wmata';
import { localeFrom, pick, INTL_TAG } from '@/lib/i18n';
import { STUDENT_COPY } from '@/lib/i18n/student';
import { Emphasised, LanguageSwitcher } from '@/components/i18n';
import { RULES } from '@/lib/feasibility';
import { formatLong } from '@/lib/dates';
import { redirect } from 'next/navigation';

export const metadata = { title: 'Your trip' };

async function submitQuestion(formData: FormData) {
  'use server';
  const code = String(formData.get('code') ?? '');
  const name = String(formData.get('author_name') ?? '').trim();
  const body = String(formData.get('body') ?? '').trim();
  // Carried through the round trip, or a Spanish-speaking student submits a
  // question and lands back on an English page.
  const lang = String(formData.get('lang') ?? '');
  const suffix = lang ? `&lang=${encodeURIComponent(lang)}` : '';

  const trip = getTripByJoinCode(code);
  if (!trip) redirect('/join?error=not_found');
  if (name.length < 1 || body.length < 10) redirect(`/trip/${code}?q_error=1${suffix}`);

  addQuestion(trip.id, name.slice(0, 60), body.slice(0, 500));
  redirect(`/trip/${code}?q_sent=1${suffix}`);
}

export default async function StudentTripPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ q_sent?: string; q_error?: string; lang?: string }>;
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
  const locale = localeFrom(query);
  const t = pick(STUDENT_COPY, locale);
  const transit = await buildTransitPlan(trip.arrival_method, locale);
  const selected = questionsForTrip(trip.id, 'selected');

  return (
    <div className="mx-auto max-w-3xl space-y-12" lang={locale}>
      <LanguageSwitcher code={code} locale={locale} label={t.languageLabel} />

      <PageHeader
        eyebrow={school?.name ?? undefined}
        title={trip.title}
        lede={formatLong(trip.preferred_date, INTL_TAG[locale])}
      />

      {/* ================================================================== */}
      {/* What to bring — the thing that actually goes wrong on the day      */}
      {/* ================================================================== */}
      <section>
        <h2 className="text-2xl font-bold">{t.bringHeading}</h2>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Panel title={t.leaveBehind} tone="stop">
            <ul className="list-disc space-y-1 pl-5">
              {t.leaveItems.map((item) => (
                <li key={item}>
                  <Emphasised text={item} />
                </li>
              ))}
            </ul>
          </Panel>

          <Panel title={t.bringThese} tone="ok">
            <ul className="list-disc space-y-1 pl-5">
              {t.bringItems.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </Panel>
        </div>

        <div className="mt-4">
          <InsetText tone="warn">
            <p className="text-slate-600">
              {t.screening(RULES.securityScreeningBufferMinutes.value)}
            </p>
          </InsetText>
        </div>
      </section>

      {/* ================================================================== */}
      {/* Getting there                                                      */}
      {/* ================================================================== */}
      <section>
        <h2 className="text-2xl font-bold">{t.gettingThereHeading}</h2>
        <Card className="mt-4">
          <h3 className="text-lg font-bold">
            {transit.station.name}{' '}
            <span className="font-normal text-slate-500">
              ({transit.station.lines.join(', ')})
            </span>
          </h3>
          <p className="mt-1 text-slate-600">{stationNote(transit.station, locale)}</p>
          <p className="mt-2 font-bold">{t.walkMinutes(transit.walkMinutes)}</p>

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
          <h2 className="text-2xl font-bold">{t.repHeading}</h2>

          <Card className="mt-4">
            <div className="flex flex-wrap gap-6">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={rep.photoUrl}
                alt={t.portraitAlt(rep.name)}
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
                    <h4 className="font-bold">{t.committees}</h4>
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
                    <p className="mt-2 text-sm text-slate-500">{t.committeesNote}</p>
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
          <h2 className="text-2xl font-bold">{t.questionsHeading}</h2>
          <p className="mt-1 text-slate-600">{t.questionsIntro}</p>

          {query.q_sent ? (
            <Panel title={t.questionSentTitle} tone="ok">
              <p>{t.questionSentBody}</p>
            </Panel>
          ) : null}

          {query.q_error ? (
            <Panel title={t.questionErrorTitle} tone="stop">
              <p>{t.questionErrorBody}</p>
            </Panel>
          ) : null}

          <Card className="mt-4">
            <form action={submitQuestion} className="space-y-5">
              <input type="hidden" name="code" value={code} />
              <input type="hidden" name="lang" value={locale} />

              <Field label={t.firstNameLabel} name="author_name" required>
                <TextInput name="author_name" required maxLength={60} />
              </Field>

              <Field label={t.questionLabel} name="body" required hint={t.questionHint}>
                <Textarea name="body" rows={4} required maxLength={500} />
              </Field>

              <Button>{t.submitQuestion}</Button>
            </form>
          </Card>

          {selected.length > 0 ? (
            <div className="mt-6">
              <h3 className="text-lg font-bold">{t.chosenHeading}</h3>
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
        <h2 className="text-2xl font-bold">{t.civicsHeading}</h2>

        <div className="mt-4">
          <DescriptionList items={t.civics} />
        </div>
      </section>
    </div>
  );
}
