/**
 * Small presentational helpers for the translated pages.
 */

import Link from 'next/link';
import { LOCALES, LOCALE_NAME, type Locale } from '@/lib/i18n';

/**
 * Renders `**bold**` runs from a translated string.
 *
 * The alternative was splitting each sentence into three dictionary entries so
 * the emphasis could live in JSX. That makes the strings untranslatable in
 * practice — Spanish does not put the emphasis in the same place, and a
 * translator handed "Food and drink" / ", including water bottles" cannot move
 * it. Keeping the whole sentence intact, with the emphasis marked inside it, is
 * what lets the Spanish read like Spanish.
 *
 * Deliberately not Markdown: two asterisks, nothing else, no HTML.
 */
export function Emphasised({ text }: { text: string }) {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return (
    <>
      {parts.map((part, i) =>
        // Odd indices are the captured groups, i.e. the emphasised runs.
        i % 2 === 1 ? <strong key={i}>{part}</strong> : part,
      )}
    </>
  );
}

/**
 * Language switcher.
 *
 * Every option is always shown, each labelled in its own language — never a
 * flag, and never "translate this page". A parent scanning for a word they
 * recognise finds "Español" faster than they find anything else on the page,
 * which is the whole job.
 */
export function LanguageSwitcher({
  code,
  locale,
  label,
}: {
  code: string;
  locale: Locale;
  label: string;
}) {
  return (
    <nav
      aria-label={label}
      className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-slate-200 pb-3 text-sm"
    >
      <span className="font-bold text-slate-500">{label}</span>
      {LOCALES.map((option) => {
        const current = option === locale;
        return (
          <Link
            key={option}
            href={`/trip/${code}?lang=${option}`}
            hrefLang={option}
            lang={option}
            aria-current={current ? 'true' : undefined}
            className={
              current
                ? 'font-bold text-ink-950 no-underline'
                : 'font-bold text-ink-700 underline hover:text-ink-950'
            }
          >
            {LOCALE_NAME[option]}
          </Link>
        );
      })}
    </nav>
  );
}
