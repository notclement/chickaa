import type { SupporterPayNowResponse } from '@ncc/contracts';
import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { api, ApiRequestError, errorMessage } from '../api/client.ts';
import { useApi } from '../api/useApi.ts';
import { useMe } from '../auth/AuthContext.tsx';
import { DEVELOPER } from '../components/MadeBy.tsx';
import { SupporterBadge, supporterUntilText } from '../components/SupporterBadge.tsx';
import { SupporterPerks } from '../components/SupporterPerks.tsx';
import { Button, ButtonLink, Card, ErrorState, Loading, ScreenTitle } from '../ui/index.tsx';

const PAYNOW_PURPLE = '#7C1A78';

/** Become a Supporter: S$5 by PayNow (owner's QR + the user's reference), then a Telegram message. */
export function SupporterScreen() {
  const me = useMe();
  const { data, error, loading, reload } = useApi(() => api<SupporterPayNowResponse>('/supporter/paynow'), []);
  const [svg, setSvg] = useState('');
  const [png, setPng] = useState('');
  const [copied, setCopied] = useState<'ref' | 'msg' | null>(null);

  useEffect(() => {
    if (!data) return;
    const opts = { margin: 2, errorCorrectionLevel: 'M' as const, color: { dark: PAYNOW_PURPLE, light: '#FFFFFF' } };
    void QRCode.toString(data.payload, { ...opts, type: 'svg' }).then(setSvg);
    void QRCode.toDataURL(data.payload, { ...opts, width: 720 }).then(setPng);
  }, [data]);

  const notSetUp = error instanceof ApiRequestError && error.status === 404;
  if (error && !notSetUp) return <ErrorState message={errorMessage(error)} onRetry={reload} />;
  if (loading && !data && !error) return <Loading />;

  const amount = data?.amount ? `S$${data.amount.replace(/\.00$/, '')}` : 'S$5';
  const message = data
    ? `Hi,\nJust transferred you ${amount} to show my support for NoChickenCall\nHere is my reference code: ${data.reference}\nThank you!`
    : '';
  const telegram = `https://t.me/${DEVELOPER.telegram}?text=${encodeURIComponent(message)}`;
  const copy = async (what: 'ref' | 'msg', text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      /* clipboard blocked: the text is selectable */
    }
  };

  return (
    <div className="space-y-4">
      <ScreenTitle title="Become a Supporter" back="/account" />

      {me.supporter?.lifetime ? (
        <Card className="text-center" data-testid="supporter-thanks">
          <div className="text-4xl" aria-hidden>
            💛
          </div>
          <h2 className="mt-2 text-lg font-extrabold">Thank you for supporting!</h2>
          <p className="mt-1 text-sm text-ink-700">You’re a lifetime Supporter. It genuinely helps keep NoChickenCall running.</p>
        </Card>
      ) : (
        me.supporter?.active && (
          <Card className="!p-4 text-sm text-ink-700">
            <SupporterBadge supporter={me.supporter} /> You’re a Supporter {supporterUntilText(me.supporter)}. A lifetime one-off keeps it for good.
          </Card>
        )
      )}

      <Card>
        <p className="text-sm text-ink-700">
          NoChickenCall is a small side project by one person, so this part is a bit manual for now. Sorry it’s a little janky! If you’d like to chip in{' '}
          <b>{amount}</b> towards development and hosting, you’ll be a <b>💛 lifetime Supporter</b>. Thank you!
        </p>
      </Card>

      <Card>
        <SupporterPerks />
      </Card>

      {notSetUp || !data ? (
        <Card className="text-center text-ink-700">Supporting isn’t open just yet. Check back soon!</Card>
      ) : (
        <>
          <Card>
            <h2 className="font-bold">1. Chip in {amount} by PayNow</h2>
            <div
              className="mx-auto mt-4 w-60 overflow-hidden rounded-2xl bg-white p-2 ring-1 ring-ink-900/10 [&_svg]:h-auto [&_svg]:w-full"
              role="img"
              aria-label={`PayNow QR code for ${amount}`}
              data-testid="paynow-qr"
              // Generated locally by the qrcode library from the server's PayNow payload.
              dangerouslySetInnerHTML={{ __html: svg }}
            />
            <div className="mt-4 rounded-2xl bg-cream px-4 py-3 text-center ring-1 ring-ink-900/10">
              <div className="text-xs font-semibold uppercase tracking-wider text-ink-500">Your reference</div>
              <output className="mt-0.5 block select-all font-mono text-lg font-bold" data-testid="paynow-reference">
                {data.reference}
              </output>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={() => void copy('ref', data.reference)}>
                {copied === 'ref' ? '✓ Copied' : 'Copy reference'}
              </Button>
              {png && (
                <a
                  href={png}
                  download="nochickencall-paynow.png"
                  className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-white px-4 font-bold ring-1 ring-ink-900/10"
                >
                  Save QR
                </a>
              )}
            </div>
            <p className="mt-3 text-xs text-ink-500">
              On this phone? Save the QR (or screenshot it), then in your bank app choose <b>Scan QR → upload from photos</b>. The reference is filled in
              for you; if your bank asks, use <b>{data.reference}</b>.
            </p>
          </Card>

          <Card>
            <h2 className="font-bold">2. Tell me on Telegram</h2>
            <p className="mt-1 text-sm text-ink-700">
              Send your reference to <b>@{DEVELOPER.telegram}</b>. Once I see your transfer, I’ll switch on your lifetime Supporter status (usually within a day).
            </p>
            <a
              href={telegram}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex min-h-12 w-full items-center justify-center rounded-2xl bg-[#229ED9] px-4 font-bold text-white"
              data-testid="telegram-link"
            >
              Message @{DEVELOPER.telegram} on Telegram
            </a>
            <button type="button" className="mt-2 min-h-9 w-full text-sm font-semibold text-ink-700" onClick={() => void copy('msg', message)}>
              {copied === 'msg' ? '✓ Message copied' : 'Copy the message instead'}
            </button>
          </Card>
        </>
      )}

      <ButtonLink to="/invite-friend" variant="ghost" block>
        🎁 Or invite a friend: you both get a month as Supporter
      </ButtonLink>
    </div>
  );
}
