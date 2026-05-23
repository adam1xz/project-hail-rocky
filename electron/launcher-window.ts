import { BrowserWindow, screen } from 'electron';
import path from 'path';

let win: BrowserWindow | null = null;

export function createLauncherWindow(preloadPath: string): BrowserWindow {
  const { bounds } = screen.getPrimaryDisplay();

  win = new BrowserWindow({
    width: 356,
    height: 288,
    x: Math.round(bounds.x + (bounds.width - 356) / 2),
    y: Math.round(bounds.y + (bounds.height - 288) / 2),
    transparent: false,
    frame: false,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    show: false,
    backgroundColor: '#111113',
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.once('ready-to-show', () => win?.show());

  if (process.env.DEV === 'true') {
    win.loadURL('http://localhost:3000/launcher.html');
  } else {
    win.loadFile(path.join(__dirname, '../dist/launcher.html'));
  }

  win.on('closed', () => { win = null; });
  return win;
}

export function getLauncherWindow(): BrowserWindow | null {
  return win;
}

export function closeLauncher(): void {
  win?.destroy();
  win = null;
}
