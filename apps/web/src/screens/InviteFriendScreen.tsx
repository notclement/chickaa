import type { ReferralResponse } from '@chickaa/contracts';
import { useState } from 'react';
import { api, errorMessage } from '../api/client.ts';
import { useApi } from '../api/useApi.ts';
import { useMe } from '../auth/AuthContext.tsx';
import { SupporterBadge, supporterUntilText } from '../components/SupporterBadge.tsx';
import { SupporterPerks } from '../components/SupporterPerks.tsx';
import { Button, ButtonLink, Card, ErrorState, Loading, ScreenTitle } from '../ui/index.tsx';

/** "Invite a friend": a personal link; each friend who signs up gives you both a month as Supporter. */
export function InviteFriendScreen() {
  const me = useMe();
  const { data, error, loading, reload } = useApi(() => api<ReferralResponse>('/auth/me/referral'), []);
  const [copied, setCopied] = useState(false);

  if (error) return <ErrorState message={errorMessage(error)} onRetry={reload} />;
  if (loading && !data) return <Loading />;
  const url = `${location.origin}/r/${data!.code}`;
  const text = 'Split trip costs with me on ChickAA 🐣 Sign up with my link and we both get a month as Supporter:';
  const enc = encodeURIComponent;
  const canShare = typeof navigator.share === 'function';

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked: the link is selectable */
    }
  };
  const share = async () => {
    try {
      await navigator.share({ title: 'ChickAA', text, url });
    } catch {
      /* cancelled */
    }
  };

  return (
    <div className="space-y-4">
      <ScreenTitle title="Invite a friend" back="/account" />
      <Card>
        <div className="text-4xl" aria-hidden>
          🎁
        </div>
        <h2 className="mt-2 text-lg font-extrabold">You both get a month as Supporter</h2>
        <p className="mt-1 text-sm text-ink-700">
          Send your link to a friend. When they create an account with it, you each get <b>1 month as 💛 Supporter</b>. Invite more friends to stack more months.
        </p>
        <output data-testid="referral-url" className="mt-4 block select-all break-all rounded-2xl bg-cream px-4 py-3 text-sm font-medium ring-1 ring-ink-900/10">
          {url}
        </output>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button variant="secondary" onClick={copy}>
            {copied ? '✓ Copied' : 'Copy link'}
          </Button>
          {canShare ? (
            <Button onClick={share}>Share…</Button>
          ) : (
            <a
              className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-[#25D366] px-4 font-bold text-white"
              href={`https://wa.me/?text=${enc(`${text} ${url}`)}`}
              target="_blank"
              rel="noreferrer"
            >
              WhatsApp
            </a>
          )}
        </div>
      </Card>
      <Card className="!p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm text-ink-700">Friends who joined with your link</span>
          <b className="text-lg tabular-nums" data-testid="referral-count">
            {data!.invited}
          </b>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-ink-700">
          {me.supporter?.active ? (
            <>
              <SupporterBadge supporter={me.supporter} /> {supporterUntilText(me.supporter)}
            </>
          ) : (
            'You’re not a Supporter yet.'
          )}
        </div>
      </Card>
      <Card>
        <SupporterPerks />
      </Card>
      <p className="px-2 text-center text-xs text-ink-500">
        Supporters help keep ChickAA free for everyone.
      </p>
      <ButtonLink to="/supporter" variant="ghost" block>
        💛 Or become a lifetime Supporter
      </ButtonLink>
    </div>
  );
}
