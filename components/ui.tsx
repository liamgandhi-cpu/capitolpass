/**
 * Shared UI primitives.
 *
 * Kept small and unclever on purpose. Every one of these is server-renderable;
 * nothing here needs client JavaScript, which keeps the app usable on a school
 * laptop with a slow connection and keeps the markup semantic for screen
 * readers.
 */

import type { ReactNode } from 'react';
import Link from 'next/link';

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------

type ButtonTone = 'primary' | 'secondary' | 'quiet' | 'danger';

const BUTTON_BASE =
  'inline-flex items-center justify-center gap-2 border-2 px-5 py-2.5 text-base font-bold ' +
  'no-underline transition-colors disabled:cursor-not-allowed disabled:opacity-50';

const BUTTON_TONES: Record<ButtonTone, string> = {
  primary:
    'border-ink-900 bg-ink-900 text-paper-50 hover:bg-ink-950 hover:border-ink-950 hover:text-paper-50',
  secondary:
    'border-ink-900 bg-transparent text-ink-900 hover:bg-ink-900 hover:text-paper-50',
  quiet:
    'border-transparent bg-transparent text-ink-700 underline hover:text-ink-950 px-0 py-1',
  danger:
    'border-stop-700 bg-transparent text-stop-700 hover:bg-stop-700 hover:text-paper-50',
};

export function Button({
  children,
  tone = 'primary',
  type = 'submit',
  name,
  value,
  disabled,
  className = '',
}: {
  children: ReactNode;
  tone?: ButtonTone;
  type?: 'submit' | 'button' | 'reset';
  name?: string;
  value?: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type={type}
      name={name}
      value={value}
      disabled={disabled}
      className={`${BUTTON_BASE} ${BUTTON_TONES[tone]} ${className}`}
    >
      {children}
    </button>
  );
}

