import type { CreatedInvitation, Invitation, InvitationListResponse, TripDetail } from '@chickaa/contracts';
import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { api, del, errorMessage, post } from '../api/client.ts';
import { useApi } from '../api/useApi.ts';
import { relativeTime } from '../lib/format.ts';
import { Badge, Button, Card, ErrorState, FormError, Loading, ScreenTitle, SelectField } from '../ui/index.tsx';

const EXPIRY = [
  { label: 'Never', hours: null },
  { label: '24 hours', hours: 24 },
  { label: '7 days', hours: 24 * 7 },
  { label: '30 days', hours: 24 * 30 },
] as const;
const USES = [
  { label: 'Unlimited', n: null },
  { label: '1 person', n: 1 },
  { label: '5 people', n: 5 },
  { label: '10 people', n: 10 },
] as const;

export function InviteScreen() {
  const { id } = useParams();
  const trip = useApi(() => api<TripDetail>(`/trips/${id}`), [id]);
  const list = useApi(() => api<InvitationListResponse>(`/trips/${id}/invitations`), [id]);
  const [expiry, setExpiry] = useState(0);
  const [uses, setUses] = useState(0);
  const [created, setCreated] = useState<CreatedInvitation | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  if (trip.error) return <ErrorState message={errorMessage(trip.error)} onRetry={trip.reload} />;
  if (!trip.data) return <Loading />;

  const create = async () => {
    setBusy(true);
    setError(undefined);
    try {
      const res = await post<CreatedInvitation>(`/trips/${id}/invitations`, {
        expiresInHours: EXPIRY[expiry]!.hours,
        maxUses: USES[uses]!.n,
      });
      setCreated(res);
      void list.reload();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (inv: Invitation) => {
    if (!window.confirm('Switch off this invite link? People who already joined stay in the trip.')) return;
    try {
      await del(`/invitations/${inv.id}`);
      if (created?.invitation.id === inv.id) setCreated(null);
      void list.reload();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <div className="space-y-4">
      <ScreenTitle title="Invite people" subtitle={trip.data.name} back={`/trips/${id}`} />

      {created ? (
        <ShareCard trip={trip.data} created={created} onAnother={() => setCreated(null)} />
      ) : (
        <Card>
          <h2 className="font-bold">New invite link</h2>
          <p className="mt-1 text-sm text-ink-700">Anyone with the link can join. Share it in your group chat or let friends scan the QR code.</p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <SelectField label="Link expires" value={expiry} onChange={(e) => setExpiry(Number(e.target.value))}>
              {EXPIRY.map((o, i) => (
                <option key={o.label} value={i}>
                  {o.label}
                </option>
              ))}
            </SelectField>
            <SelectField label="Can be used by" value={uses} onChange={(e) => setUses(Number(e.target.value))}>
              {USES.map((o, i) => (
                <option key={o.label} value={i}>
                  {o.label}
                </option>
              ))}
            </SelectField>
          </div>
          <FormError message={error} />
          <Button block className="mt-4" loading={busy} onClick={create}>
            Create invite link
          </Button>
        </Card>
      )}

      <Card>
        <h2 className="font-bold">Your invite links</h2>
        <p className="mt-1 text-xs text-ink-500">For security, a link is only shown in full right after you create it. Make a new one any time.</p>
        {list.loading && !list.data ? (
          <Loading />
        ) : !list.data?.invitations.length ? (
          <p className="mt-3 text-sm text-ink-500">None yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-ink-900/5">
            {list.data.invitations.map((inv) => (
              <li key={inv.id} className="flex items-center gap-3 py-3" data-testid="invite-row">
                <div className="min-w-0 flex-1 text-sm">
                  <div className="font-semibold">
                    Created {relativeTime(inv.createdAt)} · {inv.usageCount} joined
                    {inv.maxUses != null && ` of ${inv.maxUses}`}
                  </div>
                  <div className="text-ink-500">
                    {inv.revokedAt
                      ? 'Switched off'
                      : inv.expiresAt
                        ? new Date(inv.expiresAt) > new Date()
                          ? `Expires ${relativeTime(inv.expiresAt)}`
                          : 'Expired'
                        : 'Never expires'}
                  </div>
                </div>
                {inv.active ? (
                  <Button variant="danger" className="!min-h-10 !px-3 text-sm" onClick={() => revoke(inv)}>
                    Switch off
                  </Button>
                ) : (
                  <Badge>Inactive</Badge>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function ShareCard({ trip, created, onAnother }: { trip: TripDetail; created: CreatedInvitation; onAnother: () => void }) {
  const [svg, setSvg] = useState('');
  const [copied, setCopied] = useState(false);
  const text = `Join “${trip.name}” on ChickAA 🐣 so we can split trip costs:`;

  useEffect(() => {
    void QRCode.toString(created.url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#2B2118', light: '#FFFFFF' } }).then(setSvg);
  }, [created.url]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(created.url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked: the link is selectable */
    }
  };
  const share = async () => {
    try {
      await navigator.share({ title: `Join ${trip.name}`, text, url: created.url });
    } catch {
      /* cancelled */
    }
  };
  const canShare = typeof navigator.share === 'function';
  const enc = encodeURIComponent;

  return (
    <Card>
      <h2 className="font-bold">Share this link</h2>
      <div
        className="mx-auto mt-4 w-56 overflow-hidden rounded-2xl bg-white p-2 ring-1 ring-ink-900/10 [&_svg]:h-auto [&_svg]:w-full"
        role="img"
        aria-label="QR code for the invite link"
        data-testid="invite-qr"
        // Generated locally by the qrcode library from our own URL.
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      <output data-testid="invite-url" className="mt-4 block select-all break-all rounded-2xl bg-cream px-4 py-3 text-sm font-medium ring-1 ring-ink-900/10">
        {created.url}
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
            href={`https://wa.me/?text=${enc(`${text} ${created.url}`)}`}
            target="_blank"
            rel="noreferrer"
          >
            WhatsApp
          </a>
        )}
      </div>
      {!canShare && (
        <a
          className="mt-2 inline-flex min-h-12 w-full items-center justify-center rounded-2xl bg-[#229ED9] px-4 font-bold text-white"
          href={`https://t.me/share/url?url=${enc(created.url)}&text=${enc(text)}`}
          target="_blank"
          rel="noreferrer"
        >
          Telegram
        </a>
      )}
      <p className="mt-3 text-center text-xs text-ink-500">
        {created.invitation.expiresAt ? `Works until ${new Date(created.invitation.expiresAt).toLocaleString()}` : 'Never expires'}
        {created.invitation.maxUses != null && ` · up to ${created.invitation.maxUses} ${created.invitation.maxUses === 1 ? 'person' : 'people'}`}
      </p>
      <Button variant="ghost" block className="mt-2" onClick={onAnother}>
        Make a different link
      </Button>
    </Card>
  );
}
