import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import SettingsApp from './SettingsApp';
import '../index.css';
import './settings.css';

createRoot(document.getElementById('settings-root')!).render(
  <StrictMode>
    <SettingsApp />
  </StrictMode>,
);
