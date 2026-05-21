import React from 'react';
import { createRoot } from 'react-dom/client';
import { QrPage } from './QrPage';
import '../settings/settings.css';

createRoot(document.getElementById('qr-root')!).render(<QrPage />);
