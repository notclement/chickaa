import type { AuthWithRecoveryResponse, MeResponse } from '@ncc/contracts';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { ApiRequestError, errorMessage, patch, post } from '../api/client.ts';
import { useAuth, useMe } from '../auth/AuthContext.tsx';
import { RecoveryCodePanel } from '../auth/RecoveryCodePanel.tsx';
import { AppStatusCard } from '../components/AppStatusCard.tsx';
import { MadeBy } from '../components/MadeBy.tsx';
import { SupporterBadge } from '../components/SupporterBadge.tsx';
import { InstallCard } from '../components/InstallCard.tsx';
import { ProfilePhotoCard } from '../components/ProfilePhotoCard.tsx';
import { Avatar, Button, ButtonLink, Card, FormError, ScreenTitle, TextField } from '../ui/index.tsx';

export function AccountScreen() {
  const me = useMe();
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  return (
    <div className="space-y-4">
      <ScreenTitle title="Account" back="/" />
      <Card className="flex items-center gap-3 !p-4">
        <Avatar name={me.displayName} id={me.id} />
        <div>
          <div className="flex flex-wrap items-center gap-2 font-bold">
            {me.displayName} <SupporterBadge supporter={me.supporter} />
          </div>
          <div className="text-sm text-ink-500">
            User ID <b>@{me.username}</b> · can’t be changed
          </div>
          <div className="text-xs text-ink-500">Your display name (below) is what friends see; change it any time.</div>
        </div>
      </Card>
      <div className="grid grid-cols-2 gap-2">
        <ButtonLink to="/supporter" variant="secondary" block>
          {me.supporter?.lifetime ? '💛 Supporter' : '💛 Support'}
        </ButtonLink>
        <ButtonLink to="/invite-friend" variant="secondary" block>
          🎁 Invite a friend
        </ButtonLink>
      </div>
      {me.isAdmin && (
        <ButtonLink to="/admin" variant="secondary" block>
          🛡️ Admin: trips &amp; users
        </ButtonLink>
      )}
      <ProfilePhotoCard />
      <DisplayNameCard />
      <PasswordCard />
      <RecoveryCard />
      <InstallCard force />
      <AppStatusCard />
      <Button
        variant="danger"
        block
        loading={busy}
        onClick={async () => {
          setBusy(true);
          navigate('/', { replace: true });
          await logout();
        }}
      >
        Log out
      </Button>
      <MadeBy className="pt-2" />
    </div>
  );
}

function DisplayNameCard() {
  const me = useMe();
  const { setUser } = useAuth();
  const [name, setName] = useState(me.displayName);
  const [msg, setMsg] = useState<string>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      const res = await patch<MeResponse>('/auth/me', { displayName: name });
      setUser(res.user);
      setMsg('Saved');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <form onSubmit={submit} className="space-y-3">
        <TextField label="Display name" hint="What friends see on trips. Your user ID stays the same." value={name} onChange={(e) => (setName(e.target.value), setMsg(undefined))} maxLength={40} />
        <FormError message={error} />
        <Button type="submit" variant="secondary" loading={busy} disabled={!name.trim() || name === me.displayName}>
          {msg ?? 'Save name'}
        </Button>
      </form>
    </Card>
  );
}

function PasswordCard() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ currentPassword: '', newPassword: '' });
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string>();
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!open) {
    return (
      <Button variant="secondary" block onClick={() => setOpen(true)}>
        {done ? '✓ Password changed' : 'Change password'}
      </Button>
    );
  }
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    setFields({});
    try {
      await post('/auth/password', form);
      setDone(true);
      setOpen(false);
      setForm({ currentPassword: '', newPassword: '' });
    } catch (err) {
      const f = err instanceof ApiRequestError ? err.fields : {};
      setFields(f);
      setError(Object.keys(f).length ? undefined : errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card>
      <form onSubmit={submit} className="space-y-3">
        <h2 className="font-bold">Change password</h2>
        <TextField label="Current password" type="password" autoComplete="current-password" value={form.currentPassword} onChange={(e) => setForm({ ...form, currentPassword: e.target.value })} error={fields.currentPassword} />
        <TextField label="New password" type="password" autoComplete="new-password" hint="At least 8 characters. Other devices will be signed out." value={form.newPassword} onChange={(e) => setForm({ ...form, newPassword: e.target.value })} error={fields.newPassword} />
        <FormError message={error} />
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="submit" loading={busy} disabled={!form.currentPassword || !form.newPassword}>
            Change
          </Button>
        </div>
      </form>
    </Card>
  );
}

function RecoveryCard() {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  if (code) return <RecoveryCodePanel code={code} doneLabel="Done" onDone={() => (setCode(null), setOpen(false))} />;
  if (!open) {
    return (
      <Button variant="secondary" block onClick={() => setOpen(true)}>
        Get a new recovery code
      </Button>
    );
  }
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      const res = await post<AuthWithRecoveryResponse>('/auth/recovery-code', { password });
      setCode(res.recoveryCode);
      setPassword('');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card>
      <form onSubmit={submit} className="space-y-3">
        <h2 className="font-bold">New recovery code</h2>
        <p className="text-sm text-ink-700">Lost your recovery code? Make a new one. The old one stops working.</p>
        <TextField label="Password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        <FormError message={error} />
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="submit" loading={busy} disabled={!password}>
            Create
          </Button>
        </div>
      </form>
    </Card>
  );
}
