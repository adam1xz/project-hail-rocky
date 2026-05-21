// Type declarations for window.electronAPI (injected by preload.ts)
export {};

declare global {
  interface Window {
    electronAPI?: {
      setInteractive:       (v: boolean) => void;
      saveRockyPosition?:   (x: number, y: number) => void;
      getSettings:          () => Promise<any>;
      saveSettings:         (s: any) => Promise<any>;
      getSkins:             () => Promise<any[]>;
      getAnimations:        () => Promise<string[]>;
      importSkin:           (d: { name: string; pngBase64: string }) => Promise<any>;
      downloadSkinTemplate: () => Promise<{ ok: boolean }>;
      clearHistory:         () => Promise<{ ok: boolean; error?: string }>;
      getDisplays:          () => Promise<Array<{ index: number; label: string; width: number; height: number; primary: boolean }>>;
      diagnoseAi:           () => Promise<{
        ollama_running: boolean; model_found: boolean;
        configured_model: string; available_models: string[];
        ollama_error?: string;
        stt_loaded: boolean; tts_loaded: boolean; stt_active: boolean;
        stt_model?: string; stt_device?: string; tts_device?: string;
        error?: string;
      }>;
      getOllamaModels:      () => Promise<string[]>;
      getAudioDevices:      () => Promise<{ inputs: string[]; outputs: string[] }>;
      restartBackend:       () => void;
      openSettings:         (tab?: string) => void;
      openExternal?:        (url: string) => void;
      onEmote:              (cb: (name: string) => void) => void;
      onSkinChange:         (cb: (id: string) => void) => void;
      onScaleChange:        (cb: (scale: number) => void) => void;
      onCornerChange:       (cb: (corner: string) => void) => void;
      onSettingsLoaded:     (cb: (s: any) => void) => void;
      onSkinImported:       (cb: (r: { success: boolean; name: string; error?: string }) => void) => void;
      navigateTab:          (cb: (tab: string) => void) => void;
      onAiResponse?:        (cb: (text: string) => void) => void;
      onAiState?:           (cb: (state: string) => void) => void;
      onWakeup?:            (cb: () => void) => void;
      onDebugBorder?:       (cb: (enabled: boolean) => void) => void;
      onSkinOpacity?:       (cb: (v: number) => void) => void;
      onGravityScale?:      (cb: (v: number) => void) => void;
      onAiTranscription?:   (cb: (text: string) => void) => void;
      onSpeechBubbles?:     (cb: (v: boolean) => void) => void;
      pingActivity?:        () => void;
      triggerEmote?:        (name: string) => void;
      addCustomAnimation?:  (name: string, script: string) => Promise<string[]>;
      deleteCustomAnimation?: (name: string) => Promise<string[]>;
      setActivityMode?:     (mode: string) => Promise<{ ok: boolean }>;
      onCustomAnimAdded?:   (cb: (data: { name: string; script: string }) => void) => void;
      removeAllListeners:   (ch: string) => void;
      // Launcher
      selectMode?:          (mode: 'desktop' | 'mobile') => void;
      closeApp?:            () => void;
      // QR window
      getQrData?:           () => Promise<{ url: string; webUrl: string; host: string; port: number } | null>;
      onQrData?:            (cb: (data: { url: string; webUrl: string; host: string; port: number }) => void) => void;
    };
  }
}