export function ButtonLink({
  href,
  children,
  tone = 'primary',
  external = false,
  className = '',
}: {
  href: string;
  children: ReactNode;
  tone?: ButtonTone;
  external?: boolean;
  className?: string;
}) {
  const cls = `${BUTTON_BASE} ${BUTTON_TONES[tone]} ${className}`;

  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>
        {children}
        <span aria-hidden="true">↗</span>
        <span className="sr-only">(opens in a new tab)</span>
      </a>
    );
  }

  return (
    <Link href={href} className={cls}>
      {children}
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Layout blocks
// ---------------------------------------------------------------------------

export function Card({
  children,
  className = '',
  as: Tag = 'div',
  id,
}: {
  children: ReactNode;
  className?: string;
  as?: 'div' | 'section' | 'article' | 'li';
  /** Set when the card is a link target, e.g. an anchored rule on /rules. */
  id?: string;
}) {
  return (
    <Tag id={id} className={`border border-slate-200 bg-white p-6 ${className}`}>
      {children}
    </Tag>
  );
}

/**
 * GOV.UK-style inset text: a thick left rule marking something the reader
 * should not skim past. Used for the honest caveats.
 */
export function InsetText({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'warn' }) {
  const border = tone === 'warn' ? 'border-l-warn-700' : 'border-l-slate-300';
  return <div className={`border-l-[6px] ${border} bg-transparent py-2 pl-5`}>{children}</div>;
}

export function Panel({
  title,
  children,
  tone = 'info',
}: {
  title: string;
  children?: ReactNode;
  tone?: 'ok' | 'warn' | 'stop' | 'info';
}) {
  const tones = {
    ok: 'border-ok-700 bg-ok-100',
    warn: 'border-warn-700 bg-warn-100',
    stop: 'border-stop-700 bg-stop-100',
    info: 'border-info-700 bg-info-100',
  } as const;

  return (
    <div className={`border-l-[6px] ${tones[tone]} p-5`}>
      <h2 className="text-lg font-bold">{title}</h2>
      {children ? <div className="mt-2">{children}</div> : null}
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  lede,
  actions,
}: {
  eyebrow?: string;
  title: string;
  lede?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="border-b border-slate-200 pb-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl">
          {eyebrow ? (
            <p className="mb-1 text-sm font-bold uppercase tracking-wider text-slate-500">
              {eyebrow}
            </p>
          ) : null}
          <h1 className="text-3xl font-bold sm:text-4xl">{title}</h1>
          {lede ? <div className="mt-3 text-lg text-slate-600">{lede}</div> : null}
        </div>
        {actions ? <div className="flex flex-wrap gap-3">{actions}</div> : null}
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

export type StatusTone = 'ok' | 'warn' | 'stop' | 'info' | 'neutral';

const STATUS_TONES: Record<StatusTone, string> = {
  ok: 'border-ok-700 bg-ok-100 text-ok-700',
  warn: 'border-warn-700 bg-warn-100 text-warn-700',
  stop: 'border-stop-700 bg-stop-100 text-stop-700',
  info: 'border-info-700 bg-info-100 text-info-700',
  neutral: 'border-slate-400 bg-slate-100 text-slate-600',
};

/**
 * A status label. Always renders its text — colour is a reinforcement here,
 * never the only carrier of meaning.
 */
export function StatusPill({
  children,
  tone = 'neutral',
  className = '',
}: {
  children: ReactNode;
  tone?: StatusTone;
  className?: string;
}) {
  return (
    <span
      className={`inline-block border px-2 py-0.5 text-xs font-bold uppercase tracking-wide ${STATUS_TONES[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

/** A small monospace tag pointing at a rule id, e.g. R1. */
export function RuleTag({ id }: { id: string }) {
  return (
    <Link
      href={`/rules#${id}`}
      className="inline-block border border-slate-300 bg-slate-50 px-1.5 py-0.5 font-mono text-xs font-bold text-slate-600 no-underline hover:bg-slate-100 hover:text-ink-900"
      title="See the rule this came from"
    >
      {id}
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Forms
// ---------------------------------------------------------------------------

export function Field({
  label,
  name,
  hint,
  error,
  children,
  required,
}: {
  label: string;
  name: string;
  hint?: ReactNode;
  error?: string;
  children?: ReactNode;
  required?: boolean;
}) {
  const hintId = hint ? `${name}-hint` : undefined;
  const errorId = error ? `${name}-error` : undefined;

  return (
    <div className={error ? 'border-l-4 border-stop-700 pl-4' : ''}>
      <label htmlFor={name} className="block text-base font-bold text-ink-950">
        {label}
        {required ? (
          <span className="ml-1 text-stop-700" aria-hidden="true">
            *
          </span>
        ) : null}
        {required ? <span className="sr-only"> (required)</span> : null}
      </label>
      {hint ? (
        <p id={hintId} className="mt-1 text-sm text-slate-500">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="mt-1 text-sm font-bold text-stop-700">
          {error}
        </p>
      ) : null}
      <div className="mt-2">{children}</div>
    </div>
  );
}

const CONTROL =
  'w-full border-2 border-slate-600 bg-white px-3 py-2 text-base text-slate-800 ' +
  'placeholder:text-slate-400 focus:border-ink-900';

export function TextInput({
  name,
  type = 'text',
  defaultValue,
  placeholder,
  required,
  min,
  max,
  autoComplete,
  describedBy,
  inputMode,
  maxLength,
  pattern,
}: {
  name: string;
  type?: string;
  defaultValue?: string | number;
  placeholder?: string;
  required?: boolean;
  min?: number;
  max?: number;
  autoComplete?: string;
  describedBy?: string;
  inputMode?: 'text' | 'numeric' | 'email';
  maxLength?: number;
  pattern?: string;
}) {
  return (
    <input
      id={name}
      name={name}
      type={type}
      defaultValue={defaultValue}
      placeholder={placeholder}
      required={required}
      min={min}
      max={max}
      autoComplete={autoComplete}
      aria-describedby={describedBy}
      inputMode={inputMode}
      maxLength={maxLength}
      pattern={pattern}
      className={CONTROL}
    />
  );
}

export function Textarea({
  name,
  rows = 4,
  defaultValue,
  placeholder,
  required,
  maxLength,
}: {
  name: string;
  rows?: number;
  defaultValue?: string;
  placeholder?: string;
  required?: boolean;
  maxLength?: number;
}) {
  return (
    <textarea
      id={name}
      name={name}
      rows={rows}
      defaultValue={defaultValue}
      placeholder={placeholder}
      required={required}
      maxLength={maxLength}
      className={CONTROL}
    />
  );
}

export function Select({
  name,
  options,
  defaultValue,
  required,
}: {
  name: string;
  options: Array<{ value: string; label: string }>;
  defaultValue?: string;
  required?: boolean;
}) {
  return (
    <select id={name} name={name} defaultValue={defaultValue} required={required} className={CONTROL}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function CheckboxGroup({
  legend,
  name,
  options,
  hint,
  defaultValues = [],
}: {
  legend: string;
  name: string;
  options: Array<{ value: string; label: string }>;
  hint?: string;
  defaultValues?: string[];
}) {
  return (
    <fieldset>
      <legend className="text-base font-bold text-ink-950">{legend}</legend>
      {hint ? <p className="mt-1 text-sm text-slate-500">{hint}</p> : null}
      <div className="mt-2 space-y-2">
        {options.map((o) => (
          <div key={o.value} className="flex items-start gap-3">
            <input
              type="checkbox"
              id={`${name}-${o.value}`}
              name={name}
              value={o.value}
              defaultChecked={defaultValues.includes(o.value)}
              className="mt-1.5 h-5 w-5 shrink-0 border-2 border-slate-600 accent-ink-900"
            />
            <label htmlFor={`${name}-${o.value}`} className="text-base">
              {o.label}
            </label>
          </div>
        ))}
      </div>
    </fieldset>
  );
}

export function RadioGroup({
  legend,
  name,
  options,
  hint,
  defaultValue,
}: {
  legend: string;
  name: string;
  options: Array<{ value: string; label: string; hint?: string }>;
  hint?: string;
  defaultValue?: string;
}) {
  return (
    <fieldset>
      <legend className="text-base font-bold text-ink-950">{legend}</legend>
      {hint ? <p className="mt-1 text-sm text-slate-500">{hint}</p> : null}
      <div className="mt-2 space-y-2">
        {options.map((o) => (
          <div key={o.value} className="flex items-start gap-3">
            <input
              type="radio"
              id={`${name}-${o.value}`}
              name={name}
              value={o.value}
              defaultChecked={defaultValue === o.value}
              className="mt-1.5 h-5 w-5 shrink-0 border-2 border-slate-600 accent-ink-900"
            />
            <label htmlFor={`${name}-${o.value}`} className="text-base">
              <span className="font-medium">{o.label}</span>
              {o.hint ? <span className="block text-sm text-slate-500">{o.hint}</span> : null}
            </label>
          </div>
        ))}
      </div>
    </fieldset>
  );
}

/** Inline error summary at the top of a form, GOV.UK style. */
export function ErrorSummary({ errors }: { errors: string[] }) {
  if (errors.length === 0) return null;
  return (
    <div
      role="alert"
      tabIndex={-1}
      className="border-4 border-stop-700 p-5"
      aria-labelledby="error-summary-title"
    >
      <h2 id="error-summary-title" className="text-lg font-bold text-stop-700">
        There {errors.length === 1 ? 'is a problem' : `are ${errors.length} problems`}
      </h2>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        {errors.map((e) => (
          <li key={e} className="font-medium text-stop-700">
            {e}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Data display
// ---------------------------------------------------------------------------

/** Key/value list. Stacks on mobile rather than squeezing two columns. */
export function DescriptionList({
  items,
}: {
  items: Array<{ term: string; description: ReactNode }>;
}) {
  return (
    <dl className="divide-y divide-slate-200 border-y border-slate-200">
      {items.map((item) => (
        <div key={item.term} className="grid gap-1 py-3 sm:grid-cols-[14rem_1fr] sm:gap-4">
          <dt className="font-bold text-ink-950">{item.term}</dt>
          <dd className="text-slate-700">{item.description}</dd>
        </div>
      ))}
    </dl>
  );
}

export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="border-2 border-dashed border-slate-300 p-10 text-center">
      <h2 className="text-xl font-bold">{title}</h2>
      {children ? <div className="mx-auto mt-2 max-w-lg text-slate-600">{children}</div> : null}
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  );
}
