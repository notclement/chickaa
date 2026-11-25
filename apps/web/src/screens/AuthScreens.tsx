import type { AuthWithRecoveryResponse, MeResponse } from '@ncc/contracts';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { ApiRequestError, errorMessage, post } from '../api/client.ts';
import { useAuth } from '../auth/AuthContext.tsx';
import { RecoveryCodePanel } from '../auth/RecoveryCodePanel.tsx';
import { safeNext } from '../auth/safeNext.ts';
import { BrandLockup } from '../components/BrandLockup.tsx';
import { useUnsavedChanges } from '../pwa/unsavedChanges.ts';
import { Button, Card, FormError, TextField } from '../ui/index.tsx';

function AuthFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-md pt-6">
      <div className="mb-6 flex justify-center">
        <BrandLockup />
      </div>
      {children}
    </div>
  );
}

function useNextParam() {
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const qs = params.get('next') ? `?next=${encodeURIComponent(next)}` : '';
  return { next, qs };
}

function fieldErrors(err: unknown): Record<string, string> {
  return err instanceof ApiRequestError ? err.fields : {};
}

export function LoginScreen() {
  const { setUser } = useAuth();
  const navigate = useNavigate();
  const { next, qs } = useNextParam();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      const res = await post<MeResponse>('/auth/login', { username, password });
      setUser(res.user);
      navigate(next, { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthFrame>
      <Card>
        <h1 className="text-xl font-extrabold">Welcome back</h1>
        <form onSubmit={submit} className="mt-4 space-y-4" noValidate>
          <TextField
            label="Username"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
          <TextField
            label="Password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <FormError message={error} />
          <Button type="submit" block loading={busy} disabled={!username || !password}>
            Log in
          </Button>
        </form>
        <div className="mt-4 flex justify-between text-sm">
          <Link to={`/recover${qs}`} className="font-semibold text-ink-500 underline-offset-2 hover:underline">
            Forgot password?
          </Link>
          <Link to={`/register${qs}`} className="font-bold text-tangerine-600">
            Create account
          </Link>
        </div>
      </Card>
    </AuthFrame>
  );
}

export function RegisterScreen() {
  const { setUser } = useAuth();
  const navigate = useNavigate();
  const { next, qs } = useNextParam();
  const [form, setForm] = useState({ displayName: '', username: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [fields, setFields] = useState<Record<string, string>>({});
  const [created, setCreated] = useState<AuthWithRecoveryResponse | null>(null);
  useUnsavedChanges(!created && Object.values(form).some(Boolean));

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    setFields({});
    try {
      const res = await post<AuthWithRecoveryResponse>('/auth/register', form);
      setCreated(res); // show the recovery code before entering the app
    } catch (err) {
      setFields(fieldErrors(err));
      setError(Object.keys(fieldErrors(err)).length ? undefined : errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (created) {
    return (
      <AuthFrame>
        <RecoveryCodePanel
          code={created.recoveryCode}
          doneLabel="Let’s go"
          onDone={() => {
            setUser(created.user);
            navigate(next, { replace: true });
          }}
        />
      </AuthFrame>
    );
  }

  return (
    <AuthFrame>
      <Card>
        <h1 className="text-xl font-extrabold">Create your account</h1>
        <p className="mt-1 text-sm text-ink-700">No email or phone number needed.</p>
        <form onSubmit={submit} className="mt-4 space-y-4" noValidate>
          <TextField
            label="Your name"
            hint="What friends see on the trip, e.g. “Clem”"
            autoComplete="nickname"
            value={form.displayName}
            onChange={set('displayName')}
            error={fields.displayName}
            maxLength={40}
          />
          <TextField
            label="Username"
            hint="For logging in. Letters, numbers, _ and ."
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={form.username}
            onChange={set('username')}
            error={fields.username}
            maxLength={24}
          />
          <TextField
            label="Password"
            type="password"
            hint="At least 8 characters"
            autoComplete="new-password"
            value={form.password}
            onChange={set('password')}
            error={fields.password}
          />
          <FormError message={error} />
          <Button type="submit" block loading={busy} disabled={!form.displayName || !form.username || !form.password}>
            Create account
          </Button>
        </form>
        <p className="mt-4 text-center text-sm text-ink-700">
          Already have one?{' '}
          <Link to={`/login${qs}`} className="font-bold text-tangerine-600">
            Log in
          </Link>
        </p>
      </Card>
    </AuthFrame>
  );
}

export function RecoverScreen() {
  const { setUser } = useAuth();
  const navigate = useNavigate();
  const { next, qs } = useNextParam();
  const [form, setForm] = useState({ username: '', recoveryCode: '', newPassword: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [fields, setFields] = useState<Record<string, string>>({});
  const [done, setDone] = useState<AuthWithRecoveryResponse | null>(null);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    setFields({});
    try {
      setDone(await post<AuthWithRecoveryResponse>('/auth/recover', form));
    } catch (err) {
      setFields(fieldErrors(err));
      setError(Object.keys(fieldErrors(err)).length ? undefined : errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <AuthFrame>
        <p className="mb-3 rounded-2xl bg-owed/10 px-4 py-3 text-sm font-semibold text-owed">
          ✓ Password changed. Your old recovery code no longer works. Here’s your new one:
        </p>
        <RecoveryCodePanel
          code={done.recoveryCode}
          onDone={() => {
            setUser(done.user);
            navigate(next, { replace: true });
          }}
        />
      </AuthFrame>
    );
  }

  return (
    <AuthFrame>
      <Card>
        <h1 className="text-xl font-extrabold">Reset your password</h1>
        <p className="mt-1 text-sm text-ink-700">Use the recovery code you saved when you signed up.</p>
        <form onSubmit={submit} className="mt-4 space-y-4" noValidate>
          <TextField label="Username" autoComplete="username" autoCapitalize="none" autoCorrect="off" value={form.username} onChange={set('username')} error={fields.username} />
          <TextField
            label="Recovery code"
            placeholder="XXXX-XXXX-XXXX-XXXX"
            autoCapitalize="characters"
            autoCorrect="off"
            autoComplete="one-time-code"
            spellCheck={false}
            value={form.recoveryCode}
            onChange={set('recoveryCode')}
            error={fields.recoveryCode}
            className="[&_input]:font-mono"
          />
          <TextField label="New password" type="password" autoComplete="new-password" hint="At least 8 characters" value={form.newPassword} onChange={set('newPassword')} error={fields.newPassword} />
          <FormError message={error} />
          <Button type="submit" block loading={busy} disabled={!form.username || !form.recoveryCode || !form.newPassword}>
            Reset password
          </Button>
        </form>
        <p className="mt-4 text-center text-sm">
          <Link to={`/login${qs}`} className="font-semibold text-ink-500">
            Back to log in
          </Link>
        </p>
      </Card>
    </AuthFrame>
  );
}
