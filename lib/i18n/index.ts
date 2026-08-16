/**
 * Localisation, for the pages families actually read.
 *
 * ----------------------------------------------------------------------------
 * WHY ONLY SOME PAGES
 * ----------------------------------------------------------------------------
 * The thesis of this whole app is that the process quietly excludes schools
 * without an inside track. A permission slip and a what-you-cannot-bring list
 * that only exist in English are exactly where that exclusion lands on a
 * specific child: the one whose parent cannot read the form and therefore does
 * not sign it.
 *
 * So the student and family surfaces are translated, and the teacher and
 * congressional-office surfaces are not. That is a deliberate line, not an
 * unfinished job. A teacher planning a trip and a scheduler working a queue are
 * doing their jobs in the language their employer runs on; a family is not.
 *
 * ----------------------------------------------------------------------------
 * WHY NO LIBRARY
 * ----------------------------------------------------------------------------
 * The app has four runtime dependencies and no client-side JavaScript to speak
 * of. An i18n framework would add a bundle, a build step and a runtime for what
 * is, at this size, a typed object.
 *
 * The types do the important work: `Dictionary` is derived from the English
 * copy, so a missing Spanish string is a compile error rather than a sentence
 * that silently renders in English halfway down a translated page. Half-
 * translated is worse than untranslated — it reads as broken, and a reader
 * stops trusting the parts they can read.
 */

export const LOCALES = ['en', 'es'] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'en';

/** Native name, for the switcher. Never translate the name of a language. */
export const LOCALE_NAME: Record<Locale, string> = {
  en: 'English',
  es: 'Español',
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

/**
 * The locale for a request.
 *
 * A query parameter rather than a cookie or a path segment. It survives being
 * copied into a text message, which is how a link to this page actually reaches
 * a family, and it needs no client JavaScript and no redirect to apply.
 */
export function localeFrom(params: { lang?: string } | undefined): Locale {
  return isLocale(params?.lang) ? params.lang : DEFAULT_LOCALE;
}

/**
 * A dictionary for every locale, shaped by the English one.
 *
 * `T` is inferred from the `en` entry at the call site, so every other locale
 * must supply exactly the same keys with the same types.
 */
export type Translations<T> = Record<Locale, T>;

export function pick<T>(translations: Translations<T>, locale: Locale): T {
  return translations[locale] ?? translations[DEFAULT_LOCALE];
}

/**
 * BCP-47 tag for date and number formatting.
 *
 * Separate from `Locale` because the app's locale keys are language-only while
 * Intl wants a region to pick a date order — "es" alone gives a European format
 * that would be wrong for the audience this is for, who read US dates.
 */
export const INTL_TAG: Record<Locale, string> = {
  en: 'en-US',
  es: 'es-US',
};
