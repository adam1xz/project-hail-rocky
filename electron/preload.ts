import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  setInteractive: (interactive: boolean) =>
    ipcRenderer.send('set-interactive', interactive),

  saveRockyPosition: (x: number, y: number) =>
    ipcRenderer.send('save-rocky-position', { x, y }),

  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings: any) => ipcRenderer.invoke('save-settings', settings),
  getSkins: () => ipcRenderer.invoke('get-skins'),
  getAnimations: () => ipcRenderer.invoke('get-animations'),
  importSkin: (data: { name: string; pngBase64: string }) =>
    ipcRenderer.invoke('import-skin', data),
  getOllamaModels: () => ipcRenderer.invoke('get-ollama-models'),
  getAudioDevices: () => ipcRenderer.invoke('get-audio-devices'),
  restartBackend: () => ipcRenderer.send('restart-backend'),
  openSettings: (tab?: string) => ipcRenderer.send('open-settings', tab),

  onEmote: (cb: (name: string) => void) => {
    ipcRenderer.on('trigger-emote', (_e, name) => cb(name));
  },
  onSkinChange: (cb: (id: string) => void) => {
    ipcRenderer.on('set-skin', (_e, id) => cb(id));
  },
  onScaleChange: (cb: (scale: number) => void) => {
    ipcRenderer.on('set-scale', (_e, scale) => cb(scale));
  },
  onCornerChange: (cb: (corner: string) => void) => {
    ipcRenderer.on('set-corner', (_e, corner) => cb(corner));
  },
  onSettingsLoaded: (cb: (settings: any) => void) => {
    ipcRenderer.on('settings-loaded', (_e, s) => cb(s));
  },
  onSkinImported: (cb: (result: { success: boolean; name: string }) => void) => {
    ipcRenderer.on('skin-imported', (_e, r) => cb(r));
  },
  navigateTab: (cb: (tab: string) => void) => {
    ipcRenderer.on('navigate-tab', (_e, tab) => cb(tab));
  },
  onAiResponse: (cb: (text: string) => void) => {
    ipcRenderer.on('ai-response', (_e, text) => cb(text));
  },
  onAiState: (cb: (state: string) => void) => {
    ipcRenderer.on('ai-state', (_e, state) => cb(state));
  },
  onWakeup: (cb: () => void) => {
    ipcRenderer.on('ai-wakeup', () => cb());
  },
  onDebugBorder: (cb: (enabled: boolean) => void) => {
    ipcRenderer.on('set-debug-border', (_e, enabled) => cb(enabled));
  },
  onSkinOpacity: (cb: (v: number) => void) => {
    ipcRenderer.on('set-skin-opacity', (_e, v) => cb(v));
  },
  onGravityScale: (cb: (v: number) => void) => {
    ipcRenderer.on('set-gravity-scale', (_e, v) => cb(v));
  },
  onAiTranscription: (cb: (text: string) => void) => {
    ipcRenderer.on('ai-transcription', (_e, text) => cb(text));
  },
  onSpeechBubbles: (cb: (v: boolean) => void) => {
    ipcRenderer.on('set-speech-bubbles', (_e, v) => cb(v));
  },
  pingActivity: () => ipcRenderer.send('ping-activity'),
  triggerEmote: (name: string) => ipcRenderer.send('trigger-emote-from-settings', name),
  addCustomAnimation: (name: string, script: string) =>
    ipcRenderer.invoke('add-custom-animation', { name, script }),
  deleteCustomAnimation: (name: string) =>
    ipcRenderer.invoke('delete-custom-animation', name),
  setActivityMode: (mode: string) =>
    ipcRenderer.invoke('set-activity-mode', mode),
  onCustomAnimAdded: (cb: (data: { name: string; script: string }) => void) => {
    ipcRenderer.on('custom-anim-added', (_e, data) => cb(data));
  },
  downloadSkinTemplate: () => ipcRenderer.invoke('download-skin-template'),
  clearHistory: () => ipcRenderer.invoke('clear-history'),
  diagnoseAi: () => ipcRenderer.invoke('diagnose-ai'),
  getDisplays: () => ipcRenderer.invoke('get-displays'),
  openExternal: (url: string) => ipcRenderer.send('open-external', url),
  removeAllListeners: (channel: string) => {
    ipcRenderer.removeAllListeners(channel);
  },

  // Launcher
  selectMode: (mode: 'desktop' | 'mobile') =>
    ipcRenderer.send('launcher-mode', mode),
  closeApp: () => ipcRenderer.send('close-app'),

  // QR window
  getQrData: () => ipcRenderer.invoke('get-qr-data'),
  onQrData: (cb: (data: { url: string; webUrl: string; host: string; port: number }) => void) => {
    ipcRenderer.on('qr-data', (_e, data) => cb(data));
  },
});
