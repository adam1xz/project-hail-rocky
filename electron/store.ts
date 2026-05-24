import Store from 'electron-store';

export interface AppSettings {
  theme: 'night' | 'day' | 'midnight';
  skin: string;
  skinOpacity: number;
  scale: number;
  corner: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'full-window';
  displayIndex: number;
  windowWidth: number;
  windowHeight: number;
  floorOffset: number;
  gravityScale: number;
  windowX: number;
  windowY: number;
  rockyOffsetX: number;
  rockyOffsetY: number;
  pinToTop: boolean;
  idleEnabled: boolean;
  animationSpeed: number;
  enabledAnimations: string[];
  disabledAnimations: string[];
  fontSize: number;
  language: string;
  autoStart: boolean;
  developerMode: boolean;
  activityMode: 'active' | 'quiet' | 'sleep';
  systemPromptSuffix: string;
  ollama: { endpoint: string; model: string };
  stt: { model: 'faster' | 'better'; device: string; language: string; mode: 'auto' | 'model' | 'external' };
  tts: { device: string; volume: number };
  debug: { showBorder: boolean; logConversation: boolean };
  contextSize: number;
  customAnimations: Record<string, string>;
  speechBubbles: boolean;
}

const defaults: AppSettings = {
  theme: 'night',
  skin: 'rocky',
  skinOpacity: 1.0,
  scale: 1.0,
  corner: 'bottom-right',
  displayIndex: 0,
  windowWidth: 750,
  windowHeight: 860,
  floorOffset: 0,
  gravityScale: 1.0,
  windowX: -1,
  windowY: -1,
  rockyOffsetX: 0,
  rockyOffsetY: 0,
  pinToTop: true,
  idleEnabled: true,
  animationSpeed: 1.0,
  enabledAnimations: [],
  disabledAnimations: [],
  fontSize: 14,
  language: 'en',
  autoStart: false,
  developerMode: false,
  activityMode: 'active',
  systemPromptSuffix: '',
  ollama: { endpoint: 'http://localhost:11434', model: 'Rockyv8:latest' },
  stt: { model: 'better', device: 'default', language: 'auto', mode: 'auto' },
  tts: { device: 'default', volume: 1.0 },
  debug: { showBorder: false, logConversation: false },
  contextSize: 12,
  customAnimations: {},
  speechBubbles: true,
};

export const store = new Store<AppSettings>({ defaults });
