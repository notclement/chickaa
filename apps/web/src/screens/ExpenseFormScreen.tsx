import type { CreateExpenseRequest, Expense, FxRateResponse, Member, RateChoice, SplitRequest, TripDetail } from '@ncc/contracts';
import {
  buildExpense,
  CURRENCIES,
  CURRENCY_CODES,
  formatAmount,
  formatPercent,
  isCurrencyCode,
  parsePercent,
  parseRate,
  type CurrencyCode,
  type SplitInput,
} from '@ncc/core';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router';
import { api, ApiRequestError, errorMessage, post } from '../api/client.ts';
import { useMe } from '../auth/AuthContext.tsx';
import { money, normalizeAmountInput, todayLocal, tryParseAmount } from '../lib/money.ts';
import { useTrip } from '../lib/useTrip.ts';
import { useUnsavedChanges } from '../pwa/unsavedChanges.ts';
import { Avatar, Button, Card, ErrorState, FormError, Loading, ScreenTitle, SelectField, TextField } from '../ui/index.tsx';

type SplitType = SplitRequest['type'];
type RateMode = 'auto' | 'manual';

interface FormState {
  description: string;
  amount: string;
  currency: CurrencyCode;
  date: string;
  notes: string;
  multiPayer: boolean;
  payer: string;
  payerAmounts: Record<string, string>;
  splitType: SplitType;
  included: Record<string, boolean>;
  exact: Record<string, string>;
  percents: Record<string, string>;
  shares: Record<string, number>;
  rateMode: RateMode;
  manualRate: string;
}

const lastCurrencyKey = (tripId: string) => `ncc.user.lastCurrency.${tripId}`;

function initialState(trip: TripDetail, me: string, existing?: Expense): FormState {
  const ids = trip.members.map((m) => m.userId);
  const all = <T,>(v: T) => Object.fromEntries(ids.map((id) => [id, v])) as Record<string, T>;
  if (!existing) {
    let currency = trip.baseCurrency as CurrencyCode;
    try {
      const last = localStorage.getItem(lastCurrencyKey(trip.id));
      if (last && isCurrencyCode(last)) currency = last;
    } catch {
      /* storage unavailable */
    }
    return {
      description: '',
      amount: '',
      currency,
      date: todayLocal(),
      notes: '',
      multiPayer: false,
      payer: me,
      payerAmounts: all(''),
      splitType: 'equal',
      included: all(true),
      exact: all(''),
      percents: all(''),
      shares: all(1),
      rateMode: 'auto',
      manualRate: '',
    };
  }
  const cur = existing.currency as CurrencyCode;
  const fmt = (minor: string) => formatAmount(BigInt(minor), cur).replaceAll(',', '');
  const inSplit = new Map(existing.splits.map((s) => [s.userId, s]));
  return {
    description: existing.description,
    amount: fmt(existing.amount),
    currency: cur,
    date: existing.expenseDate,
    notes: existing.notes ?? '',
    multiPayer: existing.payers.length > 1,
    payer: existing.payers[0]?.userId ?? me,
    payerAmounts: { ...all(''), ...Object.fromEntries(existing.payers.map((p) => [p.userId, fmt(p.amount)])) },
    splitType: existing.splitType,
    included: Object.fromEntries(ids.map((id) => [id, inSplit.has(id)])),
    exact: { ...all(''), ...Object.fromEntries(existing.splits.map((s) => [s.userId, fmt(s.amount)])) },
    percents: { ...all(''), ...Object.fromEntries(existing.splits.filter((s) => s.percentBp).map((s) => [s.userId, formatPercent(s.percentBp!)])) },
    shares: { ...all(0), ...Object.fromEntries(existing.splits.map((s) => [s.userId, s.shares ?? 1])) },
    rateMode: existing.rateSource === 'manual' ? 'manual' : 'auto',
    manualRate: existing.rateSource === 'manual' ? existing.rate : '',
  };
}

