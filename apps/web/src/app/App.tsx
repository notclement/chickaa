import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router';
import { AuthProvider, useAuth } from '../auth/AuthContext.tsx';
import { AppShell } from '../components/AppShell.tsx';
import { AccountScreen } from '../screens/AccountScreen.tsx';
import { AdminScreen } from '../screens/AdminScreen.tsx';
import { BalancesScreen } from '../screens/BalancesScreen.tsx';
import { ExpenseDetailScreen } from '../screens/ExpenseDetailScreen.tsx';
import { EditExpenseScreen, NewExpenseScreen } from '../screens/ExpenseFormScreen.tsx';
import { ExpenseListScreen } from '../screens/ExpenseListScreen.tsx';
import { SettleUpScreen } from '../screens/SettleUpScreen.tsx';
import { LoginScreen, RecoverScreen, RegisterScreen } from '../screens/AuthScreens.tsx';
import { InviteScreen } from '../screens/InviteScreen.tsx';
import { JoinScreen } from '../screens/JoinScreen.tsx';
import { MyTripsScreen } from '../screens/MyTripsScreen.tsx';
import { NotFoundScreen } from '../screens/NotFoundScreen.tsx';
import { CreateTripScreen, EditTripScreen } from '../screens/TripFormScreen.tsx';
import { TripScreen } from '../screens/TripScreen.tsx';
import { WelcomeScreen } from '../screens/WelcomeScreen.tsx';
import { Button, Loading } from '../ui/index.tsx';

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<Home />} />
            <Route element={<SignedOutOnly />}>
              <Route path="login" element={<LoginScreen />} />
              <Route path="register" element={<RegisterScreen />} />
              <Route path="recover" element={<RecoverScreen />} />
            </Route>
            <Route path="join/:token" element={<JoinScreen />} />
            <Route element={<SignedInOnly />}>
              <Route path="trips/new" element={<CreateTripScreen />} />
              <Route path="trips/:id" element={<TripScreen />} />
              <Route path="trips/:id/edit" element={<EditTripScreen />} />
              <Route path="trips/:id/invite" element={<InviteScreen />} />
              <Route path="trips/:id/expenses" element={<ExpenseListScreen />} />
              <Route path="trips/:id/expenses/new" element={<NewExpenseScreen />} />
              <Route path="trips/:id/balances" element={<BalancesScreen />} />
              <Route path="trips/:id/settle" element={<SettleUpScreen />} />
              <Route path="expenses/:eid" element={<ExpenseDetailScreen />} />
              <Route path="expenses/:eid/edit" element={<EditExpenseScreen />} />
              <Route path="account" element={<AccountScreen />} />
              <Route path="admin" element={<AdminScreen />} />
            </Route>
            <Route path="*" element={<NotFoundScreen />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

function Home() {
  const { status } = useAuth();
  if (status === 'loading') return <Loading />;
  if (status === 'unreachable') return <Unreachable />;
  return status === 'authed' || status === 'offline' ? <MyTripsScreen /> : <WelcomeScreen />;
}

function SignedInOnly() {
  const { status } = useAuth();
  const loc = useLocation();
  if (status === 'loading') return <Loading />;
  if (status === 'unreachable') return <Unreachable />;
  // 'offline' = signed in on this device but no connection: screens show the saved copy, read-only.
  if (status === 'anon') return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
  return <Outlet />;
}

function SignedOutOnly() {
  const { status } = useAuth();
  const loc = useLocation();
  if (status === 'authed' || status === 'offline') {
    const next = new URLSearchParams(loc.search).get('next');
    return <Navigate to={next?.startsWith('/') && !next.startsWith('//') ? next : '/'} replace />;
  }
  return <Outlet />;
}

function Unreachable() {
  const { refresh } = useAuth();
  return (
    <div className="py-16 text-center">
      <div className="text-5xl" aria-hidden>
        📡
      </div>
      <h1 className="mt-3 text-xl font-extrabold">Can’t reach NoChickenCall</h1>
      <p className="mt-1 text-ink-700">
        {navigator.onLine ? 'The server didn’t answer. It may be waking up; give it a moment.' : 'You’re offline. Connect to the internet and try again.'}
      </p>
      <Button variant="secondary" className="mt-5" onClick={() => void refresh()}>
        Try again
      </Button>
    </div>
  );
}
