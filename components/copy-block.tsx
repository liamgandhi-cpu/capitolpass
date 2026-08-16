'use client';

import { useState } from 'react';

/**
 * A block of text with a copy button.
 *
 * The textarea is the real control and it works with no JavaScript at all —
 * a teacher can select it and copy by hand. The button is an enhancement on
 * top, and it announces its result rather than silently changing colour, so
 * a screen reader user knows the copy happened.
 */
export function CopyBlock({ text, label }: { text: string; label: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setState('copied');
      setTimeout(() => setState('idle'), 4000);
    } catch {
      setState('failed');
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label htmlFor="packet-text" className="text-base font-bold text-ink-950">
          {label}
        </label>
        <button
          type="button"
          onClick={copy}
          className="border-2 border-ink-900 bg-ink-900 px-4 py-1.5 text-sm font-bold text-paper-50 hover:bg-ink-950"
        >
          Copy all
        </button>
      </div>

      <p aria-live="polite" className="mt-1 min-h-[1.25rem] text-sm font-bold text-ok-700">
        {state === 'copied' ? 'Copied to your clipboard.' : null}
        {state === 'failed' ? (
          <span className="text-stop-700">
            Your browser blocked the copy. Select the text below and copy it manually.
          </span>
        ) : null}
      </p>

      <textarea
        id="packet-text"
        readOnly
        value={text}
        rows={16}
        className="mt-1 w-full border-2 border-slate-600 bg-white p-3 font-mono text-sm"
        onFocus={(e) => e.currentTarget.select()}
      />
    </div>
  );
}
