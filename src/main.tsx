import React from 'react';
import ReactDOM from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import { repo } from './db';
import './index.css';

const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    window.dispatchEvent(new CustomEvent('mamas-update-ready', { detail: () => updateSW(true) }));
  },
});

async function boot() {
  await repo.seedIfEmpty();
  try {
    const persisted = await navigator.storage?.persist?.();
    if (persisted !== undefined) await repo.setSetting('storagePersisted', persisted);
  } catch {
    /* not supported */
  }
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

boot();
