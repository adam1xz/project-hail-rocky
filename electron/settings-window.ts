import { BrowserWindow } from 'electron';
import path from 'path';

let win: BrowserWindow | null = null;

export function createSettingsWindow(preloadPath: string): BrowserWindow {
  win = new BrowserWindow({
    width: 560,
    height: 760,
    resizable: false,
    frame: true,
    show: false,
    title: 'Rocky Settings',
    autoHideMenuBar: true,
    backgroundColor: '#0f0f12',
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.setMenuBarVisibility(false);

  if (process.env.DEV === 'true') {
    win.loadURL('http://localhost:3000/settings.html');
  } else {
    win.loadFile(path.join(__dirname, '../dist/settings.html'));
  }

  win.on('close', (e) => {
    e.preventDefault();
    win?.hide();
  });

  win.on('closed', () => { win = null; });

  return win;
}

export function getSettingsWindow(): BrowserWindow | null {
  return win;
}

export function openSettings(tab?: string): void {
  if (!win) return;
  win.show();
  win.focus();
  if (tab) {
    win.webContents.send('navigate-tab', tab);
  }
}