/** Request body from the form. Throws a readable Error if something is missing. */
function toRequest(f: FormState, members: Member[], suggestion: FxRateResponse | null, baseCurrency: string): Omit<CreateExpenseRequest, 'clientId'> {
  const ids = members.map((m) => m.userId);
  const amount = normalizeAmountInput(f.amount);
  const payers = f.multiPayer
    ? ids.filter((id) => f.payerAmounts[id]?.trim()).map((id) => ({ userId: id, amount: normalizeAmountInput(f.payerAmounts[id]!) }))
    : [{ userId: f.payer, amount }];

  let split: SplitRequest;
  switch (f.splitType) {
    case 'equal':
      split = { type: 'equal', participants: ids.filter((id) => f.included[id]) };
      break;
    case 'exact':
      split = { type: 'exact', amounts: ids.filter((id) => f.exact[id]?.trim()).map((id) => ({ userId: id, amount: normalizeAmountInput(f.exact[id]!) })) };
      break;
    case 'percentage':
      split = { type: 'percentage', percents: ids.filter((id) => f.percents[id]?.trim()).map((id) => ({ userId: id, percent: f.percents[id]!.trim() })) };
      break;
    case 'shares':
      split = { type: 'shares', shares: ids.filter((id) => (f.shares[id] ?? 0) > 0).map((id) => ({ userId: id, shares: f.shares[id]! })) };
      break;
  }

  let rate: RateChoice | undefined;
  if (f.currency !== baseCurrency) {
    if (f.rateMode === 'manual') rate = { source: 'manual', value: f.manualRate.trim() };
    else if (suggestion?.source === 'trip_fixed') rate = { source: 'trip_fixed' };
    else rate = { source: 'api' };
  }

  return { description: f.description.trim(), notes: f.notes.trim() || null, expenseDate: f.date, currency: f.currency, amount, rate, payers, split };
}

/** Client-side preview with the same engine the server uses. */
function preview(f: FormState, members: Member[], rate: string | null, baseCurrency: string) {
  const total = tryParseAmount(f.amount, f.currency);
  if (!total || total <= 0n || !rate || !isCurrencyCode(baseCurrency)) return { ok: false as const, total };
  const req = toRequest(f, members, null, baseCurrency);
  try {
    let split: SplitInput;
    const s = req.split;
    if (s.type === 'exact') split = { type: 'exact', amounts: s.amounts.map((a) => ({ userId: a.userId, amount: tryParseAmount(a.amount, f.currency) ?? -1n })) };
    else if (s.type === 'percentage') split = { type: 'percentage', percents: s.percents.map((p) => ({ userId: p.userId, basisPoints: parsePercent(p.percent) })) };
    else split = s;
    const built = buildExpense({
      total,
      currency: f.currency,
      baseCurrency,
      rate: f.currency === baseCurrency ? '1' : rate,
      payers: req.payers.map((p) => ({ userId: p.userId, amount: tryParseAmount(p.amount, f.currency) ?? -1n })),
      split,
    });
    return { ok: true as const, total, built };
  } catch (err) {
    return { ok: false as const, total, error: errorMessage(err) };
  }
}

export function NewExpenseScreen() {
  const { id } = useParams();
  return <ExpenseFormLoader tripId={id!} />;
}

export function EditExpenseScreen() {
  const { eid } = useParams();
  const [expense, setExpense] = useState<Expense>();
  const [error, setError] = useState<unknown>();
  useEffect(() => {
    api<Expense>(`/expenses/${eid}`).then(setExpense, setError);
  }, [eid]);
  if (error) return <ErrorState message={errorMessage(error)} />;
  if (!expense) return <Loading />;
  if (expense.deleted) return <ErrorState message="This expense was deleted." />;
  return <ExpenseFormLoader tripId={expense.tripId} existing={expense} />;
}

function ExpenseFormLoader({ tripId, existing }: { tripId: string; existing?: Expense }) {
  const { trip, error, reload } = useTrip(tripId);
  if (error) return <ErrorState message={errorMessage(error)} onRetry={reload} />;
  if (!trip) return <Loading />;
  if (trip.status !== 'active') return <ErrorState message="This trip is completed, so expenses can’t be changed." />;
  return <ExpenseForm trip={trip} existing={existing} />;
}

