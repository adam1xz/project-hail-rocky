import { app, BrowserWindow, ipcMain } from 'electron';
import os from 'os';
import path from 'path';
import { spawn, ChildProcess } from 'child_process';
import { createCharacterWindow, getCharacterWindow } from './character-window';
import { createSettingsWindow } from './settings-window';
import { createTray, setMobileMode } from './tray';
import { registerIpcHandlers, setPythonProcess, setBackendPort, getBackendPort } from './ipc-handlers';
import { createLauncherWindow, closeLauncher } from './launcher-window';
import { createQrWindow, setQrData } from './qr-window';
import { store } from './store';

const isDev = process.env.DEV === 'true';
const preloadPath = path.join(__dirname, 'preload.js');

let pythonProc: ChildProcess | null = null;
let isQuitting = false;
let currentMode: 'desktop' | 'mobile' | null = null;

function getLanIp(): string {
  const ifaces = os.networkInterfaces();
  for (const iface of Object.values(ifaces)) {
    for (const cfg of iface ?? []) {
      if (cfg.family === 'IPv4' && !cfg.internal) return cfg.address;
    }
  }
  return '127.0.0.1';
}

async function spawnBackend(): Promise<void> {
  if (pythonProc) {
    pythonProc.kill();
    pythonProc = null;
  }

  const backendPath = isDev
    ? path.join(__dirname, '../AI/backend.py')
    : path.join(process.resourcesPath, 'AI/backend.py');

  const voiceRef = isDev
    ? path.join(__dirname, '../update/tts/_rocky_mono.wav')
    : path.join(process.resourcesPath, 'update/tts/_rocky_mono.wav');

  const s = store.store;
  const args = [
    backendPath,
    '--voice-ref', voiceRef,
    '--ollama-endpoint', s.ollama.endpoint,
    '--ollama-model', s.ollama.model,
    '--stt-model', s.stt.model,
    '--stt-device', s.stt.device,
    '--stt-language', s.stt.language ?? 'auto',
    '--tts-device', s.tts.device,
    '--lan',  // always bind to 0.0.0.0 for mobile mode readiness
  ];

  try {
    pythonProc = spawn('python', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    setPythonProcess(pythonProc);

    pythonProc.stdout?.on('data', (chunk: Buffer) => {
      const lines = chunk.toString().split('\n');
      for (const line of lines) {
        if (line.startsWith('PORT:')) {
          const port = parseInt(line.split(':')[1].trim(), 10);
          setBackendPort(port);
          startEventStream(port);

          // If we're already in mobile mode, send QR data now that port is known
          if (currentMode === 'mobile') {
            const host = getLanIp();
            setQrData({
              url: `rocky://connect?host=${host}&port=${port}`,
              webUrl: `http://${host}:${port}/app`,
              host,
              port,
            });
          }
        }
        if (line.startsWith('EMOTE:')) {
          const emote = line.split(':')[1].trim();
          getCharacterWindow()?.webContents.send('trigger-emote', emote);
        }
      }
    });

    pythonProc.stderr?.on('data', (chunk: Buffer) => {
      console.error('[backend]', chunk.toString().trim());
    });

    pythonProc.on('exit', (code) => {
      console.log('[backend] exited with code', code);
      pythonProc = null;
      setPythonProcess(null);
      if (!isQuitting && code !== 0) {
        console.log('[backend] crashed — restarting in 3s...');
        setTimeout(() => spawnBackend().catch(console.error), 3000);
      }
    });
  } catch (err) {
    console.error('Failed to spawn Python backend:', err);
  }
}

function startEventStream(port: number): void {
  const url = `http://localhost:${port}/events`;

  async function connect(): Promise<void> {
    while (true) {
      try {
        const res = await fetch(url);
        if (!res.ok || !res.body) {
          await new Promise(r => setTimeout(r, 2000));
          continue;
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const text = decoder.decode(value);
          for (const line of text.split('\n')) {
            if (!line.startsWith('data:')) continue;
            try {
              const evt = JSON.parse(line.slice(5).trim());
              handleBackendEvent(evt);
            } catch {}
          }
        }
      } catch {}
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  connect().catch(() => {});
}

function handleBackendEvent(evt: { type: string; [k: string]: any }): void {
  const win = getCharacterWindow();
  if (!win) return;
  switch (evt.type) {
    case 'emote':        win.webContents.send('trigger-emote', evt.name); break;
    case 'response':     win.webContents.send('ai-response', evt.text);   break;
    case 'transcription':win.webContents.send('ai-transcription', evt.text); break;
    case 'ai_state':     win.webContents.send('ai-state', evt.state);     break;
    case 'wakeup':       win.webContents.send('ai-wakeup');                break;
  }
}

function switchToDesktop(): void {
  currentMode = 'desktop';
  closeLauncher();
  setMobileMode(false);
  createCharacterWindow(preloadPath);
  createSettingsWindow(preloadPath);
  createTray();

  const charWin = getCharacterWindow();
  charWin?.webContents.once('did-finish-load', () => {
    charWin.webContents.send('set-debug-border', store.store.debug?.showBorder ?? false);
  });

  app.setLoginItemSettings({ openAtLogin: store.store.autoStart });
}

function switchToMobile(): void {
  currentMode = 'mobile';
  closeLauncher();
  setMobileMode(true);
  createQrWindow(preloadPath);
  createSettingsWindow(preloadPath);
  createTray();

  // Backend may have already emitted PORT before the user picked mobile — seed QR data now
  const port = getBackendPort();
  if (port !== null) {
    const host = getLanIp();
    setQrData({
      url: `rocky://connect?host=${host}&port=${port}`,
      webUrl: `http://${host}:${port}/app`,
      host,
      port,
    });
  }
}

app.whenReady().then(async () => {
  registerIpcHandlers(spawnBackend);

  // Register launcher mode selection
  ipcMain.on('launcher-mode', (_e, mode: 'desktop' | 'mobile') => {
    if (mode === 'desktop') switchToDesktop();
    else switchToMobile();
  });

  createLauncherWindow(preloadPath);

  // Backend starts immediately so models load during mode selection
  spawnBackend().catch(console.error);

  app.on('activate', () => {
    if (currentMode === 'desktop' && BrowserWindow.getAllWindows().filter(w => !w.isDestroyed()).length === 0) {
      createCharacterWindow(preloadPath);
    }
  });
});

app.on('window-all-closed', () => {
  // Keep running — tray keeps app alive after mode is selected
  // Before mode selection: all windows closing = user closed launcher = quit
  if (currentMode === null) {
    app.quit();
  }
});

app.on('before-quit', () => {
  isQuitting = true;
  pythonProc?.kill();
});
