import { Tray, Menu, nativeImage, app } from 'electron';
import path from 'path';
import { store } from './store';
import { getCharacterWindow } from './character-window';
import { openSettings } from './settings-window';
import { getBackendPort } from './ipc-handlers';
import { showQrWindow } from './qr-window';

// ─── Tray i18n ────────────────────────────────────────────────────────────────
type LangCode = 'en' | 'pl' | 'es' | 'de';

const TRAY_TR: Record<LangCode, Record<string, string>> = {
  en: {
    hide: 'Hide Rocky', show: 'Show Rocky',
    settings: 'Settings',
    pin: 'Pin to top',
    skin: 'Skin',
    activity: 'Activity',
    activity_active: 'Active',
    activity_quiet: 'Quiet',
    activity_sleep: 'Sleep',
    reset_anim: 'Reset animation',
    clear_history: 'Clear AI history',
    restart: 'Restart',
    quit: 'Quit',
  },
  pl: {
    hide: 'Ukryj Rocky\'ego', show: 'Pokaż Rocky\'ego',
    settings: 'Ustawienia',
    pin: 'Przypnij na wierzchu',
    skin: 'Skórka',
    activity: 'Aktywność',
    activity_active: 'Aktywny',
    activity_quiet: 'Cichy',
    activity_sleep: 'Śpi',
    reset_anim: 'Resetuj animację',
    clear_history: 'Wyczyść historię AI',
    restart: 'Uruchom ponownie',
    quit: 'Zamknij',
  },
  es: {
    hide: 'Ocultar Rocky', show: 'Mostrar Rocky',
    settings: 'Configuración',
    pin: 'Anclar encima',
    skin: 'Skin',
    activity: 'Actividad',
    activity_active: 'Activo',
    activity_quiet: 'Silencioso',
    activity_sleep: 'Durmiendo',
    reset_anim: 'Reiniciar animación',
    clear_history: 'Borrar historial IA',
    restart: 'Reiniciar',
    quit: 'Salir',
  },
  de: {
    hide: 'Rocky ausblenden', show: 'Rocky anzeigen',
    settings: 'Einstellungen',
    pin: 'Im Vordergrund',
    skin: 'Skin',
    activity: 'Aktivität',
    activity_active: 'Aktiv',
    activity_quiet: 'Ruhig',
    activity_sleep: 'Schläft',
    reset_anim: 'Animation zurücksetzen',
    clear_history: 'KI-Verlauf löschen',
    restart: 'Neu starten',
    quit: 'Beenden',
  },
};

function tt(key: string): string {
  const lang = (store.get('language' as any, 'en') as LangCode) || 'en';
  return TRAY_TR[lang]?.[key] ?? TRAY_TR.en[key] ?? key;
}

let tray: Tray | null = null;
let isVisible = true;
let _isMobileMode = false;

export function setMobileMode(mobile: boolean): void {
  _isMobileMode = mobile;
  rebuildMenu();
}

export function createTray(): Tray {
  const iconPath = path.join(__dirname, '../public/tray-icon.png');
  let icon: Electron.NativeImage;
  try {
    icon = nativeImage.createFromPath(iconPath);
    if (icon.isEmpty()) throw new Error('empty');
  } catch {
    icon = nativeImage.createEmpty();
  }

  tray = new Tray(icon);
  tray.setToolTip('Rocky');
  rebuildMenu();
  return tray;
}

export function getTray(): Tray | null {
  return tray;
}

function setTrayActivity(mode: 'active' | 'quiet' | 'sleep'): void {
  store.set('activityMode', mode);
  const port = getBackendPort();
  if (port) {
    fetch(`http://localhost:${port}/activity`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode }),
    }).catch(() => {});
  }
  const win = getCharacterWindow();
  if (mode === 'sleep') win?.webContents.send('trigger-emote', 'sleep');
  else if (mode === 'active') win?.webContents.send('trigger-emote', 'default');
  rebuildMenu();
}

export function rebuildMenu(): void {
  if (!tray) return;

  const s = store.store;
  const win = getCharacterWindow();
  const currentActivity = s.activityMode ?? 'active';

  const skinsRaw = getSkinList();
  const skinItems = skinsRaw.map(sk => ({
    label: sk.name,
    type: 'radio' as const,
    checked: s.skin === sk.id,
    click: () => {
      store.set('skin', sk.id);
      win?.webContents.send('set-skin', sk.id);
      rebuildMenu();
    },
  }));

  const mobilePart: Electron.MenuItemConstructorOptions[] = _isMobileMode ? [
    {
      label: 'Show QR Code',
      click: () => showQrWindow(),
    },
    { type: 'separator' },
    {
      label: tt('settings'),
      click: () => openSettings(),
    },
  ] : [
    {
      label: isVisible ? tt('hide') : tt('show'),
      click: () => {
        const w = getCharacterWindow();
        if (!w) return;
        isVisible = !isVisible;
        isVisible ? w.show() : w.hide();
        rebuildMenu();
      },
    },
    { type: 'separator' },
    {
      label: tt('settings'),
      click: () => openSettings(),
    },
  ];

  const desktopOnlyItems: Electron.MenuItemConstructorOptions[] = _isMobileMode ? [] : [
    { type: 'separator' },
    {
      label: tt('pin'),
      type: 'checkbox',
      checked: s.pinToTop,
      click: () => {
        const val = !s.pinToTop;
        store.set('pinToTop', val);
        getCharacterWindow()?.setAlwaysOnTop(val);
        rebuildMenu();
      },
    },
    {
      label: tt('skin'),
      submenu: skinItems.length ? skinItems : [{ label: tt('skin'), enabled: false }],
    },
    { type: 'separator' },
    {
      label: tt('activity'),
      submenu: [
        {
          label: tt('activity_active'),
          type: 'radio',
          checked: currentActivity === 'active',
          click: () => setTrayActivity('active'),
        },
        {
          label: tt('activity_quiet'),
          type: 'radio',
          checked: currentActivity === 'quiet',
          click: () => setTrayActivity('quiet'),
        },
        {
          label: tt('activity_sleep'),
          type: 'radio',
          checked: currentActivity === 'sleep',
          click: () => setTrayActivity('sleep'),
        },
      ],
    },
  ];

  const utilItems: Electron.MenuItemConstructorOptions[] = [
    ...(_isMobileMode ? [] : [{
      label: tt('reset_anim'),
      click: () => getCharacterWindow()?.webContents.send('trigger-emote', 'default'),
    } as Electron.MenuItemConstructorOptions]),
    {
      label: tt('clear_history'),
      click: () => {
        const port = getBackendPort();
        if (port) fetch(`http://localhost:${port}/clear-history`, { method: 'POST' }).catch(() => {});
      },
    },
    {
      label: tt('restart'),
      click: () => { app.relaunch(); app.exit(0); },
    },
  ];

  const menu = Menu.buildFromTemplate([
    ...mobilePart,
    ...desktopOnlyItems,
    { type: 'separator' },
    ...utilItems,
    { type: 'separator' },
    { label: tt('quit'), click: () => app.exit(0) },
  ]);

  tray.setContextMenu(menu);
}

function getSkinList(): Array<{ id: string; name: string }> {
  try {
    const fs = require('fs');
    const p = path.join(process.env.DEV === 'true'
      ? path.join(__dirname, '../public/skins/skins.json')
      : path.join(__dirname, '../dist/skins/skins.json'));
    return JSON.parse(fs.readFileSync(p, 'utf-8'));
  } catch {
    return [{ id: 'rocky', name: 'Rocky' }];
  }
}
