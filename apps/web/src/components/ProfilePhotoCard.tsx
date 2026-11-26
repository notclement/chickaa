import type { MeResponse } from '@chickaa/contracts';
import { useRef, useState } from 'react';
import { api, errorMessage } from '../api/client.ts';
import { useAuth, useMe } from '../auth/AuthContext.tsx';
import { compressAvatar } from '../lib/compressImage.ts';
import { Avatar, Button, Card, FormError } from '../ui/index.tsx';

export function ProfilePhotoCard() {
  const me = useMe();
  const { setUser } = useAuth();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [info, setInfo] = useState<string>();

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError(undefined);
    setInfo(undefined);
    try {
      const small = await compressAvatar(file);
      const res = await api<MeResponse>('/auth/me/avatar', { method: 'PUT', body: small, headers: { 'Content-Type': small.type } });
      setUser(res.user);
      setInfo(`Saved · ${(small.size / 1024).toFixed(1)} KB`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };

  const remove = async () => {
    setBusy(true);
    setError(undefined);
    try {
      const res = await api<MeResponse>('/auth/me/avatar', { method: 'DELETE' });
      setUser(res.user);
      setInfo(undefined);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <div className="flex items-center gap-4">
        <Avatar name={me.displayName} id={me.id} size="lg" />
        <div className="flex-1 space-y-2">
          <h2 className="font-bold">Profile photo</h2>
          <input ref={input} type="file" accept="image/*" className="sr-only" aria-label="Choose a profile photo" onChange={(e) => void pick(e.target.files?.[0])} />
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" className="!min-h-10 text-sm" loading={busy} onClick={() => input.current?.click()}>
              {me.avatarVersion ? 'Change photo' : 'Add photo'}
            </Button>
            {me.avatarVersion && (
              <Button variant="ghost" className="!min-h-10 text-sm" disabled={busy} onClick={remove}>
                Remove
              </Button>
            )}
          </div>
          {info && <p className="text-xs text-owed" data-testid="avatar-info">{info}</p>}
        </div>
      </div>
      <FormError message={error} />
    </Card>
  );
}
