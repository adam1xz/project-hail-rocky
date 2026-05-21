import { BrowserWindow, screen } from 'electron';
import path from 'path';
import { store } from './store';

let win: BrowserWindow | null = null;

function getTargetDisplay(displayIndex: number) {
  const displays = screen.getAllDisplays();
  return displays[Math.min(Math.max(displayIndex, 0), displays.length - 1)]
    ?? screen.getPrimaryDisplay();
}

export function createCharacterWindow(preloadPath: string): BrowserWindow {
  const s = store.store;
  const display = getTargetDisplay(s.displayIndex ?? 0);
  const { x: dx, y: dy, width: sw, height: sh } = display.workArea;

  let w: number, h: number, px: number, py: number;

  if (s.corner === 'full-window') {
    w = sw;
    h = sh;
    px = dx;
    py = dy;
  } else {
    w = Math.round(s.windowWidth * s.scale);
    h = Math.round(s.windowHeight * s.scale);
    const floorOffset = s.floorOffset ?? 0;
    if ((s.windowX ?? -1) !== -1 && (s.windowY ?? -1) !== -1) {
      px = Math.max(dx, Math.min(s.windowX, dx + sw - w));
      py = Math.max(dy, Math.min(s.windowY, dy + sh - h));
    } else {
      const pos = cornerPosition(s.corner, w, h, sw, sh);
      px = dx + pos.x;
      py = dy + pos.y;
      if (s.corner.startsWith('bottom')) py -= floorOffset;
    }
  }

  win = new BrowserWindow({
    width: w,
    height: h,
    x: px,
    y: py,
    transparent: true,
    frame: false,
    alwaysOnTop: s.pinToTop,
    skipTaskbar: true,
    resizable: false,
    hasShadow: false,
    focusable: true,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.setIgnoreMouseEvents(true, { forward: true });

  if (process.env.DEV === 'true') {
    win.loadURL('http://localhost:3000');
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  win.on('closed', () => { win = null; });

  return win;
}

export function getCharacterWindow(): BrowserWindow | null {
  return win;
}

export function repositionWindow(corner?: string, scale?: number, displayIndex?: number): void {
  if (!win) return;
  const s = store.store;
  const c = (corner ?? s.corner) as string;
  const sc = scale ?? s.scale;
  const di = displayIndex ?? s.displayIndex ?? 0;
  const display = getTargetDisplay(di);
  const { x: dx, y: dy, width: sw, height: sh } = display.workArea;

  let bounds: { x: number; y: number; width: number; height: number };

  if (c === 'full-window') {
    bounds = { x: dx, y: dy, width: sw, height: sh };
  } else {
    const w = Math.round(s.windowWidth * sc);
    const h = Math.round(s.windowHeight * sc);
    const pos = cornerPosition(c, w, h, sw, sh);
    const floorOffset = s.floorOffset ?? 0;
    const posY = c.startsWith('bottom') ? dy + pos.y - floorOffset : dy + pos.y;
    bounds = { x: dx + pos.x, y: posY, width: w, height: h };
  }

  win.setBounds(bounds);
}

export function cornerPosition(
  corner: string, w: number, h: number, sw: number, sh: number
): { x: number; y: number } {
  switch (corner) {
    case 'top-left':     return { x: 0, y: 0        };
    case 'top-right':    return { x: sw - w, y: 0        };
    case 'bottom-left':  return { x: 0, y: sh - h };
    case 'bottom-right':
    default:             return { x: sw - w, y: sh - h };
  }
}
