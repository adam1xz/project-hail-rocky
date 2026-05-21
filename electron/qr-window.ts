import { BrowserWindow } from 'electron';
import path from 'path';

let win: BrowserWindow | null = null;

export interface QrData {
  url: string;
  webUrl: string;
  host: string;
  port: number;
}

let _currentData: QrData | null = null;

export function createQrWindow(preloadPath: string): BrowserWindow {
  win = new BrowserWindow({
    width: 300,
    height: 500,
    resizable: false,
    frame: true,
    title: 'Rocky — Mobile',
    autoHideMenuBar: true,
    backgroundColor: '#111113',
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.setMenuBarVisibility(false);

  if (process.env.DEV === 'true') {
    win.loadURL('http://localhost:3000/qr.html');
  } else {
    win.loadFile(path.join(__dirname, '../dist/qr.html'));
  }

  // Hide instead of close so tray can reopen it
  win.on('close', (e) => {
    e.preventDefault();
    win?.hide();
  });

  win.on('closed', () => { win = null; });
  return win;
}

export function getQrWindow(): BrowserWindow | null {
  return win;
}

export function showQrWindow(): void {
  if (!win) return;
  win.show();
  win.focus();
}

export function setQrData(data: QrData): void {
  _currentData = data;
  win?.webContents.send('qr-data', data);
}

export function getCurrentQrData(): QrData | null {
  return _currentData;
}
