import { forwardRef, useId, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react';
import { useState as useStateUi } from 'react';
import { Link, useNavigate } from 'react-router';
import { useAvatarUrl } from '../lib/avatars.ts';

// ---------- Button ----------
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-tangerine-500 text-white active:bg-tangerine-600 disabled:bg-tangerine-500/50',
  secondary: 'bg-white text-ink-900 ring-1 ring-ink-900/10 active:bg-ink-900/5 disabled:opacity-50',
  ghost: 'text-ink-700 active:bg-ink-900/5 disabled:opacity-50',
  danger: 'bg-white text-owes ring-1 ring-owes/30 active:bg-owes/5 disabled:opacity-50',
};

export function Button({
  variant = 'primary',
  loading,
  block,
  className = '',
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean; block?: boolean }) {
  return (
    <button
      {...rest}
      disabled={rest.disabled || loading}
      className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl px-5 font-bold transition-colors ${
        block ? 'w-full' : ''
      } ${VARIANTS[variant]} ${className}`}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}

export function ButtonLink({ to, variant = 'primary', block, children }: { to: string; variant?: Variant; block?: boolean; children: ReactNode }) {
  return (
    <Link
      to={to}
      className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl px-5 font-bold ${block ? 'w-full' : ''} ${VARIANTS[variant]}`}
    >
      {children}
    </Link>
  );
}

export function Spinner({ className = 'size-4' }: { className?: string }) {
  return <span aria-hidden className={`${className} inline-block animate-spin rounded-full border-2 border-current border-t-transparent`} />;
}

// ---------- Form fields ----------
interface FieldProps {
  label: string;
  hint?: ReactNode;
  error?: string | undefined;
}

export const TextField = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & FieldProps>(function TextField(
  { label, hint, error, className = '', ...rest },
  ref,
) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-ink-700">
        {label}
      </label>
      <input
        ref={ref}
        id={id}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-err` : hint ? `${id}-hint` : undefined}
        {...rest}
        className={`block min-h-12 w-full rounded-2xl border-0 bg-white px-4 text-ink-900 ring-1 placeholder:text-ink-500/60 focus:ring-2 focus:ring-tangerine-500 focus:outline-none ${
          error ? 'ring-owes' : 'ring-ink-900/10'
        }`}
      />
      {error ? (
        <p id={`${id}-err`} className="mt-1.5 text-sm font-medium text-owes">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1.5 text-sm text-ink-500">
          {hint}
        </p>
      ) : null}
    </div>
  );
});

export function SelectField({ label, hint, error, className = '', children, ...rest }: SelectHTMLAttributes<HTMLSelectElement> & FieldProps) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-ink-700">
        {label}
      </label>
      <select
        id={id}
        {...rest}
        className={`block min-h-12 w-full appearance-none rounded-2xl border-0 bg-white bg-[length:20px] bg-[right_1rem_center] bg-no-repeat px-4 pr-10 text-ink-900 ring-1 focus:ring-2 focus:ring-tangerine-500 focus:outline-none ${
          error ? 'ring-owes' : 'ring-ink-900/10'
        } select-chevron`}
      >
        {children}
      </select>
      {error ? <p className="mt-1.5 text-sm font-medium text-owes">{error}</p> : hint ? <p className="mt-1.5 text-sm text-ink-500">{hint}</p> : null}
    </div>
  );
}

export function FormError({ message }: { message?: string | undefined }) {
  if (!message) return null;
  return (
    <div role="alert" className="rounded-2xl bg-owes/10 px-4 py-3 text-sm font-medium text-owes">
      {message}
    </div>
  );
}

// ---------- Layout ----------
export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-3xl bg-white p-5 shadow-sm ring-1 ring-ink-900/5 ${className}`}>{children}</section>;
}

export function ScreenTitle({ title, subtitle, back }: { title: string; subtitle?: ReactNode; back?: string | true }) {
  const navigate = useNavigate();
  return (
    <div className="mb-4 pt-2">
      {back && (
        <button
          onClick={() => (back === true ? navigate(-1) : navigate(back))}
          className="-ml-2 mb-1 inline-flex min-h-10 items-center gap-1 rounded-xl px-2 text-sm font-semibold text-ink-500 active:bg-ink-900/5"
        >
          <span aria-hidden>←</span> Back
        </button>
      )}
      <h1 className="text-2xl font-extrabold tracking-tight">{title}</h1>
      {subtitle && <p className="mt-1 text-ink-700">{subtitle}</p>}
    </div>
  );
}

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-ink-500" role="status">
      <Spinner className="size-5" /> {label}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="py-12 text-center">
      <div className="text-4xl" aria-hidden>
        😵‍💫
      </div>
      <p className="mt-3 text-ink-700">{message}</p>
      {onRetry && (
        <Button variant="secondary" className="mt-4" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

// ---------- Avatar ----------
const AVATAR_COLORS = ['bg-sun-300', 'bg-tangerine-100', 'bg-[#CDEBDF]', 'bg-[#DDE3FF]', 'bg-[#FFD9E6]', 'bg-[#E8DDFB]'];
export function Avatar({ name, id, size = 'md' }: { name: string; id: string; size?: 'sm' | 'md' | 'lg' }) {
  const url = useAvatarUrl(id);
  const [broken, setBroken] = useStateUi<string | null>(null);
  const dims = size === 'sm' ? 'size-8 text-xs' : size === 'lg' ? 'size-24 text-2xl' : 'size-11 text-sm';
  if (url && broken !== url) {
    return (
      <img
        src={url}
        alt=""
        aria-hidden
        loading="lazy"
        decoding="async"
        onError={() => setBroken(url)}
        className={`shrink-0 rounded-full bg-cream object-cover ${dims}`}
      />
    );
  }
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => [...w][0] ?? '')
    .join('')
    .toUpperCase();
  return (
    <span
      aria-hidden
      className={`grid shrink-0 place-items-center rounded-full font-extrabold text-ink-900 ${AVATAR_COLORS[h % AVATAR_COLORS.length]} ${dims}`}
    >
      {initials || '🐣'}
    </span>
  );
}

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'brand' | 'good' }) {
  const t = { neutral: 'bg-ink-900/5 text-ink-700', brand: 'bg-tangerine-100 text-tangerine-700', good: 'bg-owed/10 text-owed' }[tone];
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${t}`}>{children}</span>;
}
