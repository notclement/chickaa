import { useEffect, useState } from 'react';
import type { HealthResponse } from '@ncc/contracts';
import { api } from '../api/client.ts';
import { useOnline } from '../offline/useOnline.ts';
import { isStandalone, readPlatform } from '../pwa/platform.ts';

type Check = 'checking' | 'ok' | 'down' | 'offline';

/** Small "is everything working" card: handy when trying the app on a new phone. */
export function AppStatusCard() {
  const online = useOnline();
  const [server, setServer] = useState<Check>('checking');
  const [db, setDb] = useState<Check>('checking');
  const [swReady, setSwReady] = useState<boolean>(() => !!navigator.serviceWorker?.controller);
  const standalone = isStandalone(readPlatform());

  useEffect(() => {
    if (!online) {
      setServer('offline');
      setDb('offline');
      return;
    }
    let cancelled = false;
    api<HealthResponse>('/health')
      .then((h) => {
        if (cancelled) return;
        setServer('ok');
        setDb(h.db === 'ok' ? 'ok' : 'down');
      })
      .catch(() => {
        if (cancelled) return;
        setServer('down');
        setDb('down');
      });
    return () => {
      cancelled = true;
    };
  }, [online]);

  useEffect(() => {
    const sw = navigator.serviceWorker;
    if (!sw) return;
    const update = () => setSwReady(!!sw.controller);
    sw.addEventListener('controllerchange', update);
    void sw.ready.then(update);
    return () => sw.removeEventListener('controllerchange', update);
  }, []);

  return (
    <section aria-labelledby="status-title" className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-ink-900/5">
      <h2 id="status-title" className="font-bold">
        App status
      </h2>
      <dl className="mt-3 divide-y divide-ink-900/5 text-sm">
        <Row label="Works without internet" value={swReady ? 'Ready' : 'Setting up…'} good={swReady} />
        <Row label="Opened as" value={standalone ? 'Home-screen app' : 'Browser tab'} />
        <Row label="Server" value={label(server)} good={server === 'ok'} bad={server === 'down'} />
        <Row label="Database" value={label(db)} good={db === 'ok'} bad={db === 'down'} />
        <Row label="Version" value={__APP_VERSION__} mono />
      </dl>
    </section>
  );
}

function label(c: Check) {
  return { checking: 'Checking…', ok: 'Connected', down: 'Unreachable', offline: 'Offline' }[c];
}

function Row(props: { label: string; value: string; good?: boolean; bad?: boolean; mono?: boolean }) {
  const dot = props.good ? 'bg-owed' : props.bad ? 'bg-owes' : 'bg-ink-500/40';
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <dt className="text-ink-700">{props.label}</dt>
      <dd className={`flex items-center gap-2 font-semibold ${props.mono ? 'font-mono text-xs' : ''}`}>
        {props.good !== undefined || props.bad !== undefined ? (
          <span aria-hidden className={`inline-block size-2 rounded-full ${dot}`} />
        ) : null}
        {props.value}
      </dd>
    </div>
  );
}
