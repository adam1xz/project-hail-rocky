import React from 'react';
import { createRoot } from 'react-dom/client';
import { Launcher } from './Launcher';
import '../settings/settings.css';

createRoot(document.getElementById('launcher-root')!).render(<Launcher />);
