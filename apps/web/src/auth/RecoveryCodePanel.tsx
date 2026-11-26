import { useState } from 'react';
import { Button, Card } from '../ui/index.tsx';

/**
 * Shows a recovery code exactly once. Without email or phone, this code is the
 * only way back into an account if the password is forgotten.
 */
export function RecoveryCodePanel({ code, onDone, doneLabel = 'Continue' }: { code: string; onDone: () => void; doneLabel?: string }) {
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked: the code is selectable */
    }
  };

  const share = async () => {
    try {
      await navigator.share({ title: 'ChickAA recovery code', text: `ChickAA recovery code: ${code}` });
    } catch {
      /* cancelled */
    }
  };

  return (
    <Card>
      <div className="text-3xl" aria-hidden>
        🔑
      </div>
      <h2 className="mt-2 text-xl font-extrabold">Save your recovery code</h2>
      <p className="mt-1 text-sm text-ink-700">
        There’s no email or phone on your account, so this code is the <b>only way</b> to reset a forgotten password. It won’t be shown
        again.
      </p>
      <output
        data-testid="recovery-code"
        className="mt-4 block select-all rounded-2xl bg-cream px-4 py-4 text-center font-mono text-xl font-bold tracking-wider text-ink-900 ring-1 ring-ink-900/10"
      >
        {code}
      </output>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={copy}>
          {copied ? '✓ Copied' : 'Copy'}
        </Button>
        {'share' in navigator ? (
          <Button variant="secondary" onClick={share}>
            Save / Share
          </Button>
        ) : (
          <Button variant="secondary" onClick={() => window.print()}>
            Print
          </Button>
        )}
      </div>
      <label className="mt-4 flex min-h-12 items-center gap-3 rounded-2xl bg-sun-300/30 px-4 py-3 text-sm font-semibold">
        <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} className="size-5 accent-tangerine-500" />
        I’ve saved it somewhere safe (e.g. my password manager or Notes)
      </label>
      <Button block className="mt-4" disabled={!saved} onClick={onDone}>
        {doneLabel}
      </Button>
    </Card>
  );
}
