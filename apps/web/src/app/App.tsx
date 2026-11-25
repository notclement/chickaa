import { BrowserRouter, Route, Routes } from 'react-router';
import { AppShell } from '../components/AppShell.tsx';
import { HomeScreen } from '../screens/HomeScreen.tsx';
import { NotFoundScreen } from '../screens/NotFoundScreen.tsx';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<HomeScreen />} />
          <Route path="*" element={<NotFoundScreen />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
