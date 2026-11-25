import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { installWakeOnOpen } from './api/serverStatus.ts';
import { App } from './app/App.tsx';
import { requestPersistentStorage } from './pwa/persistentStorage.ts';
import { isStandalone, readPlatform } from './pwa/platform.ts';
import './styles/app.css';

if (isStandalone(readPlatform())) void requestPersistentStorage();
// Free hosting sleeps when idle: start waking it the moment the app opens.
installWakeOnOpen();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
