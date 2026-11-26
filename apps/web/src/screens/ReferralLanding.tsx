import { useEffect } from 'react';
import { Navigate, useParams } from 'react-router';
import { useAuth } from '../auth/AuthContext.tsx';
import { saveReferral } from '../lib/referral.ts';
import { Loading } from '../ui/index.tsx';

/** /r/:code: remember the friend's code, then go to sign-up (or home if already signed in). */
export function ReferralLanding() {
  const { code = '' } = useParams();
  const { status } = useAuth();
  useEffect(() => saveReferral(code), [code]);
  if (status === 'loading') return <Loading />;
  return <Navigate to={status === 'authed' || status === 'offline' ? '/' : '/register'} replace />;
}