function ExpenseForm({ trip, existing }: { trip: TripDetail; existing?: Expense }) {
  const me = useMe();
  const navigate = useNavigate();
  const [clientId] = useState(() => crypto.randomUUID());
  const initial = useMemo(() => initialState(trip, me.id, existing), [trip, me.id, existing]);
  const [f, setF] = useState<FormState>(initial);
  const [suggestion, setSuggestion] = useState<FxRateResponse | null>(null);
  const [rateError, setRateError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [uncertain, setUncertain] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [triedSubmit, setTriedSubmit] = useState(false);
  const base = trip.baseCurrency;
  const foreign = f.currency !== base;
  const dirty = JSON.stringify(f) !== JSON.stringify(initial);
  useUnsavedChanges(dirty && !busy);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((s) => ({ ...s, [k]: v }));
  const setIn = <K extends 'payerAmounts' | 'exact' | 'percents' | 'included' | 'shares'>(k: K, uid: string, v: FormState[K][string]) =>
    setF((s) => ({ ...s, [k]: { ...s[k], [uid]: v } }));

  // Suggested exchange rate for the chosen currency + date.
  useEffect(() => {
    if (!foreign) {
      setSuggestion(null);
      setRateError(undefined);
      return;
    }
    if (existing && existing.currency === f.currency && existing.expenseDate === f.date && existing.rateSource !== 'manual') {
      setSuggestion({ from: f.currency, to: base, rate: existing.rate, date: existing.rateDate, source: existing.rateSource === 'trip_fixed' ? 'trip_fixed' : 'api', provider: null });
      return;
    }
    let cancelled = false;
    setSuggestion(null);
    setRateError(undefined);
    api<FxRateResponse>(`/trips/${trip.id}/fx-rate?currency=${f.currency}&date=${f.date}`).then(
      (r) => !cancelled && setSuggestion(r),
      (e) => {
        if (cancelled) return;
        setRateError(errorMessage(e));
        setF((s) => ({ ...s, rateMode: 'manual' }));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [foreign, f.currency, f.date, trip.id, base, existing]);

  const effectiveRate = !foreign ? '1' : f.rateMode === 'manual' ? (isValidRate(f.manualRate) ? f.manualRate : null) : (suggestion?.rate ?? null);
  const pv = preview(f, trip.members, effectiveRate, base);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTriedSubmit(true);
    setError(undefined);
    setUncertain(false);
    if (!f.description.trim()) return setError('What was it for?');
    if (!pv.ok) return setError(pv.error ?? (pv.total ? 'Check the exchange rate' : 'Enter the amount'));
    setBusy(true);
    try {
      const req = toRequest(f, trip.members, suggestion, base);
      if (existing) {
        await api<Expense>(`/expenses/${existing.id}`, { method: 'PUT', json: { ...req, version: existing.version } });
      } else {
        await post<Expense>(`/trips/${trip.id}/expenses`, { ...req, clientId });
        try {
          localStorage.setItem(lastCurrencyKey(trip.id), f.currency);
        } catch {
          /* ignore */
        }
      }
      navigate(`/trips/${trip.id}`, { replace: true });
    } catch (err) {
      setBusy(false);
      if (err instanceof ApiRequestError && err.isNetwork) {
        // The request may have reached the server. Retrying is safe: the same clientId can't save twice.
        setUncertain(true);
      } else if (err instanceof ApiRequestError && err.status === 409 && existing) {
        setConflict(true);
        setError(err.message);
      } else {
        setError(errorMessage(err));
      }
    }
  };

  const totalMinor = pv.total ?? null;
  const shareOf = (uid: string) => (pv.ok ? pv.built.splits.find((s) => s.userId === uid) : undefined);

  return (
    <>
      <ScreenTitle title={existing ? 'Edit expense' : 'Add expense'} subtitle={trip.name} back={existing ? `/expenses/${existing.id}` : `/trips/${trip.id}`} />
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Card>
          <div className="grid grid-cols-[1fr_auto] gap-3">
            <TextField
              label="Amount"
              inputMode="decimal"
              placeholder={CURRENCIES[f.currency].decimals ? '0.00' : '0'}
              value={f.amount}
              onChange={(e) => set('amount', e.target.value)}
              autoFocus={!existing}
              className="[&_input]:text-2xl [&_input]:font-extrabold"
            />
            <SelectField label="Currency" value={f.currency} onChange={(e) => set('currency', e.target.value as CurrencyCode)} className="w-28">
              {CURRENCY_CODES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </SelectField>
          </div>
          <TextField className="mt-3" label="What was it for?" placeholder="Dinner at Jimbaran" value={f.description} onChange={(e) => set('description', e.target.value)} maxLength={80} />
          <TextField className="mt-3" label="Date" type="date" value={f.date} onChange={(e) => set('date', e.target.value || todayLocal())} />
          {foreign && (
            <RateBox
              f={f}
              base={base}
              suggestion={suggestion}
              rateError={rateError}
              setMode={(m) => set('rateMode', m)}
              setManual={(v) => set('manualRate', v)}
              converted={pv.ok ? money(pv.built.baseTotal, base) : null}
            />
          )}
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <h2 className="font-bold">Paid by</h2>
            <button type="button" className="rounded-xl px-2 py-1 text-sm font-semibold text-tangerine-600" onClick={() => set('multiPayer', !f.multiPayer)}>
              {f.multiPayer ? 'One person' : 'Several people'}
            </button>
          </div>
          {!f.multiPayer ? (
            <div className="mt-3 flex flex-wrap gap-2" role="radiogroup" aria-label="Who paid">
              {trip.members.map((m) => (
                <Chip key={m.userId} selected={f.payer === m.userId} onClick={() => set('payer', m.userId)} label={m.userId === me.id ? 'You' : m.displayName} avatarName={m.displayName} id={m.userId} role="radio" />
              ))}
            </div>
          ) : (
            <PerPerson
              members={trip.members}
              me={me.id}
              values={f.payerAmounts}
              onChange={(uid, v) => setIn('payerAmounts', uid, v)}
              suffix={f.currency}
              remaining={remaining(totalMinor, trip.members.map((m) => f.payerAmounts[m.userId] ?? ''), f.currency)}
            />
          )}
        </Card>

        <Card>
          <h2 className="font-bold">Split</h2>
          <div className="mt-3 grid grid-cols-4 gap-1 rounded-2xl bg-ink-900/5 p-1" role="tablist" aria-label="Split method">
            {(
              [
                ['equal', 'Equally'],
                ['exact', 'Amounts'],
                ['percentage', '%'],
                ['shares', 'Shares'],
              ] as const
            ).map(([t, label]) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={f.splitType === t}
                onClick={() => set('splitType', t)}
                className={`min-h-10 rounded-xl text-sm font-bold ${f.splitType === t ? 'bg-white shadow-sm' : 'text-ink-500'}`}
              >
                {label}
              </button>
            ))}
          </div>

          {f.splitType === 'equal' && (
            <ul className="mt-3 divide-y divide-ink-900/5">
              {trip.members.map((m) => (
                <li key={m.userId}>
                  <label className="flex min-h-12 items-center gap-3 py-1">
                    <input type="checkbox" checked={!!f.included[m.userId]} onChange={(e) => setIn('included', m.userId, e.target.checked)} className="size-5 accent-tangerine-500" />
                    <Avatar name={m.displayName} id={m.userId} size="sm" />
                    <span className="flex-1 font-semibold">{m.userId === me.id ? 'You' : m.displayName}</span>
                    <ShareHint share={shareOf(m.userId)} base={base} />
                  </label>
                </li>
              ))}
            </ul>
          )}

          {f.splitType === 'exact' && (
            <PerPerson
              members={trip.members}
              me={me.id}
              values={f.exact}
              onChange={(uid, v) => setIn('exact', uid, v)}
              suffix={f.currency}
              remaining={remaining(totalMinor, trip.members.map((m) => f.exact[m.userId] ?? ''), f.currency)}
            />
          )}

          {f.splitType === 'percentage' && (
            <PerPerson
              members={trip.members}
              me={me.id}
              values={f.percents}
              onChange={(uid, v) => setIn('percents', uid, v)}
              suffix="%"
              remaining={percentRemaining(trip.members.map((m) => f.percents[m.userId] ?? ''))}
              hintFor={(uid) => <ShareHint share={shareOf(uid)} base={base} />}
            />
          )}

          {f.splitType === 'shares' && (
            <ul className="mt-3 divide-y divide-ink-900/5">
              {trip.members.map((m) => {
                const n = f.shares[m.userId] ?? 0;
                return (
                  <li key={m.userId} className="flex min-h-12 items-center gap-3 py-1">
                    <Avatar name={m.displayName} id={m.userId} size="sm" />
                    <span className="flex-1 font-semibold">
                      {m.userId === me.id ? 'You' : m.displayName}
                      <span className="block text-xs font-normal">
                        <ShareHint share={shareOf(m.userId)} base={base} />
                      </span>
                    </span>
                    <div className="flex items-center gap-1">
                      <StepButton label={`Fewer shares for ${m.displayName}`} onClick={() => setIn('shares', m.userId, Math.max(0, n - 1))}>
                        −
                      </StepButton>
                      <span className="w-8 text-center font-bold tabular-nums" aria-label={`${m.displayName} shares`}>
                        {n}
                      </span>
                      <StepButton label={`More shares for ${m.displayName}`} onClick={() => setIn('shares', m.userId, Math.min(1000, n + 1))}>
                        ＋
                      </StepButton>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card>
          <label htmlFor="exp-notes" className="mb-1.5 block text-sm font-semibold text-ink-700">
            Notes (optional)
          </label>
          <textarea
            id="exp-notes"
            rows={2}
            maxLength={500}
            value={f.notes}
            onChange={(e) => set('notes', e.target.value)}
            className="block w-full rounded-2xl border-0 bg-white px-4 py-3 ring-1 ring-ink-900/10 focus:ring-2 focus:ring-tangerine-500 focus:outline-none"
          />
        </Card>

        {triedSubmit && !pv.ok && pv.error && <FormError message={pv.error} />}
        <FormError message={error} />
        {conflict && existing && (
          <Button type="button" variant="secondary" block onClick={() => window.location.reload()}>
            Load the latest version
          </Button>
        )}
        {uncertain && (
          <div role="alert" className="rounded-2xl bg-sun-300/50 px-4 py-3 text-sm font-semibold">
            Not sure it saved: the connection dropped. Tap Save again. It won’t be added twice.
          </div>
        )}
        <div className="sticky bottom-safe z-10">
          <Button type="submit" block loading={busy} className="shadow-lg">
            {uncertain ? 'Try saving again' : existing ? 'Save changes' : pv.ok ? `Save · ${money(pv.built.total, f.currency)}` : 'Save expense'}
          </Button>
        </div>
      </form>
    </>
  );
}

function isValidRate(s: string) {
  try {
    parseRate(s);
    return true;
  } catch {
    return false;
  }
}

function remaining(total: bigint | null, values: string[], currency: CurrencyCode): { text: string; ok: boolean } | null {
  if (!total) return null;
  let sum = 0n;
  for (const v of values) if (v.trim()) sum += tryParseAmount(v, currency) ?? 0n;
  const left = total - sum;
  if (left === 0n) return { text: '✓ Adds up', ok: true };
  return left > 0n ? { text: `${money(left, currency)} left to assign`, ok: false } : { text: `${money(-left, currency)} too much`, ok: false };
}

function percentRemaining(values: string[]): { text: string; ok: boolean } {
  let bp = 0;
  for (const v of values) {
    if (!v.trim()) continue;
    try {
      bp += parsePercent(v);
    } catch {
      /* shown on submit */
    }
  }
  const left = 10_000 - bp;
  if (left === 0) return { text: '✓ 100%', ok: true };
  return left > 0 ? { text: `${formatPercent(left)}% left`, ok: false } : { text: `${formatPercent(-left)}% too much`, ok: false };
}

function RateBox(props: {
  f: FormState;
  base: string;
  suggestion: FxRateResponse | null;
  rateError: string | undefined;
  setMode: (m: RateMode) => void;
  setManual: (v: string) => void;
  converted: string | null;
}) {
  const { f, base, suggestion } = props;
  return (
    <div className="mt-3 rounded-2xl bg-cream p-3 ring-1 ring-ink-900/10" data-testid="rate-box">
      {f.rateMode === 'auto' ? (
        suggestion ? (
          <p className="text-sm">
            <b>
              1 {f.currency} = {suggestion.rate} {base}
            </b>
            <span className="block text-ink-500">
              {suggestion.source === 'trip_fixed' ? 'Trip’s fixed rate' : `Daily rate for ${suggestion.date}${suggestion.provider ? ` · ${suggestion.provider}` : ''}`}
            </span>
          </p>
        ) : (
          <p className="text-sm text-ink-500">Getting today’s rate…</p>
        )
      ) : (
        <>
          {props.rateError && <p className="mb-2 text-sm font-medium text-owes">{props.rateError}</p>}
          <TextField
            label={`1 ${f.currency} = ? ${base}`}
            inputMode="decimal"
            placeholder="0.0375"
            value={f.manualRate}
            onChange={(e) => props.setManual(e.target.value)}
            hint="The rate you actually got, e.g. from your bank app"
          />
        </>
      )}
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-sm font-bold" data-testid="converted">
          {props.converted ? `≈ ${props.converted}` : ''}
        </span>
        <button
          type="button"
          className="rounded-xl px-2 py-1 text-sm font-semibold text-tangerine-600"
          onClick={() => props.setMode(f.rateMode === 'auto' ? 'manual' : 'auto')}
        >
          {f.rateMode === 'auto' ? 'Use my own rate' : suggestion ? 'Use suggested rate' : ''}
        </button>
      </div>
    </div>
  );
}

function PerPerson(props: {
  members: Member[];
  me: string;
  values: Record<string, string>;
  onChange: (uid: string, v: string) => void;
  suffix: string;
  remaining: { text: string; ok: boolean } | null;
  hintFor?: (uid: string) => React.ReactNode;
}) {
  return (
    <div className="mt-3">
      <ul className="space-y-2">
        {props.members.map((m) => (
          <li key={m.userId} className="flex items-center gap-3">
            <Avatar name={m.displayName} id={m.userId} size="sm" />
            <span className="min-w-0 flex-1 truncate font-semibold">
              {m.userId === props.me ? 'You' : m.displayName}
              {props.hintFor && <span className="block text-xs font-normal">{props.hintFor(m.userId)}</span>}
            </span>
            <div className="flex w-36 items-center gap-1">
              <input
                aria-label={`${m.displayName} ${props.suffix === '%' ? 'percent' : 'amount'}`}
                inputMode="decimal"
                value={props.values[m.userId] ?? ''}
                onChange={(e) => props.onChange(m.userId, e.target.value)}
                placeholder="0"
                className="min-h-11 w-full rounded-xl border-0 bg-white px-3 text-right ring-1 ring-ink-900/10 focus:ring-2 focus:ring-tangerine-500 focus:outline-none"
              />
              <span className="w-9 text-xs font-semibold text-ink-500">{props.suffix}</span>
            </div>
          </li>
        ))}
      </ul>
      {props.remaining && (
        <p className={`mt-2 text-right text-sm font-semibold ${props.remaining.ok ? 'text-owed' : 'text-tangerine-700'}`} data-testid="remaining">
          {props.remaining.text}
        </p>
      )}
    </div>
  );
}

function ShareHint({ share, base }: { share?: { original: bigint; base: bigint } | undefined; base: string }) {
  if (!share) return null;
  return <span className="text-sm text-ink-500 tabular-nums">{money(share.base, base)}</span>;
}

function Chip({ selected, onClick, label, avatarName, id, role }: { selected: boolean; onClick: () => void; label: string; avatarName: string; id: string; role?: string }) {
  return (
    <button
      type="button"
      role={role}
      aria-checked={selected}
      onClick={onClick}
      className={`inline-flex min-h-11 items-center gap-2 rounded-full py-1 pl-1 pr-4 text-sm font-semibold ring-1 ${
        selected ? 'bg-tangerine-500 text-white ring-tangerine-500' : 'bg-white text-ink-900 ring-ink-900/10'
      }`}
    >
      <Avatar name={avatarName} id={id} size="sm" />
      {label}
    </button>
  );
}

function StepButton({ children, onClick, label }: { children: React.ReactNode; onClick: () => void; label: string }) {
  return (
    <button type="button" aria-label={label} onClick={onClick} className="grid size-10 place-items-center rounded-full bg-ink-900/5 text-lg font-bold active:bg-ink-900/10">
      {children}
    </button>
  );
}
