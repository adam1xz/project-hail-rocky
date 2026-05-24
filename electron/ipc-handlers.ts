import { ipcMain, app, shell, screen, dialog } from 'electron';
import path from 'path';
import fs from 'fs';
import { store } from './store';
import { getCharacterWindow, repositionWindow } from './character-window';
import { openSettings, getSettingsWindow } from './settings-window';
import { rebuildMenu } from './tray';
import { getCurrentQrData } from './qr-window';

let pythonProcess: import('child_process').ChildProcess | null = null;
let backendPort: number | null = null;

export function registerIpcHandlers(spawnBackend: () => Promise<void>): void {

  ipcMain.on('close-app', () => app.quit());

  ipcMain.handle('get-qr-data', () => getCurrentQrData());

  ipcMain.on('set-interactive', (_e, interactive: boolean) => {
    const win = getCharacterWindow();
    if (!win) return;
    win.setIgnoreMouseEvents(!interactive, { forward: !interactive });
    if (interactive) win.focus();
  });

  ipcMain.on('save-rocky-position', (_e, { x, y }: { x: number; y: number }) => {
    store.set('rockyOffsetX' as any, x);
    store.set('rockyOffsetY' as any, y);
  });

  ipcMain.handle('get-settings', () => store.store);

  ipcMain.handle('save-settings', (_e, settings: Partial<typeof store.store>) => {
    const prev = store.store;
    Object.entries(settings).forEach(([k, v]) => store.set(k as any, v));

    const win = getCharacterWindow();
    if (!win) return { ok: true };

    if (settings.pinToTop !== undefined && settings.pinToTop !== prev.pinToTop) {
      win.setAlwaysOnTop(settings.pinToTop);
    }
    if (settings.skin !== undefined && settings.skin !== prev.skin) {
      win.webContents.send('set-skin', settings.skin);
    }
    if ((settings.scale !== undefined && settings.scale !== prev.scale) ||
        (settings.corner !== undefined && settings.corner !== prev.corner) ||
        (settings.displayIndex !== undefined && settings.displayIndex !== prev.displayIndex) ||
        (settings.windowWidth !== undefined) || (settings.windowHeight !== undefined) ||
        (settings.floorOffset !== undefined && settings.floorOffset !== prev.floorOffset)) {
      repositionWindow(settings.corner, settings.scale, settings.displayIndex);
    }
    if (settings.animationSpeed !== undefined) {
      win.webContents.send('set-anim-speed', settings.animationSpeed);
    }
    if (settings.idleEnabled !== undefined) {
      win.webContents.send('set-idle-enabled', settings.idleEnabled);
    }
    if (settings.disabledAnimations !== undefined) {
      win.webContents.send('set-disabled-anims', settings.disabledAnimations);
    }
    if (settings.autoStart !== undefined) {
      app.setLoginItemSettings({ openAtLogin: settings.autoStart });
    }
    if (settings.debug?.showBorder !== undefined) {
      win?.webContents.send('set-debug-border', settings.debug.showBorder);
    }
    if (settings.skinOpacity !== undefined) {
      win?.webContents.send('set-skin-opacity', settings.skinOpacity);
    }
    if (settings.gravityScale !== undefined) {
      win?.webContents.send('set-gravity-scale', settings.gravityScale);
    }
    if (settings.speechBubbles !== undefined) {
      win?.webContents.send('set-speech-bubbles', settings.speechBubbles);
    }

    if (backendPort) {
      const backendPatch: Record<string, any> = {};
      if (settings.debug?.logConversation !== undefined)
        backendPatch.debug_log = settings.debug.logConversation;
      if (settings.ollama?.model !== undefined)
        backendPatch.ollama_model = settings.ollama.model;
      if (settings.ollama?.endpoint !== undefined)
        backendPatch.ollama_endpoint = settings.ollama.endpoint;
      if (settings.stt?.device !== undefined)
        backendPatch.stt_device = settings.stt.device;
      if (settings.stt?.language !== undefined)
        backendPatch.stt_language = settings.stt.language;
      if (settings.tts?.device !== undefined)
        backendPatch.tts_device = settings.tts.device;
      if (settings.stt?.model !== undefined)
        backendPatch.stt_model = settings.stt.model;
      if (settings.contextSize !== undefined)
        backendPatch.context_size = settings.contextSize;
      if (settings.systemPromptSuffix !== undefined)
        backendPatch.system_prompt_suffix = settings.systemPromptSuffix;
      if (settings.tts?.volume !== undefined)
        backendPatch.tts_volume = settings.tts.volume;
      if (settings.stt?.mode !== undefined)
        backendPatch.stt_mode = settings.stt.mode;
      if (Object.keys(backendPatch).length > 0) {
        fetch(`http://localhost:${backendPort}/settings`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(backendPatch),
        }).catch(() => {});
      }
      if (settings.activityMode !== undefined) {
        fetch(`http://localhost:${backendPort}/activity`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode: settings.activityMode }),
        }).catch(() => {});
      }
    }

    getSettingsWindow()?.webContents.send('settings-loaded', store.store);
    win?.webContents.send('settings-loaded', store.store);
    rebuildMenu();
    return { ok: true };
  });

  ipcMain.handle('get-skins', () => {
    try {
      const p = path.join(process.env.DEV === 'true'
        ? path.join(__dirname, '../public/skins/skins.json')
        : path.join(__dirname, '../dist/skins/skins.json'));
      return JSON.parse(fs.readFileSync(p, 'utf-8'));
    } catch { return []; }
  });

  ipcMain.handle('import-skin', async (_e, { name, pngBase64 }: { name: string; pngBase64: string }) => {
    try {
      const skinsDir = path.join(process.env.DEV === 'true'
        ? path.join(__dirname, '../public/skins')
        : path.join(__dirname, '../dist/skins'));
      const skinId = name.toLowerCase().replace(/\s+/g, '_');
      const skinDir = path.join(skinsDir, skinId);
      fs.mkdirSync(skinDir, { recursive: true });

      const sourceImagePath = path.join(skinDir, 'source.png');
      fs.writeFileSync(sourceImagePath, Buffer.from(pngBase64, 'base64'));

      const splitterPath = path.join(__dirname, '../SKIN/skin_splitter.py');
      const { execFile } = require('child_process');
      await new Promise<void>((resolve, reject) => {
        execFile('python', [
          splitterPath,
          sourceImagePath,
          '--output', skinDir,
          '--name', skinId,
        ], { timeout: 60000 }, (err: Error | null, _stdout: string, stderr: string) => {
          if (err) reject(new Error(stderr || err.message)); else resolve();
        });
      });

      const skinsJsonPath = path.join(skinsDir, 'skins.json');
      const skins: any[] = JSON.parse(fs.readFileSync(skinsJsonPath, 'utf-8'));
      if (!skins.find((s: any) => s.id === skinId)) {
        skins.push({ id: skinId, name });
        fs.writeFileSync(skinsJsonPath, JSON.stringify(skins, null, 2));
      }

      getSettingsWindow()?.webContents.send('skin-imported', { success: true, name });
      return { ok: true, skinId };
    } catch (err: any) {
      const errMsg = String(err?.message || err);
      getSettingsWindow()?.webContents.send('skin-imported', { success: false, name, error: errMsg });
      return { ok: false, error: errMsg };
    }
  });

  ipcMain.handle('diagnose-ai', async () => {
    if (!backendPort) return { error: 'Backend not running', ollama_running: false, model_found: false, stt_loaded: false, tts_loaded: false, stt_active: false };
    try {
      const res = await fetch(`http://localhost:${backendPort}/diagnose`);
      return await res.json();
    } catch (e: any) {
      return { error: String(e), ollama_running: false, model_found: false, stt_loaded: false, tts_loaded: false, stt_active: false };
    }
  });

  ipcMain.handle('clear-history', async () => {
    if (!backendPort) return { ok: false, error: 'Backend not running' };
    try {
      const res = await fetch(`http://localhost:${backendPort}/clear-history`, { method: 'POST' });
      return await res.json();
    } catch (e: any) {
      return { ok: false, error: String(e) };
    }
  });

  ipcMain.handle('download-skin-template', async () => {
    const templatePath = process.env.DEV === 'true'
      ? path.join(__dirname, '../public/skins/basic/source.png')
      : path.join(process.resourcesPath, 'skins/basic/source.png');
    const result = await dialog.showSaveDialog({
      title: 'Save skin template',
      defaultPath: 'skin_template.png',
      filters: [{ name: 'PNG Image', extensions: ['png'] }],
    });
    if (!result.canceled && result.filePath) {
      fs.copyFileSync(templatePath, result.filePath);
      return { ok: true };
    }
    return { ok: false };
  });

  const BUILTIN_ANIMS = [
    'freeze', 'sleep', 'dance', 'crouch', 'sad', 'default',
    'jump', 'nod', 'shake', 'stomp', 'point', 'stretch',
    'wave', 'wave_left', 'wave_right', 'celebrate', 'bounce',
    'panic', 'clap', 'confused', 'chirp', 'harmonic',
  ];

  ipcMain.handle('get-animations', () => {
    const custom = store.get('customAnimations' as any, {}) as Record<string, string>;
    return [...BUILTIN_ANIMS, ...Object.keys(custom)];
  });

  ipcMain.handle('add-custom-animation', (_e, { name, script }: { name: string; script: string }) => {
    const custom = { ...(store.get('customAnimations' as any, {}) as Record<string, string>), [name]: script };
    store.set('customAnimations' as any, custom);
    getCharacterWindow()?.webContents.send('custom-anim-added', { name, script });
    return [...BUILTIN_ANIMS, ...Object.keys(custom)];
  });

  ipcMain.handle('delete-custom-animation', (_e, name: string) => {
    const custom = { ...(store.get('customAnimations' as any, {}) as Record<string, string>) };
    delete custom[name];
    store.set('customAnimations' as any, custom);
    getCharacterWindow()?.webContents.send('custom-anim-removed', name);
    return [...BUILTIN_ANIMS, ...Object.keys(custom)];
  });

  ipcMain.handle('set-activity-mode', (_e, mode: 'active' | 'quiet' | 'sleep') => {
    if (backendPort) {
      fetch(`http://localhost:${backendPort}/activity`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      }).catch(() => {});
    }
    return { ok: true };
  });

  ipcMain.handle('get-ollama-models', async () => {
    try {
      const endpoint = store.get('ollama.endpoint' as any, 'http://localhost:11434');
      const res = await fetch(`${endpoint}/api/tags`);
      if (!res.ok) return [];
      const data: any = await res.json();
      return (data.models || []).map((m: any) => m.name);
    } catch { return []; }
  });

  ipcMain.handle('get-audio-devices', async () => {
    try {
      const { execFileSync } = require('child_process');
      const script = [
        'import json,sounddevice as sd;',
        'd=sd.query_devices();',
        'print(json.dumps([{"name":x["name"],"i":int(x["max_input_channels"]),"o":int(x["max_output_channels"])} for x in d]))',
      ].join('');
      const raw = execFileSync('python', ['-c', script], {
        timeout: 8000, encoding: 'utf-8',
      }).trim();
      const devs: { name: string; i: number; o: number }[] = JSON.parse(raw);
      return {
        inputs:  devs.filter(d => d.i > 0).map(d => d.name),
        outputs: devs.filter(d => d.o > 0).map(d => d.name),
      };
    } catch {
      if (backendPort) {
        try {
          const res = await fetch(`http://localhost:${backendPort}/devices`);
          return await res.json();
        } catch {}
      }
      return { inputs: [], outputs: [] };
    }
  });

  ipcMain.handle('get-displays', () => {
    const primary = screen.getPrimaryDisplay();
    return screen.getAllDisplays().map((d, i) => ({
      index: i,
      label: `Display ${i + 1}${d.id === primary.id ? ' (Primary)' : ''} · ${d.bounds.width}×${d.bounds.height}`,
      width: d.bounds.width,
      height: d.bounds.height,
      primary: d.id === primary.id,
    }));
  });

  ipcMain.on('trigger-emote-from-settings', (_e, name: string) => {
    getCharacterWindow()?.webContents.send('trigger-emote', name);
  });

  ipcMain.on('open-settings', (_e, tab?: string) => openSettings(tab));

  ipcMain.on('restart-backend', () => spawnBackend());

  ipcMain.on('ping-activity', () => {
    if (backendPort) {
      fetch(`http://localhost:${backendPort}/activity/ping`, { method: 'POST' }).catch(() => {});
    }
  });

  ipcMain.on('open-external', (_e, url: string) => shell.openExternal(url));
}

export function setPythonProcess(proc: import('child_process').ChildProcess | null): void {
  pythonProcess = proc;
}

export function setBackendPort(port: number): void {
  backendPort = port;
}

export function getPythonProcess(): import('child_process').ChildProcess | null {
  return pythonProcess;
}

export function getBackendPort(): number | null {
  return backendPort;
}
