import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { animate } from 'motion';

const GRAVITY           = 2400;
const EDGE_PADDING      = 38;
const FLOOR_REST        = 0.06;
const WALL_REST         = 0.12;
const FLOOR_FRIC        = 0.82;
const STOP_V            = 4.0;
const LANDING_THRESHOLD = 400;
const LIMB_INERTIA      = 0.04;
const LIMB_RECOVERY     = 7.0;
const ROPE_RESTITUTION  = 0.0;
const LIMB_IDS = ['hand1', 'hand2', 'leg1', 'leg2', 'leg3'] as const;

// --- RIG DEFINITION ---
const RIG = {
  body: { pivot: { x: 295.1, y: 392.2 } },
  legs: [
    {
      id: 'leg1',
      thighPivot: { x: 210.0, y: 241.6 },
      kneePivot: { x: 105.9, y: 407.9 },
      footEnd: { x: 80, y: 590 },
      flip: true,
      L1: 0, L2: 0, theta1_rest: 0, theta2_rest: 0
    },
    {
      id: 'leg2',
      thighPivot: { x: 225.4, y: 292.2 },
      kneePivot: { x: 171.1, y: 381.1 },
      footEnd: { x: 178, y: 572 },
      flip: true,
      L1: 0, L2: 0, theta1_rest: 0, theta2_rest: 0
    },
    {
      id: 'leg3',
      thighPivot: { x: 391.6, y: 242.0 },
      kneePivot: { x: 455.5, y: 422.4 },
      footEnd: { x: 487, y: 570 },
      flip: false,
      L1: 0, L2: 0, theta1_rest: 0, theta2_rest: 0
    }
  ],
  hands: [
    {
      id: 'hand1',
      thighPivot: { x: 235.463, y: 228.269 },
      kneePivot: { x: 143.8, y: 345.9 },
      footEnd: { x: 173.5, y: 414.7 },
      flip: true,
      L1: 0, L2: 0, theta1_rest: 0, theta2_rest: 0
    },
    {
      id: 'hand2',
      thighPivot: { x: 402.1, y: 201.3 },
      kneePivot: { x: 507.2, y: 303.7 },
      footEnd: { x: 589.6, y: 120.6 },
      flip: true,
      L1: 0, L2: 0, theta1_rest: 0, theta2_rest: 0
    }
  ]
};

// --- ASSEMBLED SKIN DATA ---
// Data is now loaded dynamically via assembly_data.json


// --- NOISE HELPER (Perlin-style, no external dep) ---
const _noisePerm = (() => {
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[p[i], p[j]] = [p[j], p[i]]; }
  return new Uint8Array([...p, ...p]);
})();
const _fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
const _ngrad = (h: number, x: number) => ((h & 8 ? -1 : 1) * (1 + (h & 7))) * x;
const noise1D = (x: number): number => {
  const X = Math.floor(x) & 255, xf = x - Math.floor(x), u = _fade(xf);
  return _ngrad(_noisePerm[X], xf) + (_ngrad(_noisePerm[X + 1], xf - 1) - _ngrad(_noisePerm[X], xf)) * u;
};

// Precalculate lengths and rest angles for IK
[...RIG.legs, ...RIG.hands].forEach(leg => {
  const dx1 = leg.kneePivot.x - leg.thighPivot.x;
  const dy1 = leg.kneePivot.y - leg.thighPivot.y;
  leg.L1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);
  leg.theta1_rest = Math.atan2(dy1, dx1);

  const dx2 = leg.footEnd.x - leg.kneePivot.x;
  const dy2 = leg.footEnd.y - leg.kneePivot.y;
  leg.L2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);
  const theta_abs_knee = Math.atan2(dy2, dx2);

  leg.theta2_rest = theta_abs_knee - leg.theta1_rest;
  while (leg.theta2_rest > Math.PI) leg.theta2_rest -= 2 * Math.PI;
  while (leg.theta2_rest < -Math.PI) leg.theta2_rest += 2 * Math.PI;
});

function solve2BoneIK(x0: number, y0: number, xT: number, yT: number, L1: number, L2: number, flip: boolean) {
  let dx = xT - x0;
  let dy = yT - y0;
  let D = Math.sqrt(dx * dx + dy * dy);

  if (D < 0.001) {
    D = 0.001;
    dx = 0.001;
    dy = 0;
  }

  // Soft IK clamp - limb resists at max reach instead of hard-stopping
  const maxReach = L1 + L2;
  const softMargin = 15;
  const softZone = maxReach - softMargin;
  if (D > softZone) {
    const over = D - softZone;
    const t = Math.min(over / softMargin, 1);
    const smooth = t * t * (3 - 2 * t);
    D = softZone + over * (1 - smooth * 0.5);
  }
  if (D > maxReach - 0.001) {
    const clampedD = maxReach - 0.001;
    dx = (dx / D) * clampedD;
    dy = (dy / D) * clampedD;
    D = clampedD;
  }

  let cosTheta2 = (D * D - L1 * L1 - L2 * L2) / (2 * L1 * L2);
  cosTheta2 = Math.max(-1, Math.min(1, cosTheta2));
  let theta2 = Math.acos(cosTheta2);
  if (flip) theta2 = -theta2;

  const beta = Math.atan2(dy, dx);
  let cosAlpha = (L1 * L1 + D * D - L2 * L2) / (2 * L1 * D);
  cosAlpha = Math.max(-1, Math.min(1, cosAlpha));
  const alpha = Math.acos(cosAlpha);

  const theta1 = flip ? beta + alpha : beta - alpha;

  return { theta1, theta2 };
}

// extent = projection range along principal axis (consistent between perimeter & area sampling)
// skew  = third central moment along axis (sign disambiguates +/-180deg PCA ambiguity)
type ShapeMoments = { cx: number; cy: number; angle: number; extent: number; skew: number };

// PCA on 200 uniformly-sampled SVG path points
function getSVGPathMoments(pathEl: SVGGeometryElement): ShapeMoments | null {
  try {
    const len = pathEl.getTotalLength();
    if (len === 0) return null;
    const N = 200;
    const pts: { x: number; y: number }[] = [];
    let sx = 0, sy = 0, sxx = 0, sxy = 0, syy = 0;
    for (let i = 0; i < N; i++) {
      const p = pathEl.getPointAtLength((i / N) * len);
      pts.push(p);
      sx += p.x; sy += p.y;
      sxx += p.x * p.x; sxy += p.x * p.y; syy += p.y * p.y;
    }
    const cx = sx / N, cy = sy / N;
    const cxx = sxx / N - cx * cx, cxy = sxy / N - cx * cy, cyy = syy / N - cy * cy;
    const angle = Math.atan2(2 * cxy, cxx - cyy) / 2;
    const cos = Math.cos(angle), sin = Math.sin(angle);
    let minU = Infinity, maxU = -Infinity, skewSum = 0;
    for (const p of pts) {
      const u = (p.x - cx) * cos + (p.y - cy) * sin;
      if (u < minU) minU = u;
      if (u > maxU) maxU = u;
      skewSum += u * u * u;
    }
    return { cx, cy, angle, extent: maxU - minU, skew: skewSum / N };
  } catch { return null; }
}

// PCA on non-transparent PNG pixels via canvas (two-pass: moments -> extent+skew)
function getPNGMoments(url: string): Promise<(ShapeMoments & { W: number; H: number }) | null> {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const { naturalWidth: W, naturalHeight: H } = img;
      try {
        const canvas = document.createElement('canvas');
        canvas.width = W; canvas.height = H;
        const ctx = canvas.getContext('2d');
        if (!ctx) { resolve(null); return; }
        ctx.drawImage(img, 0, 0);
        const d = ctx.getImageData(0, 0, W, H).data;
        let m00 = 0, m10 = 0, m01 = 0, m11 = 0, m20 = 0, m02 = 0;
        for (let y = 0; y < H; y++) {
          for (let x = 0; x < W; x++) {
            if (d[(y * W + x) * 4 + 3] > 10) {
              m00++; m10 += x; m01 += y;
              m20 += x * x; m11 += x * y; m02 += y * y;
            }
          }
        }
        if (m00 === 0) { resolve(null); return; }
        const cx = m10 / m00, cy = m01 / m00;
        const cxx = m20 / m00 - cx * cx, cxy = m11 / m00 - cx * cy, cyy = m02 / m00 - cy * cy;
        const angle = Math.atan2(2 * cxy, cxx - cyy) / 2;
        const cos = Math.cos(angle), sin = Math.sin(angle);
        let minU = Infinity, maxU = -Infinity, skewSum = 0;
        for (let y = 0; y < H; y++) {
          for (let x = 0; x < W; x++) {
            if (d[(y * W + x) * 4 + 3] > 10) {
              const u = (x - cx) * cos + (y - cy) * sin;
              if (u < minU) minU = u;
              if (u > maxU) maxU = u;
              skewSum += u * u * u;
            }
          }
        }
        resolve({ cx, cy, angle, extent: maxU - minU, skew: skewSum / m00, W, H });
      } catch { resolve(null); }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

// Aligns a skin PNG to its vector shape by matching centroids and principal axes.
// Scale uses projection extent (consistent between perimeter & area), not eigenvalue spread.
// 180deg disambiguation uses skewness (third moment) sign comparison.
function AutoSkinImage({ href, clipId, opacity = 1, flip = false }: {
  href?: string; clipId: string; opacity?: number; flip?: boolean;
}) {
  const [render, setRender] = useState<{ tf: string; W: number; H: number } | null>(null);

  useLayoutEffect(() => {
    if (!href) { setRender(null); return; }
    let cancelled = false;
    const pathEl = document.querySelector(`#${clipId} path`) as SVGGeometryElement | null;
    if (!pathEl) return;
    const svg = getSVGPathMoments(pathEl);
    if (!svg || svg.extent === 0) return;

    getPNGMoments(href).then(png => {
      if (cancelled || !png || png.extent === 0) return;

      // +/-pi PCA ambiguity: pick the smallest absolute rotation first
      let rot = svg.angle - png.angle;
      while (rot > Math.PI / 2) rot -= Math.PI;
      while (rot < -Math.PI / 2) rot += Math.PI;

      // 180deg flip check via skewness sign - only when both shapes are clearly asymmetric
      // Threshold: normalized skewness > 10% of half-extent^3
      const svgSkewNorm = Math.abs(svg.skew) / Math.pow(svg.extent * 0.5, 3);
      const pngSkewNorm = Math.abs(png.skew) / Math.pow(png.extent * 0.5, 3);
      if (svgSkewNorm > 0.10 && pngSkewNorm > 0.10 && (svg.skew > 0) !== (png.skew > 0)) {
        rot += Math.PI;
        if (rot > Math.PI) rot -= 2 * Math.PI;
      }

      // Uniform scale: ratio of projection extents (SVG units per PNG pixel)
      const s = svg.extent / png.extent;
      if (flip) rot += Math.PI;
      setRender({
        tf: [
          `translate(${svg.cx.toFixed(3)},${svg.cy.toFixed(3)})`,
          `rotate(${(rot * 180 / Math.PI).toFixed(3)})`,
          `scale(${s.toFixed(6)})`,
          `translate(${(-png.cx).toFixed(3)},${(-png.cy).toFixed(3)})`,
        ].join(' '),
        W: png.W, H: png.H,
      });
    });
    return () => { cancelled = true; };
  }, [href, clipId]);

  if (!href || !render) return null;
  return (
    <image
      href={href}
      x={0} y={0} width={render.W} height={render.H}
      transform={render.tf}
      opacity={opacity}
      preserveAspectRatio="none"
    />
  );
}

type Keyframe = {
  id: string;
  name: string;
  state: {
    body: { x: number, y: number, tilt?: number },

    feet: { leg1: { x: number, y: number, a: number }, leg2: { x: number, y: number, a: number }, leg3: { x: number, y: number, a: number } },
    hands: { hand1: { x: number, y: number, a: number }, hand2: { x: number, y: number, a: number } },
    back_y: [number, number, number]
  }
};

type AnimationSequence = {
  id: string;
  name: string;
  loop: boolean;
  breathing?: boolean;
  frames: { keyframeId: string, duration: number, type: 'stay' | 'transition' | 'go to default' }[];
};

export default function App() {
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef({
    isDragging: false, part: null as string | null,
    lastX: 0, lastY: 0, lastClientX: 0, lastClientY: 0,
    startAngle: 0, startRot: 0,
    grabAnchorX: 0, grabAnchorY: 0,
    limbDragCursorX: 0, limbDragCursorY: 0,
  });
  const stageRef = useRef<HTMLDivElement>(null);
  const gravityScaleRef = useRef(1.0);
  const playingSequenceIdRef = useRef<string | null>(null);
  const wasAsleepRef = useRef(false);
  const aeroDragRef = useRef(false);

  const [isStudioMode, setIsStudioMode] = useState(false);
  const [previewingEmote, setPreviewingEmote] = useState<string | null>(null);
  const [skinOpacity, setSkinOpacity] = useState<number>(1.0);
  const [vectorOpacity, setVectorOpacity] = useState<number>(0.15);
  const [skinData, setSkinData] = useState<any[]>([]);
  const [selectedSkin, setSelectedSkin] = useState<string>('rocky');
  const [availableSkins, setAvailableSkins] = useState<Array<{id: string, name: string}>>([]);
  const [skinManifest, setSkinManifest] = useState<Record<string, string>>({});
  const [aiState, setAiState] = useState<string>('idle');
  const [debugBorder, setDebugBorder] = useState(false);
  const [speechBubble, setSpeechBubble] = useState<string | null>(null);
  const [rockyBubblePhase, setRockyBubblePhase] = useState<'in' | 'out'>('in');
  const [userBubble, setUserBubble] = useState<string | null>(null);
  const [userBubblePhase, setUserBubblePhase] = useState<'in' | 'out'>('in');
  const [speechBubblesEnabled, setSpeechBubblesEnabled] = useState(true);
  const speechBubblesRef = useRef(true);
  const bubbleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userBubbleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingBubbleRef = useRef<string | null>(null);
  const [isFullWindow, setIsFullWindow] = useState(false);
  const [fullWindowCorner, setFullWindowCorner] = useState('bottom-right');
  const [charW, setCharW] = useState(750);
  const [charH, setCharH] = useState(860);

  // Fetch Skin Data
  useEffect(() => {
    fetch('/assembly_data.json')
      .then(res => res.json())
      .then(data => setSkinData(data))
      .catch(err => console.error("Failed to load skin data", err));
  }, []);

  useEffect(() => {
    fetch('/skins/skins.json').then(r => r.json()).then(setAvailableSkins).catch(() => {});
  }, []);

  useEffect(() => {
    fetch(`/skins/${selectedSkin}/manifest.json`)
      .then(r => r.json())
      .then(setSkinManifest)
      .catch(() => {});
  }, [selectedSkin]);

  const skinUrl = (part: string): string | undefined =>
    skinManifest[part] ? `/skins/${selectedSkin}/${skinManifest[part]}` : undefined;

  // --- ELECTRON IPC INTEGRATION ---
  useEffect(() => {
    const api = window.electronAPI;
    if (!api) return;

    const applyLayoutSettings = (s: any) => {
      const isfw = s.corner === 'full-window';
      setIsFullWindow(isfw);
      if (!isfw) setFullWindowCorner(s.corner ?? 'bottom-right');
      const sc = s.scale ?? 1;
      setCharW(Math.round((s.windowWidth ?? 750) * sc));
      setCharH(Math.round((s.windowHeight ?? 860) * sc));
    };

    api.getSettings?.().then((s: any) => {
      if (s) {
        if (s.skin) setSelectedSkin(s.skin);
        if (s.debug?.showBorder !== undefined) setDebugBorder(s.debug.showBorder);
        if (s.skinOpacity !== undefined) setSkinOpacity(s.skinOpacity);
        if (s.customAnimations) customAnimsRef.current = s.customAnimations;
        applyLayoutSettings(s);
        if (s.gravityScale !== undefined) gravityScaleRef.current = s.gravityScale;
        if (s.speechBubbles !== undefined) {
          speechBubblesRef.current = s.speechBubbles;
          setSpeechBubblesEnabled(s.speechBubbles);
        }
        if (s.rockyOffsetX !== undefined) {
          state.current.rocky.x = s.rockyOffsetX;
          state.current.rocky.y = s.rockyOffsetY ?? 0;
          state.current.rocky.grounded = false;
        }
      }
    });

    api.onCustomAnimAdded?.(({ name, script }) => {
      customAnimsRef.current = { ...customAnimsRef.current, [name]: script };
    });

    api.onEmote((name) => triggerAnimRef.current(name));
    api.onSkinChange((id) => setSelectedSkin(id));
    api.onSettingsLoaded((s: any) => {
      if (s.skin) setSelectedSkin(s.skin);
      if (s.debug?.showBorder !== undefined) setDebugBorder(s.debug.showBorder);
      if (s.skinOpacity !== undefined) setSkinOpacity(s.skinOpacity);
      if (s.gravityScale !== undefined) gravityScaleRef.current = s.gravityScale;
      applyLayoutSettings(s);
    });
    api.onAiState?.((st) => {
      setAiState(st);
      if (st === 'speaking' && pendingBubbleRef.current && speechBubblesRef.current) {
        if (bubbleTimerRef.current) clearTimeout(bubbleTimerRef.current);
        setSpeechBubble(pendingBubbleRef.current);
        setRockyBubblePhase('in');
        bubbleTimerRef.current = setTimeout(() => setRockyBubblePhase('out'), 7000);
        pendingBubbleRef.current = null;
      }
      if (st === 'idle' || st === 'listening') pendingBubbleRef.current = null;
    });
    api.onWakeup?.(() => triggerAnimRef.current('stretch'));
    api.onDebugBorder?.((enabled) => setDebugBorder(enabled));
    api.onSkinOpacity?.((v) => setSkinOpacity(v));
    api.onGravityScale?.((v) => { gravityScaleRef.current = v; });
    api.onAiResponse?.((text) => {
      if (!speechBubblesRef.current) return;
      pendingBubbleRef.current = text.slice(0, 200);
    });
    api.onAiTranscription?.((text) => {
      if (!speechBubblesRef.current) return;
      if (userBubbleTimerRef.current) clearTimeout(userBubbleTimerRef.current);
      setUserBubble(text.slice(0, 200));
      setUserBubblePhase('in');
      userBubbleTimerRef.current = setTimeout(() => setUserBubblePhase('out'), 4500);
    });
    api.onSpeechBubbles?.((v) => {
      speechBubblesRef.current = v;
      setSpeechBubblesEnabled(v);
      if (!v) {
        setSpeechBubble(null);
        setUserBubble(null);
      }
    });
    return () => {
      api.removeAllListeners('ai-wakeup');
      api.removeAllListeners('trigger-emote');
      api.removeAllListeners('set-skin');
      api.removeAllListeners('settings-loaded');
      api.removeAllListeners('ai-state');
      api.removeAllListeners('set-debug-border');
      api.removeAllListeners('set-skin-opacity');
      api.removeAllListeners('set-gravity-scale');
      api.removeAllListeners('ai-transcription');
      api.removeAllListeners('set-speech-bubbles');
      api.removeAllListeners('ai-response');
    };
  }, []);

  // Click-through detection: notify main process when hovering over Rocky
  useEffect(() => {
    const api = window.electronAPI;
    if (!api) return;

    // Only these element IDs count as "over Rocky" - SVG background areas are excluded
    const ROCKY_IDS = new Set([
      'body_main', 'back_elements',
      'leg1_main', 'leg1_foot',
      'leg2_main', 'leg2_foot',
      'leg3_main', 'leg3_foot', 'leg3_foot_small',
      'hand1_main', 'hand1_foot',
      'hand2_main', 'hand2_foot',
    ]);

    const isOverRocky = (el: Element | null): boolean => {
      let curr = el;
      while (curr && curr.tagName.toUpperCase() !== 'HTML') {
        if (curr.id && ROCKY_IDS.has(curr.id)) return true;
        curr = curr.parentElement;
      }
      return false;
    };

    let lastInteractive = false;
    const onMove = (e: MouseEvent) => {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const on = isOverRocky(el);
      if (on !== lastInteractive) {
        lastInteractive = on;
        api.setInteractive(on);
      }
    };
    document.addEventListener('mousemove', onMove);

    const onLeave = () => {
      if (!dragRef.current.isDragging) return;
      dragRef.current.isDragging = false;
      dragRef.current.part = null;
      state.current.dragVel.samples = [];
      triggerAnimRef.current('default');
    };
    document.addEventListener('mouseleave', onLeave);

    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseleave', onLeave);
    };
  }, []);

  // --- ANIMATION CONFIGURATION ---
  const ANIM_CONFIG = {
    pretransitionSec: 0.7,
    pretransitionMs: 700,
    ease: "easeInOut" as any
  };

  const BACK_BREATHING = {
    speed: 0.35,
    amplitude: 1.2,
    heightDiff: 12,
    lerp: 0.035
  };

  const nextIdleDelay = () => 8000 + Math.random() * 8000;
  const IDLE_POOL = ['stretch', 'chirp', 'nod', 'idle_sway', 'idle_look'];

  const EMOTE_CONFIG: Record<string, { mode: 'hold' | 'timed' | 'once'; timeoutMs: number }> = {
    freeze: { mode: 'hold', timeoutMs: 0 },
    sleep: { mode: 'hold', timeoutMs: 0 },
    dance: { mode: 'hold', timeoutMs: 0 },
    crouch: { mode: 'hold', timeoutMs: 0 },
    sad: { mode: 'hold', timeoutMs: 0 },
    special_dance: { mode: 'hold', timeoutMs: 0 },
    default: { mode: 'hold', timeoutMs: 0 },
    jump: { mode: 'once', timeoutMs: 2600 },
    nod: { mode: 'once', timeoutMs: 3200 },
    shake: { mode: 'once', timeoutMs: 3800 },
    stomp: { mode: 'once', timeoutMs: 2800 },
    point: { mode: 'once', timeoutMs: 4500 },
    stretch: { mode: 'once', timeoutMs: 5200 },
    idle_sway: { mode: 'once', timeoutMs: 2200 },
    idle_look: { mode: 'once', timeoutMs: 1800 },
    wave: { mode: 'timed', timeoutMs: 8000 },
    wave_left: { mode: 'timed', timeoutMs: 8000 },
    wave_right: { mode: 'timed', timeoutMs: 8000 },
    celebrate: { mode: 'timed', timeoutMs: 9000 },
    bounce: { mode: 'timed', timeoutMs: 9000 },
    panic: { mode: 'timed', timeoutMs: 2000 },
    clap: { mode: 'timed', timeoutMs: 9000 },
    confused: { mode: 'timed', timeoutMs: 8000 },
    chirp: { mode: 'timed', timeoutMs: 4000 },
    harmonic: { mode: 'timed', timeoutMs: 7000 },
  };

  const emoteTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggerAnimRef = useRef<(name: string) => void>(() => { });
  // --- END CONFIGURATION ---

  const [keyframes, setKeyframes
  ] = useState<Keyframe[]>([
    {
      "id": "default_pose",
      "name": "Default Pose",
      "state": {
        "body": {
          "x": 295.1,
          "y": 393.4
        },
        "back_y": [
          0,
          0,
          0
        ],
        "feet": {
          "leg1": {
            "x": 80,
            "y": 570,
            "a": 0
          },
          "leg2": {
            "x": 178,
            "y": 570,
            "a": 0
          },
          "leg3": {
            "x": 487,
            "y": 570,
            "a": 0
          }
        },
        "hands": {
          "hand1": {
            "x": 173.5,
            "y": 414.7,
            "a": 0
          },
          "hand2": {
            "x": 589.6,
            "y": 120.6,
            "a": 0
          }
        }
      }
    },
    {
      "id": "pos0",
      "name": "pos 0",
      "state": {
        "body": {
          "x": 240.0,
          "y": 380.0,
          "tilt": 2.5
        },
        "back_y": [
          0,
          0,
          0
        ],
        "feet": {
          "leg1": {
            "x": 25,
            "y": 570,
            "a": 0
          },
          "leg2": {
            "x": 123,
            "y": 570,
            "a": 0
          },
          "leg3": {
            "x": 432,
            "y": 570,
            "a": 0
          }
        },
        "hands": {
          "hand1": {
            "x": 126.3,
            "y": 400.5,
            "a": -130
          },
          "hand2": {
            "x": 380.6,
            "y": 152.2,
            "a": -105
          }
        }
      }
    },
    {
      "id": "pos1",
      "name": "pos 1",
      "state": {
        "body": {
          "x": 262.0,
          "y": 395.0,
          "tilt": 1.5
        },
        "back_y": [
          0,
          0,
          0
        ],
        "feet": {
          "leg1": {
            "x": 25,
            "y": 570,
            "a": 0
          },
          "leg2": {
            "x": 123,
            "y": 570,
            "a": 0
          },
          "leg3": {
            "x": 487,
            "y": 530,
            "a": 10
          }
        },
        "hands": {
          "hand1": {
            "x": 168.8,
            "y": 399.0,
            "a": 230
          },
          "hand2": {
            "x": 423.2,
            "y": 150.6,
            "a": -105
          }
        }
      }
    },
    {
      "id": "pos2",
      "name": "pos 2",
      "state": {
        "body": {
          "x": 284.0,
          "y": 410.0,
          "tilt": 0.0
        },
        "back_y": [
          0,
          0,
          0
        ],
        "feet": {
          "leg1": {
            "x": 25,
            "y": 570,
            "a": 0
          },
          "leg2": {
            "x": 178,
            "y": 530,
            "a": 5
          },
          "leg3": {
            "x": 542,
            "y": 570,
            "a": 0
          }
        },
        "hands": {
          "hand1": {
            "x": 208.7,
            "y": 398.2,
            "a": 65
          },
          "hand2": {
            "x": 459.5,
            "y": 147.3,
            "a": -170
          }
        }
      }
    },
    {
      "id": "pos3",
      "name": "pos 3",
      "state": {
        "body": {
          "x": 306.0,
          "y": 410.0,
          "tilt": -1.0
        },
        "back_y": [
          0,
          0,
          0
        ],
        "feet": {
          "leg1": {
            "x": 80,
            "y": 530,
            "a": -5
          },
          "leg2": {
            "x": 233,
            "y": 570,
            "a": 0
          },
          "leg3": {
            "x": 542,
            "y": 570,
            "a": 0
          }
        },
        "hands": {
          "hand1": {
            "x": 273.2,
            "y": 412.9,
            "a": 55
          },
          "hand2": {
            "x": 475.0,
            "y": 146.0,
            "a": -250
          }
        }
      }
    },
    {
      "id": "pos4",
      "name": "pos 4",
      "state": {
        "body": {
          "x": 328.0,
          "y": 395.0,
          "tilt": -2.0
        },
        "back_y": [
          0,
          0,
          0
        ],
        "feet": {
          "leg1": {
            "x": 135,
            "y": 570,
            "a": 0
          },
          "leg2": {
            "x": 233,
            "y": 570,
            "a": 0
          },
          "leg3": {
            "x": 542,
            "y": 570,
            "a": 0
          }
        },
        "hands": {
          "hand1": {
            "x": 347.7,
            "y": 439.3,
            "a": -30
          },
          "hand2": {
            "x": 564.8,
            "y": 156.6,
            "a": -345
          }
        }
      }
    },
    {
      "id": "pos5",
      "name": "pos 5",
      "state": {
        "body": {
          "x": 350.0,
          "y": 380.0,
          "tilt": -2.5
        },
        "back_y": [
          0,
          0,
          0
        ],
        "feet": {
          "leg1": {
            "x": 135,
            "y": 570,
            "a": 0
          },
          "leg2": {
            "x": 233,
            "y": 570,
            "a": 0
          },
          "leg3": {
            "x": 542,
            "y": 570,
            "a": 0
          }
        },
        "hands": {
          "hand1": {
            "x": 370.5,
            "y": 442.9,
            "a": -30
          },
          "hand2": {
            "x": 587.6,
            "y": 160.3,
            "a": 15
          }
        }
      }
    },
    {
      "id": "pos6",
      "name": "pos 6",
      "state": {
        "body": {
          "x": 328.0,
          "y": 395.0,
          "tilt": -1.0
        },
        "back_y": [
          0,
          0,
          0
        ],
        "feet": {
          "leg1": {
            "x": 80,
            "y": 530,
            "a": -10
          },
          "leg2": {
            "x": 233,
            "y": 570,
            "a": 0
          },
          "leg3": {
            "x": 542,
            "y": 570,
            "a": 0
          }
        },
        "hands": {
          "hand1": {
            "x": 347.7,
            "y": 439.3,
            "a": -30
          },
          "hand2": {
            "x": 564.8,
            "y": 156.6,
            "a": -345
          }
        }
      }
    },
    {
      "id": "pos7",
      "name": "pos 7",
      "state": {
        "body": {
          "x": 306.0,
          "y": 410.0,
          "tilt": 0.0
        },
        "back_y": [
          0,
          0,
          0
        ],
        "feet": {
          "leg1": {
            "x": 25,
            "y": 570,
            "a": 0
          },
          "leg2": {
            "x": 178,
            "y": 530,
            "a": -5
          },
          "leg3": {
            "x": 542,
            "y": 570,
            "a": 0
          }
        },
        "hands": {
          "hand1": {
            "x": 273.2,
            "y": 412.9,
            "a": 55
          },
          "hand2": {
            "x": 475.0,
            "y": 146.0,
            "a": -250
          }
        }
      }
    },
    {
      "id": "pos8",
      "name": "pos 8",
      "state": {
        "body": {
          "x": 284.0,
          "y": 410.0,
          "tilt": 1.0
        },
        "back_y": [
          0,
          0,
          0
        ],
        "feet": {
          "leg1": {
            "x": 25,
            "y": 570,
            "a": 0
          },
          "leg2": {
            "x": 123,
            "y": 570,
            "a": 0
          },
          "leg3": {
            "x": 487,
            "y": 530,
            "a": 5
          }
        },
        "hands": {
          "hand1": {
            "x": 208.7,
            "y": 398.2,
            "a": 65
          },
          "hand2": {
            "x": 459.5,
            "y": 147.3,
            "a": -170
          }
        }
      }
    },
    {
      "id": "pos9",
      "name": "pos 9",
      "state": {
        "body": {
          "x": 262.0,
          "y": 395.0,
          "tilt": 2.0
        },
        "back_y": [
          0,
          0,
          0
        ],
        "feet": {
          "leg1": {
            "x": 25,
            "y": 570,
            "a": 0
          },
          "leg2": {
            "x": 123,
            "y": 570,
            "a": 0
          },
          "leg3": {
            "x": 432,
            "y": 570,
            "a": 0
          }
        },
        "hands": {
          "hand1": {
            "x": 168.8, "y": 399.0, "a": 230
          },
          "hand2": {
            "x": 423.2, "y": 150.6, "a": -105
          }
        }
      }
    }
  ]);
  const [sequences, setSequences] = useState<AnimationSequence[]>([
    {
      "id": "special_dance",
      "name": "special dance",
      "loop": true,
      "breathing": true,
      "frames": [
        { "keyframeId": "pos1", "duration": 0.2, "type": "transition" },
        { "keyframeId": "pos2", "duration": 0.2, "type": "transition" },
        { "keyframeId": "pos3", "duration": 0.2, "type": "transition" },
        { "keyframeId": "pos4", "duration": 0.2, "type": "transition" },
        { "keyframeId": "pos5", "duration": 0.2, "type": "transition" },
        { "keyframeId": "pos6", "duration": 0.2, "type": "transition" },
        { "keyframeId": "pos7", "duration": 0.2, "type": "transition" },
        { "keyframeId": "pos8", "duration": 0.2, "type": "transition" },
        { "keyframeId": "pos9", "duration": 0.2, "type": "transition" },
        { "keyframeId": "pos0", "duration": 0.2, "type": "transition" }
      ]
    }
  ]);
  const sequencesRef = useRef<AnimationSequence[]>([]);
  const keyframesRef = useRef<Keyframe[]>([]);
  const customAnimsRef = useRef<Record<string, string>>({});
  const [isPlayingSequence, setIsPlayingSequence] = useState(false);

  const [posePromptOpen, setPosePromptOpen] = useState(false);
  const [sequencePromptOpen, setSequencePromptOpen] = useState(false);
  const [promptInput, setPromptInput] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Core Animation State (Mutable for 60fps performance)
  const state = useRef({
    body: { x: 295.1, y: 393.4, tilt: 0 },
    feet: {
      leg1: { x: 80, y: 570, a: 0 },
      leg2: { x: 178, y: 570, a: 0 },
      leg3: { x: 487, y: 570, a: 0 }
    },
    hands: {
      hand1: { x: 173.5, y: 414.7, a: 0 },
      hand2: { x: 589.6, y: 120.6, a: 0 }
    },
    back_y: [0, 0, 0],
    back_y_actual: [0, 0, 0],
    sequenceBreathing: false,
    isFrozen: false,
    isStepping: { leg1: false, leg2: false, leg3: false },
    // Physics spring body
    physics: {
      body: { x: 295.1, y: 393.4, vx: 0, vy: 0 },
      targetY: 393.4,
      mass: 8.0,
      stiffness: 180,
      damping: 12,
      restY: 393.4,
    },
    // Per-limb drag velocity for spring-coast on release
    limbVelocity: {
      leg1: { x: 0, y: 0 }, leg2: { x: 0, y: 0 }, leg3: { x: 0, y: 0 },
      hand1: { x: 0, y: 0 }, hand2: { x: 0, y: 0 },
    },
    idleTimer: 0,
    isIdling: false,
    rocky: { x: 0, y: 0, vx: 0, vy: 0, grounded: true, airborneTime: 0, fallingAnimTriggered: false, dropsUntilPanic: 2, startupCooldown: 3.0 },
    svgScale: 1,
    svgOffsetX: 0,
    svgOffsetY: 0,
    svgAnchorX: 0,
    svgAnchorY: 0,
    limbInertia: {
      hand1: { lagX: 0, lagY: 0 },
      hand2: { lagX: 0, lagY: 0 },
      leg1:  { lagX: 0, lagY: 0 },
      leg2:  { lagX: 0, lagY: 0 },
      leg3:  { lagX: 0, lagY: 0 },
    },
    limbSpring: {
      hand1: { offX: 0, offY: 0, vx: 0, vy: 0 },
      hand2: { offX: 0, offY: 0, vx: 0, vy: 0 },
      leg1:  { offX: 0, offY: 0, vx: 0, vy: 0 },
      leg2:  { offX: 0, offY: 0, vx: 0, vy: 0 },
      leg3:  { offX: 0, offY: 0, vx: 0, vy: 0 },
    },
    dragVel: { samples: [] as { x: number; y: number; t: number }[] },
    walls: { left: 0, right: 0, top: 0, floor: 0 },
  });

  const activeAnimations = useRef<any[]>([]);
  const proceduralAnimations = useRef<any[]>([]);
  const currentAnimId = useRef(0);





  const stopProceduralAnimations = () => {
    proceduralAnimations.current.forEach(anim => anim.stop());
    proceduralAnimations.current = [];
    state.current.isStepping = { leg1: false, leg2: false, leg3: false };
  };

  const stopAnimations = () => {
    if (emoteTimeoutRef.current) { clearTimeout(emoteTimeoutRef.current); emoteTimeoutRef.current = null; }
    if (idleTimerRef.current) { clearTimeout(idleTimerRef.current); idleTimerRef.current = null; }

    activeAnimations.current.forEach(anim => anim.stop());

    activeAnimations.current = [];
    stopProceduralAnimations();
    // Reset physics spring so interrupted animations don't leave a stuck targetY
    state.current.physics.targetY = state.current.physics.restY;
    state.current.physics.body.vy = 0;
    playingSequenceIdRef.current = null;
  };

  // --- PHYSICS HELPERS ---
  const integratePhysics = (dt: number) => {
    const p = state.current.physics;
    const disp = p.body.y - p.targetY;
    const springF = -p.stiffness * disp;
    const dampF = -p.damping * p.body.vy;
    p.body.vy += ((springF + dampF) / p.mass) * dt;
    p.body.y += p.body.vy * dt;
    state.current.body.y = p.body.y;
  };

  const applyImpulse = (iy: number) => {
    state.current.physics.body.vy += iy;
  };

  const computeBodyTilt = () => {
    const s = state.current;
    const avgFootX = (s.feet.leg1.x + s.feet.leg2.x + s.feet.leg3.x) / 3;
    const offsetX = s.body.x - avgFootX;
    // Max +/-4 degrees, very subtle lean
    const targetTilt = Math.max(-4, Math.min(4, offsetX * 0.04));
    s.body.tilt = (s.body.tilt || 0) + (targetTilt - (s.body.tilt || 0)) * 0.05;
    return s.body.tilt;
  };


  useLayoutEffect(() => {
    const svgScale = Math.min(charW / 1000, charH / 770);
    state.current.svgScale = svgScale;

    const ROCKY_BBOX_SVG = { x: 30, y: 120, w: 560, h: 450 };
    const svgOffsetX = (charW - 1000 * svgScale) / 2;
    const svgOffsetY = charH - 770 * svgScale;
    state.current.svgOffsetX = svgOffsetX;
    state.current.svgOffsetY = svgOffsetY;
    const bx = svgOffsetX + (ROCKY_BBOX_SVG.x + 100) * svgScale;
    const by = svgOffsetY + (ROCKY_BBOX_SVG.y + 200) * svgScale;
    const bw = ROCKY_BBOX_SVG.w * svgScale;
    const bh = ROCKY_BBOX_SVG.h * svgScale;

    const stageW = isFullWindow ? window.innerWidth  : charW;
    const stageH = isFullWindow ? window.innerHeight : charH;
    const anchorX = isFullWindow && fullWindowCorner.includes('right')  ? stageW - charW : 0;
    const anchorY = isFullWindow && fullWindowCorner.includes('bottom') ? stageH - charH : 0;
    state.current.svgAnchorX = anchorX;
    state.current.svgAnchorY = anchorY;

    state.current.walls = {
      left:  -(anchorX + bx) + EDGE_PADDING,
      right:  stageW - (anchorX + bx + bw) - EDGE_PADDING,
      top:   -(anchorY + by) + EDGE_PADDING,
      floor:  stageH - (anchorY + by + bh),
    };
  }, [charW, charH, isFullWindow, fullWindowCorner]);

  const triggerLandingSquash = (impactVy: number) => {
    const kick = Math.min(impactVy * 0.55, 340);
    state.current.physics.body.vy += kick;
    for (const id of LIMB_IDS) {
      state.current.limbSpring[id as keyof typeof state.current.limbSpring].vy -= kick * 0.5;
      state.current.limbInertia[id].lagY += -kick * 0.3;
    }
    if (impactVy > 1200) {
      triggerAnimRef.current('crouch');
      setTimeout(() => triggerAnimRef.current('default'), 500);
    }
  };

  // --- RENDER LOOP ---
  useEffect(() => {
    let frameId: number;
    let lastRockyTime = performance.now();
    const render = () => {
      if (!svgRef.current) return;

      const s = state.current;
      const now = performance.now();
      const time = now / 1000;

      // Physics integration (Verlet spring)
      const dt = 1 / 60;
      integratePhysics(dt);

      // --- Rocky physics integrator ---
      const rockyDt = Math.min((now - lastRockyTime) / 1000, 1 / 30);
      lastRockyTime = now;
      const r = s.rocky;
      const w = s.walls;

      if (r.startupCooldown > 0) r.startupCooldown -= rockyDt;

      const isLimbDrag = dragRef.current.isDragging &&
        dragRef.current.part !== null &&
        dragRef.current.part !== 'body' &&
        dragRef.current.part !== 'back_elements';
      const isBodyDrag = dragRef.current.isDragging && !isLimbDrag;

      // Gravity applies whenever airborne, including during limb drag (pendulum hang)
      if (!r.grounded && !isBodyDrag) {
        r.vy += GRAVITY * gravityScaleRef.current * rockyDt;
      }

      // During limb drag: horizontal air drag dampens the pendulum swing so it feels heavy.
      // No vertical drag - gravity must remain the dominant vertical force.
      if (isLimbDrag && !r.grounded) {
        r.vx -= r.vx * 2.2 * rockyDt;
      }

      // Airborne tracking and panic - suppressed while any drag is active
      if (isBodyDrag || isLimbDrag) {
        r.airborneTime = 0;
        r.fallingAnimTriggered = false;
        s.idleTimer = 0;
      } else if (!r.grounded) {
        r.airborneTime += rockyDt;
        s.idleTimer = 0;
        if (r.airborneTime > 1.2 && !r.fallingAnimTriggered && r.startupCooldown <= 0) {
          r.fallingAnimTriggered = true;
          r.dropsUntilPanic--;
          if (r.dropsUntilPanic <= 0) {
            triggerAnimRef.current('panic');
            r.dropsUntilPanic = 2 + Math.floor(Math.random() * 2);
          }
        }
      }

      // Integrate position - body drag anchors directly to cursor, everything else integrates freely
      if (!isBodyDrag) {
        r.x += r.vx * rockyDt;
        r.y += r.vy * rockyDt;

        let impact = 0;
        if (r.x < w.left) {
          const hv = Math.abs(r.vx);
          r.x = w.left; r.vx = hv * WALL_REST; r.vy *= 0.78;
          if (hv > 50) {
            const k = Math.min(hv * 0.50, 260);
            s.limbSpring.leg1.vx += k; s.limbSpring.leg2.vx += k; s.limbSpring.hand1.vx += k;
          }
        }
        if (r.x > w.right) {
          const hv = Math.abs(r.vx);
          r.x = w.right; r.vx = -hv * WALL_REST; r.vy *= 0.78;
          if (hv > 50) {
            const k = Math.min(hv * 0.50, 260);
            s.limbSpring.leg3.vx -= k; s.limbSpring.hand2.vx -= k;
          }
        }
        if (r.y < w.top) {
          const hv = Math.abs(r.vy);
          r.y = w.top; r.vy = hv * WALL_REST; r.vx *= 0.78;
          if (hv > 50) {
            const k = Math.min(hv * 0.40, 200);
            for (const id of LIMB_IDS) s.limbSpring[id].vy += k;
          }
        }
        if (r.y > w.floor) {
          impact = r.vy;
          r.y = w.floor;
          r.vy = -r.vy * FLOOR_REST;
          r.vx *= FLOOR_FRIC;
          if (Math.abs(r.vy) < STOP_V && Math.abs(r.vx) < STOP_V) {
            r.vy = 0; r.vx = 0;
            if (!r.grounded) {
              r.grounded = true;
              const wasPanicking = r.fallingAnimTriggered;
              r.fallingAnimTriggered = false;
              window.electronAPI?.saveRockyPosition?.(r.x, r.y);
              if (wasPanicking) triggerAnimRef.current('default');
            }
          }
        }
        if (r.y < w.floor - 1) r.grounded = false;

        if (impact > LANDING_THRESHOLD) triggerLandingSquash(impact);

        // Pendulum rope constraint: body hangs from cursor via the grabbed limb.
        // Runs after wall checks - must re-clamp to walls after correction.
        if (isLimbDrag && dragRef.current.part) {
          const svgScale = s.svgScale;
          // Full-window mode shifts the SVG to a corner inside the stage; include that anchor.
          const originX = s.svgAnchorX + s.svgOffsetX;
          const originY = s.svgAnchorY + s.svgOffsetY;
          const limbId = dragRef.current.part.replace('_foot', '');
          const limb = [...RIG.legs, ...RIG.hands].find(l => l.id === limbId);
          if (limb) {
            const thighSvgX = s.body.x + (limb.thighPivot.x - RIG.body.pivot.x);
            const thighSvgY = s.body.y + (limb.thighPivot.y - RIG.body.pivot.y);
            const thighScrX = originX + (thighSvgX + 100) * svgScale + r.x;
            const thighScrY = originY + (thighSvgY + 200) * svgScale + r.y;

            const cx = dragRef.current.limbDragCursorX;
            const cy = dragRef.current.limbDragCursorY;
            const ddx = thighScrX - cx;
            const ddy = thighScrY - cy;
            const dist = Math.hypot(ddx, ddy);
            const maxReach_px = (limb.L1 + limb.L2 - 1) * svgScale;

            if (dist > maxReach_px && dist > 0.001) {
              const nx = ddx / dist;
              const ny = ddy / dist;

              // Capped position correction: Rocky glides toward cursor, not teleports.
              // 22px/frame max = ~1320px/s at 60fps - enough to counteract gravity.
              const correction = Math.min(dist - maxReach_px, 22);
              r.x -= nx * correction;
              r.y -= ny * correction;

              // Absorb outward velocity. No restitution - rope is rope, not elastic.
              const vn2 = r.vx * nx + r.vy * ny;
              if (vn2 > 0) {
                r.vx -= vn2 * nx;
                r.vy -= vn2 * ny;
              }
            }

            // Clamp to wall bounds: re-enforce here since constraint ran after wall checks.
            if (r.x < w.left)  { r.x = w.left;  if (r.vx < 0) r.vx = 0; }
            if (r.x > w.right) { r.x = w.right; if (r.vx > 0) r.vx = 0; }
            if (r.y < w.top)   { r.y = w.top;   if (r.vy < 0) r.vy = 0; }
            if (r.y > w.floor) {
              r.y = w.floor;
              if (!r.grounded) { r.grounded = true; r.vy = 0; r.vx = 0; }
            }
            if (r.y < w.floor - 1) r.grounded = false;
          }
        }
      }

      // Limb inertia lag update
      for (const id of LIMB_IDS) {
        const li = s.limbInertia[id];
        li.lagX += (-r.vx * LIMB_INERTIA - li.lagX) * LIMB_RECOVERY * rockyDt;
        li.lagY += (-r.vy * LIMB_INERTIA - li.lagY) * LIMB_RECOVERY * rockyDt;
      }

      // Limb spring: wall-impact bounce + gravity hang during airborne limb drag
      // offX/offY are in SVG units, added directly to IK target
      {
        const draggedLimbId = isLimbDrag ? dragRef.current.part!.replace('_foot', '') : null;
        const isAirborneLimbDrag = draggedLimbId !== null && !r.grounded;
        // Per-limb hang depth (SVG units) - hand2 droops most since it normally points up
        const HANG_Y: Record<string, number> = { hand1: 90, hand2: 130, leg1: 60, leg2: 55, leg3: 50 };
        const SP_K:   Record<string, number> = { hand1: 9,  hand2: 6,  leg1: 14, leg2: 12, leg3: 10 };
        const SP_D:   Record<string, number> = { hand1: 3.5, hand2: 2.5, leg1: 4.5, leg2: 4.0, leg3: 3.5 };
        for (const id of LIMB_IDS) {
          const ls = s.limbSpring[id];
          const tgtY = (isAirborneLimbDrag && id !== draggedLimbId) || isBodyDrag ? HANG_Y[id] : 0;
          const K = SP_K[id]; const D = SP_D[id];
          ls.vx += -K * ls.offX * rockyDt;
          ls.vy += K * (tgtY - ls.offY) * rockyDt;
          ls.vx -= ls.vx * D * rockyDt;
          ls.vy -= ls.vy * D * rockyDt;
          ls.offX += ls.vx * rockyDt;
          ls.offY += ls.vy * rockyDt;
        }
        // Pendulum sway: when body swings horizontally during limb drag, non-dragged limbs trail behind
        if (isLimbDrag && Math.abs(r.vx) > 60) {
          const sway = Math.min(Math.abs(r.vx) * 0.20, 80) * rockyDt;
          const swaySign = Math.sign(r.vx);
          for (const id of LIMB_IDS) {
            if (id !== draggedLimbId) s.limbSpring[id].vx -= swaySign * sway;
          }
        }
      }

      // Continuous wall-press deformation during any drag
      // Rocky is clamped to the wall; drive nearby limb springs away from it
      if (dragRef.current.isDragging) {
        const PRESS_F = 220;
        if (r.x <= w.left + 3) {
          s.limbSpring.leg1.vx += PRESS_F * rockyDt;
          s.limbSpring.leg2.vx += PRESS_F * rockyDt;
          s.limbSpring.hand1.vx += PRESS_F * rockyDt;
        }
        if (r.x >= w.right - 3) {
          s.limbSpring.leg3.vx -= PRESS_F * rockyDt;
          s.limbSpring.hand2.vx -= PRESS_F * rockyDt;
        }
        if (r.y <= w.top + 3) {
          for (const id of LIMB_IDS) s.limbSpring[id].vy += PRESS_F * 0.65 * rockyDt;
        }
      }

      // Apply rocky offset to stage div
      if (stageRef.current) {
        stageRef.current.style.transform =
          `translate3d(${r.x.toFixed(2)}px, ${r.y.toFixed(2)}px, 0)`;
      }

      // Idle Breathing (layered noise replaces single sine)
      const breatheActive = !s.isFrozen && ((!isStudioMode) || (isPlayingSequence && s.sequenceBreathing));
      if (breatheActive) {
        const breatheBase = noise1D(time * 0.5) * 4;   // +/-4px heave
        const micro = noise1D(time * 3.7 + 100) * 1.0; // +/-1px tremor
        const sway = noise1D(time * 0.2 + 200) * 2;   // subtle sway for tilt
        // In SVG, positive Y = downward; breathing oscillates around rest height
        s.physics.targetY = s.physics.restY + breatheBase + micro;
        // Micro body-tilt sway - only if not playing a sequence (which might have its own tilt)
        if (!isPlayingSequence) {
          s.body.tilt = (s.body.tilt || 0) + (sway * 0.2 - (s.body.tilt || 0)) * 0.03;
        }
        // Gentle hand drift when truly idle
        if (!isPlayingSequence && !dragRef.current.isDragging) {
          s.hands.hand1.x += (s.body.x - 120 + noise1D(time * 0.4 + 300) * 4 - s.hands.hand1.x) * 0.03;
          s.hands.hand2.x += (s.body.x + 290 + noise1D(time * 0.35 + 400) * 4 - s.hands.hand2.x) * 0.03;
        }
      } else {
        // When not breathing, keep spring target at rest
        s.physics.targetY = s.physics.restY;
      }
      const currentBodyY = s.body.y;

      // Body tilt: foot-based when idle, drag-reactive when dragging
      let tilt: number;
      if (isPlayingSequence) {
        tilt = s.body.tilt || 0;
      } else {
        tilt = computeBodyTilt();
        if (dragRef.current.isDragging) {
          const dragPart = dragRef.current.part;
          if (dragPart === 'body' || dragPart === 'back_elements') {
            const samp = s.dragVel.samples;
            if (samp.length >= 2) {
              const n = samp.length;
              const instVx = (samp[n-1].x - samp[n-2].x) / ((samp[n-1].t - samp[n-2].t) / 1000 + 0.001);
              const dragTiltTarget = Math.max(-22, Math.min(22, instVx * 0.005));
              s.body.tilt = tilt + (dragTiltTarget - tilt) * 0.20;
              tilt = s.body.tilt;
            }
          } else if (dragPart?.endsWith('_foot')) {
            const dragLimbId = dragPart.replace('_foot', '');
            const isHandLimb = dragLimbId.startsWith('hand');
            const ep = isHandLimb
              ? s.hands[dragLimbId as keyof typeof s.hands]
              : s.feet[dragLimbId as keyof typeof s.feet];
            const leanTarget = Math.max(-26, Math.min(26, (ep.x - s.body.x) * 0.032));
            s.body.tilt = tilt + (leanTarget - tilt) * 0.11;
            tilt = s.body.tilt;
          }
        }
      }
      const rootGroup = svgRef.current.getElementById('rootGroup');
      if (rootGroup) {
        // rootGroup is translated to (body.x, body.y), then rotated around the body pivot
        // The pivot in local coords is (0, 0) since translate already places us there
        rootGroup.setAttribute('transform',
          `translate(${s.body.x}, ${currentBodyY}) rotate(${tilt.toFixed(3)})`
        );
      }



      // Smart Rubber Breathing Algorithm for Back Elements
      let bOff1 = 0, bOff2 = 0, bOff3 = 0;

      const currentEmote = playingSequenceIdRef.current;
      let breatheSpeed = BACK_BREATHING.speed;
      let amplitude = BACK_BREATHING.amplitude;
      let isMouthLike = false;
      let freezeToZero = false;

      if (s.isFrozen || currentEmote === 'freeze' || currentEmote === 'sleep') {
        freezeToZero = true;
      } else if (currentEmote === 'chirp') {
        isMouthLike = true;
        breatheSpeed = 12.0;
        amplitude = 2.0;
      } else if (currentEmote === 'harmonic') {
        isMouthLike = true;
        breatheSpeed = 8.0;
        amplitude = 1.8;
      } else if (currentEmote === 'panic' || currentEmote === 'celebrate' || currentEmote === 'dance' || currentEmote === 'bounce' || currentEmote === 'special_dance') {
        breatheSpeed = 3.0;
        amplitude = 1.5;
      } else if (currentEmote === 'sad') {
        breatheSpeed = 0.6;
        amplitude = 0.5;
      }

      let target1: number, target2: number, target3: number;

      if (freezeToZero) {
        target1 = target2 = target3 = 0;
      } else if (isMouthLike) {
        // Rhythmic pulse with decay for chirp, overlapping waves for harmonic
        const t = time * breatheSpeed;
        const pulse = Math.sin(t * Math.PI * 2) * 0.5 + 0.5;
        target1 = -10 - noise1D(t + 0) * 12 * amplitude * pulse;
        target2 = -10 - noise1D(t + 33.7) * 12 * amplitude * pulse;
        target3 = -10 - noise1D(t + 77.3) * 12 * amplitude * pulse;
      } else {
        // Three independent noise streams with different speeds = organic drifting
        target1 = -8 - noise1D(time * breatheSpeed + 11.1) * 10 * amplitude;
        target2 = -8 - noise1D(time * breatheSpeed * 0.79 + 44.4) * 10 * amplitude;
        target3 = -8 - noise1D(time * breatheSpeed * 1.23 + 77.7) * 10 * amplitude;
      }

      // Enforce the rubber constraint using BACK_BREATHING.heightDiff
      let f1 = target1;
      let f2 = Math.max(f1 - BACK_BREATHING.heightDiff, Math.min(f1 + BACK_BREATHING.heightDiff, target2));
      let f3 = Math.max(f2 - BACK_BREATHING.heightDiff, Math.min(f2 + BACK_BREATHING.heightDiff, target3));

      bOff1 = f1; bOff2 = f2; bOff3 = f3;

      const lerpSpeed = (currentEmote === 'panic') ? 0.25 : BACK_BREATHING.lerp;
      s.back_y_actual[0] += (s.back_y[0] - s.back_y_actual[0]) * lerpSpeed;
      s.back_y_actual[1] += (s.back_y[1] - s.back_y_actual[1]) * (lerpSpeed * 0.6);
      s.back_y_actual[2] += (s.back_y[2] - s.back_y_actual[2]) * (lerpSpeed * 1.6);


      const b1 = s.back_y_actual[0] + bOff1;
      const b2 = s.back_y_actual[1] + bOff2;
      const b3 = s.back_y_actual[2] + bOff3;

      svgRef.current.getElementById('back_element_1')?.setAttribute('transform', `translate(0, ${b1})`);
      svgRef.current.getElementById('back_element_2')?.setAttribute('transform', `translate(0, ${b2})`);
      svgRef.current.getElementById('back_element_3')?.setAttribute('transform', `translate(0, ${b3})`);

      // Update Legs and Hands (Inverse Kinematics)
      [...RIG.legs, ...RIG.hands].forEach(limb => {
        const thighAbsX = s.body.x + (limb.thighPivot.x - RIG.body.pivot.x);
        const thighAbsY = currentBodyY + (limb.thighPivot.y - RIG.body.pivot.y);

        const isHand = limb.id.startsWith('hand');
        const target = isHand ? s.hands[limb.id as keyof typeof s.hands] : s.feet[limb.id as keyof typeof s.feet];

        // Hands sway slightly with body breathing (physics body displacement from rest)
        const handSway = isHand ? (currentBodyY - 393.4) * 0.3 : 0;
        const li = s.limbInertia[limb.id as keyof typeof s.limbInertia];
        const lagSvgX = li ? li.lagX / s.svgScale : 0;
        const lagSvgY = li ? li.lagY / s.svgScale : 0;
        const ls = s.limbSpring[limb.id as keyof typeof s.limbSpring];
        const { theta1, theta2 } = solve2BoneIK(
          thighAbsX, thighAbsY,
          target.x + lagSvgX + (ls ? ls.offX : 0),
          target.y + handSway + lagSvgY + (ls ? ls.offY : 0),
          limb.L1, limb.L2,
          limb.flip
        );

        const rot1 = (theta1 - limb.theta1_rest) * (180 / Math.PI);
        const rot2 = (theta2 - limb.theta2_rest) * (180 / Math.PI) + target.a;

        const mainEl = svgRef.current.getElementById(`${limb.id}_main`);
        const footEl = svgRef.current.getElementById(`${limb.id}_foot`);

        if (mainEl) mainEl.setAttribute('transform', `rotate(${rot1.toFixed(3)})`);
        if (footEl) footEl.setAttribute('transform', `rotate(${rot2.toFixed(3)})`);
      });

      // Procedural Walk Cycle Logic
      if (!dragRef.current.isDragging && !isStudioMode && !isPlayingSequence) {
        let anyStepping = false;

        RIG.legs.forEach((leg, index) => {
          const idealX = s.body.x + (leg.footEnd.x - RIG.body.pivot.x);
          const currentFootX = s.feet[leg.id as keyof typeof s.feet].x;
          const dist = Math.abs(currentFootX - idealX);

          const isAnyOtherLegStepping = RIG.legs.some(l => l.id !== leg.id && s.isStepping[l.id as keyof typeof s.isStepping]);

          if (s.isStepping[leg.id as keyof typeof s.isStepping]) {
            anyStepping = true;
          }

          if (dist > 80 && !s.isStepping[leg.id as keyof typeof s.isStepping] && !isAnyOtherLegStepping) {
            s.isStepping[leg.id as keyof typeof s.isStepping] = true;
            anyStepping = true;
            const direction = Math.sign(idealX - currentFootX);
            const targetX = idealX + direction * 50;
            const startX = currentFootX;
            const floorY = leg.footEnd.y;

            // Swing corresponding hand
            const handId = index === 0 ? 'hand1' : (index === 2 ? 'hand2' : null);
            let handStartX = 0;
            let handTargetX = 0;
            let handStartY = 0;

            if (handId) {
              handStartX = s.hands[handId].x;
              const handIdealX = s.body.x + (handId === 'hand1' ? -120 : 290);
              // Hand swings oppositely
              handTargetX = handIdealX - (direction * 70);
              handStartY = s.hands[handId].y;
            }

            const anim = animate(0, 1, {
              duration: 0.25,
              ease: "easeOut",
              onUpdate: (t) => {
                const x = startX + (targetX - startX) * t;
                const y = floorY - Math.sin(t * Math.PI) * 40; // Step arc
                s.feet[leg.id as keyof typeof s.feet] = { x, y: y, a: s.feet[leg.id as keyof typeof s.feet].a };

                if (handId) {
                  // Calculate hand swaying
                  const swayTargetX = handStartX + (handTargetX - handStartX) * t;
                  const handIdealX = s.body.x + (handId === 'hand1' ? -120 : 290);
                  s.hands[handId].x = swayTargetX * 0.5 + handIdealX * 0.5;
                  s.hands[handId].y = handStartY - Math.sin(t * Math.PI) * 15;
                }
              },
              onComplete: () => {
                s.isStepping[leg.id as keyof typeof s.isStepping] = false;
                proceduralAnimations.current = proceduralAnimations.current.filter(a => a !== anim);
              }
            });
            proceduralAnimations.current.push(anim);
          }
        });

        // Physics-driven body bob: update spring target, not body.y directly
        // Always use s.physics.restY (not hardcoded 393.4) so sleep/crouch can redefine the floor
        if (anyStepping) {
          let maxLift = 0;
          RIG.legs.forEach(leg => {
            const lift = leg.footEnd.y - s.feet[leg.id as keyof typeof s.feet].y;
            if (lift > maxLift) maxLift = lift;
          });
          s.physics.targetY = s.physics.restY + maxLift * 0.3;
        } else if (!breatheActive) {
          s.physics.targetY = s.physics.restY;
        }


        // Also keep hands near body when not stepping (skip if noise breathing handles drift)
        if (!s.isStepping.leg1 && !breatheActive) {
          const hand1IdealX = s.body.x - 120;
          s.hands.hand1.x += (hand1IdealX - s.hands.hand1.x) * 0.1;
        }
        if (!s.isStepping.leg3 && !breatheActive) {
          const hand2IdealX = s.body.x + 290;
          s.hands.hand2.x += (hand2IdealX - s.hands.hand2.x) * 0.1;
        }

        // Micro-idles: random subtle movement after 4-8s of inactivity (grounded only)
        if (!s.isIdling && !isPlayingSequence && !dragRef.current.isDragging && s.rocky.grounded) {
          s.idleTimer += dt;
          if (s.idleTimer > 4 + (noise1D(time * 0.01 + 999) * 0.5 + 0.5) * 4) {
            s.isIdling = true;
            s.idleTimer = 0;
            const idleType = Math.floor((noise1D(time * 5 + 77) * 0.5 + 0.5) * 3);
            if (idleType === 0) {
              applyImpulse(-25); // subtle upward hop (look up)
              setTimeout(() => { s.isIdling = false; }, 1200);
            } else if (idleType === 1) {
              const origY = s.hands.hand1.y;
              animate(origY, origY - 22, {
                duration: 0.2, ease: 'easeOut',
                onUpdate: (v: number) => { s.hands.hand1.y = v; },
                onComplete: () => {
                  animate(origY - 22, origY, {
                    duration: 0.35, ease: 'easeIn',
                    onUpdate: (v: number) => { s.hands.hand1.y = v; },
                    onComplete: () => { s.isIdling = false; }
                  });
                }
              });
            } else {
              applyImpulse(20); // weight settle downward
              setTimeout(() => { s.isIdling = false; }, 1000);
            }
          }
        }

      }
      
      // --- SKIN RENDERING LOGIC ---
      try {
        if (skinData.length > 0 && rootGroup && svgRef.current) {
          const rootCTM = rootGroup.getCTM()!;
          const rootInv = rootCTM.inverse();

          const arrToSVGMatrix = (arr: number[]) => {
            let m = svgRef.current!.createSVGMatrix();
            m.a = arr[0]; m.b = arr[1]; m.c = arr[2]; m.d = arr[3]; m.e = arr[4]; m.f = arr[5];
            return m;
          };

          skinData.forEach(piece => {
            const imgEl = svgRef.current!.getElementById(`skin_${piece.filename}`);
            if (!imgEl) return;

            let M_diff = svgRef.current!.createSVGMatrix(); // Identity
            if (piece.groupId) {
              const groupEl = svgRef.current!.getElementById(piece.groupId);
              if (groupEl) {
                const ctm = groupEl.getCTM()!;
                const currentGroupRel = ctm.multiply(rootInv);
                const asmGroupRel = arrToSVGMatrix(piece.groupMatrixRoot);
                M_diff = currentGroupRel.multiply(asmGroupRel.inverse());
              }
            }
            const M_final_root = arrToSVGMatrix(piece.transform);
            const finalMatrix = M_diff.multiply(M_final_root);
            
            imgEl.setAttribute('transform', `matrix(${finalMatrix.a},${finalMatrix.b},${finalMatrix.c},${finalMatrix.d},${finalMatrix.e},${finalMatrix.f})`);
          });
        }
      } catch (err) {
        console.error("SKIN RENDER ERROR:", err);
      }

      frameId = requestAnimationFrame(render);
    };

    frameId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(frameId);
  }, [isStudioMode, isPlayingSequence, skinData]);

  // Initialize the Idle System
  useEffect(() => {
    const canPlayIdle = () =>
      state.current.rocky.grounded &&
      Math.abs(state.current.rocky.vx) < 8 &&
      Math.abs(state.current.rocky.vy) < 8 &&
      !dragRef.current.isDragging;

    const schedule = () => {
      idleTimerRef.current = setTimeout(() => {
        if (!playingSequenceIdRef.current) {
          if (canPlayIdle()) {
            triggerAnimRef.current(IDLE_POOL[Math.floor(Math.random() * IDLE_POOL.length)]);
            schedule();
          } else {
            idleTimerRef.current = setTimeout(schedule, 500);
          }
        } else {
          schedule();
        }
      }, nextIdleDelay());
    };
    schedule();
    return () => { if (idleTimerRef.current) clearTimeout(idleTimerRef.current); };
  }, []);


  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const part = dragRef.current.part;
      if (!part || isPlayingSequence) return;

      const increment = e.key.toLowerCase() === 'e' ? 5 : e.key.toLowerCase() === 'q' ? -5 : 0;
      if (increment !== 0) {
        if (part === 'leg1_foot') state.current.feet.leg1.a += increment;
        else if (part === 'leg2_foot') state.current.feet.leg2.a += increment;
        else if (part === 'leg3_foot') state.current.feet.leg3.a += increment;
        else if (part === 'hand1_foot') state.current.hands.hand1.a += increment;
        else if (part === 'hand2_foot') state.current.hands.hand2.a += increment;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPlayingSequence]);

  // --- INTERACTION ---
  const getSVGPoint = (e: React.PointerEvent) => {
    if (!svgRef.current) return { x: 0, y: 0 };
    const pt = svgRef.current.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    return pt.matrixTransform(svgRef.current.getScreenCTM()?.inverse());
  };

  const getAbsolutePivot = (partId: string) => {
    const bx = state.current.body.x;
    const by = state.current.body.y;
    if (partId === 'hand1_main') return { x: bx + 235.463, y: by + 228.269 };
    if (partId === 'hand2_main') return { x: bx + 402.1, y: by + 201.3 };

    if (partId === 'hand1_foot') {
      const px = 235.463, py = 228.269;
      const fx = 143.8, fy = 345.9;
      const a = state.current.hands.hand1_main * Math.PI / 180;
      const dx = fx - px, dy = fy - py;
      const rx = dx * Math.cos(a) - dy * Math.sin(a);
      const ry = dx * Math.sin(a) + dy * Math.cos(a);
      return { x: bx + px + rx, y: by + py + ry };
    }
    if (partId === 'hand2_foot') {
      const px = 402.1, py = 201.3;
      const fx = 507.2, fy = 303.7;
      const a = state.current.hands.hand2_main * Math.PI / 180;
      const dx = fx - px, dy = fy - py;
      const rx = dx * Math.cos(a) - dy * Math.sin(a);
      const ry = dx * Math.sin(a) + dy * Math.cos(a);
      return { x: bx + px + rx, y: by + py + ry };
    }
    return { x: bx, y: by };
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    const target = e.target as Element;

    let part = null;
    if (target.closest('#leg1_foot') || target.closest('#leg1_main')) part = 'leg1_foot';
    else if (target.closest('#leg2_foot') || target.closest('#leg2_main')) part = 'leg2_foot';
    else if (target.closest('#leg3_foot') || target.closest('#leg3_main')) part = 'leg3_foot';
    else if (target.closest('#hand1_foot') || target.closest('#hand1_main')) part = 'hand1_foot';
    else if (target.closest('#hand2_foot') || target.closest('#hand2_main')) part = 'hand2_foot';
    else if (target.closest('#body_main')) part = 'body';
    else if (target.closest('#back_elements')) part = 'back_elements';

    if (part) {
      window.electronAPI?.pingActivity?.();

      // Note if Rocky was sleeping before drag interrupts it
      wasAsleepRef.current = playingSequenceIdRef.current === 'sleep';
      if (wasAsleepRef.current) {
        state.current.physics.restY = 393.4;
        state.current.physics.targetY = 393.4;
      }

      stopAnimations();
      aeroDragRef.current = false;
      const pt = getSVGPoint(e);

      dragRef.current.isDragging = true;
      dragRef.current.part = part;
      dragRef.current.lastX = pt.x;
      dragRef.current.lastY = pt.y;
      dragRef.current.lastClientX = e.clientX;
      dragRef.current.lastClientY = e.clientY;

      if (part === 'body' || part === 'back_elements') {
        dragRef.current.grabAnchorX = state.current.rocky.x - e.clientX;
        dragRef.current.grabAnchorY = state.current.rocky.y - e.clientY;
        state.current.dragVel.samples = [{ x: e.clientX, y: e.clientY, t: performance.now() }];
        state.current.rocky.grounded = false;
      } else {
        dragRef.current.limbDragCursorX = e.clientX;
        dragRef.current.limbDragCursorY = e.clientY;
        // Do not force grounded=false here - let the floor check handle it naturally.
        // If Rocky was on the floor, he stays grounded until the constraint lifts him above it.
        // If Rocky was already airborne, grounded is already false.
      }

      target.setPointerCapture(e.pointerId);
      e.stopPropagation();
    }
  };

  const clampTarget = (limbId: string, target: { x: number, y: number }) => {
    const isHand = limbId.startsWith('hand');
    const limb = isHand
      ? RIG.hands.find(l => l.id === limbId)
      : RIG.legs.find(l => l.id === limbId);

    if (!limb) return;
    const thighAbsX = state.current.body.x + (limb.thighPivot.x - RIG.body.pivot.x);
    const thighAbsY = state.current.body.y + (limb.thighPivot.y - RIG.body.pivot.y);
    const maxDist = limb.L1 + limb.L2 - 0.1;
    const dist = Math.hypot(target.x - thighAbsX, target.y - thighAbsY);

    // Clamp IK target so the solver never receives an unreachable point.
    // Body movement is now handled by the pendulum rope constraint in the rAF loop.
    if (dist > maxDist) {
      target.x = thighAbsX + ((target.x - thighAbsX) / dist) * maxDist;
      target.y = thighAbsY + ((target.y - thighAbsY) / dist) * maxDist;
    }
  };


  const handlePointerMove = (e: React.PointerEvent) => {
    if (dragRef.current.isDragging) {
      if (e.clientX < 0 || e.clientX > window.innerWidth || e.clientY < 0 || e.clientY > window.innerHeight) {
        handlePointerUp();
        return;
      }
      const pt = getSVGPoint(e);
      const dx = pt.x - dragRef.current.lastX;
      const dy = pt.y - dragRef.current.lastY;
      const part = dragRef.current.part;

      if (part === 'body') {
        const w = state.current.walls;
        const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
        state.current.rocky.x = clamp(e.clientX + dragRef.current.grabAnchorX, w.left, w.right);
        state.current.rocky.y = clamp(e.clientY + dragRef.current.grabAnchorY, w.top, w.floor);
        state.current.dragVel.samples.push({ x: e.clientX, y: e.clientY, t: performance.now() });
        if (state.current.dragVel.samples.length > 6) state.current.dragVel.samples.shift();
        dragRef.current.lastClientX = e.clientX;
        dragRef.current.lastClientY = e.clientY;

        // Aerodynamic pose: when dragged upward fast, tuck limbs streamlined
        const samp = state.current.dragVel.samples;
        if (samp.length >= 2) {
          const n = samp.length;
          const instVy = (samp[n-1].y - samp[n-2].y) / ((samp[n-1].t - samp[n-2].t) / 1000 + 0.001);
          const goingUp = instVy < -160;
          if (goingUp && !aeroDragRef.current) {
            aeroDragRef.current = true;
            const ls = state.current.limbSpring;
            ls.hand1.vy -= 90; ls.hand2.vy -= 90;
            ls.leg1.vy  += 50; ls.leg2.vy  += 50; ls.leg3.vy += 50;
          } else if (!goingUp && aeroDragRef.current) {
            aeroDragRef.current = false;
          }
        }
      } else if (part === 'back_elements') {
        state.current.back_y[0] = Math.max(-30, Math.min(0, state.current.back_y[0] + dy));
        state.current.back_y[1] = Math.max(-30, Math.min(0, state.current.back_y[1] + dy));
        state.current.back_y[2] = Math.max(-30, Math.min(0, state.current.back_y[2] + dy));
      } else if (part && part.endsWith('_foot')) {
        const limbId = part.replace('_foot', '');
        const isHand = limbId.startsWith('hand');

        const target = isHand
          ? state.current.hands[limbId as keyof typeof state.current.hands]
          : state.current.feet[limbId as keyof typeof state.current.feet];

        // Use screen-space delta divided by svgScale so Rocky's pendulum movement
        // doesn't corrupt the delta (getScreenCTM changes as the body swings).
        const svgScale = state.current.svgScale || 1;
        const sdx = (e.clientX - dragRef.current.lastClientX) / svgScale;
        const sdy = (e.clientY - dragRef.current.lastClientY) / svgScale;

        target.x += sdx;
        target.y += sdy;
        clampTarget(limbId, target);

        dragRef.current.limbDragCursorX = e.clientX;
        dragRef.current.limbDragCursorY = e.clientY;

        const vel = state.current.limbVelocity[limbId as keyof typeof state.current.limbVelocity];
        if (vel) { vel.x = sdx * 60; vel.y = sdy * 60; }
      }

      dragRef.current.lastX = pt.x;
      dragRef.current.lastY = pt.y;
      dragRef.current.lastClientX = e.clientX;
      dragRef.current.lastClientY = e.clientY;
    }
  };

  const handlePointerUp = () => {
    if (!dragRef.current.isDragging) return;
    const part = dragRef.current.part;
    dragRef.current.isDragging = false;
    dragRef.current.part = null;

    aeroDragRef.current = false;

    if (part === 'body') {
      const samples = state.current.dragVel.samples;
      const releaseNow = performance.now();
      const recent = samples.filter(s => releaseNow - s.t < 120);
      if (recent.length >= 2) {
        const f = recent[0], l = recent[recent.length - 1];
        const relDt = (l.t - f.t) / 1000;
        if (relDt > 0.01) {
          state.current.rocky.vx = (l.x - f.x) / relDt;
          state.current.rocky.vy = (l.y - f.y) / relDt;
        }
      }
      state.current.dragVel.samples = [];
      if (!isStudioMode) {
        if (wasAsleepRef.current) {
          wasAsleepRef.current = false;
          triggerAnimRef.current('stretch');
        } else {
          triggerAnimRef.current('default');
        }
      }
      return;
    }

    // Spring-coast: released limb carries momentum briefly before settling
    if (part && part.endsWith('_foot')) {
      const limbId = part.replace('_foot', '');
      const isHand = limbId.startsWith('hand');
      const target = isHand
        ? state.current.hands[limbId as keyof typeof state.current.hands]
        : state.current.feet[limbId as keyof typeof state.current.feet];
      const vel = state.current.limbVelocity[limbId as keyof typeof state.current.limbVelocity];
      // Body already carries its natural pendulum velocity from physics - no explicit throw needed.
      if (vel && (Math.abs(vel.x) > 8 || Math.abs(vel.y) > 8)) {
        let cvx = vel.x * 0.22;
        let cvy = vel.y * 0.22;
        const coast = animate(0, 1, {
          duration: 0.7, ease: 'linear',
          onUpdate: () => {
            cvx *= 0.87; cvy *= 0.87;
            target.x += cvx * (1 / 60);
            target.y += cvy * (1 / 60);
            clampTarget(limbId, target);
          }
        });
        proceduralAnimations.current.push(coast);
      }
    }

    if (!isStudioMode) {
      if (wasAsleepRef.current) {
        wasAsleepRef.current = false;
        triggerAnimRef.current('stretch');
      } else {
        triggerAnimation('default');
      }
    }
  };

  const handleSavePoseClick = () => {
    setPromptInput("");
    setPosePromptOpen(true);
  };

  const handleSavePoseSubmit = () => {
    if (promptInput.trim()) {
      saveKeyframe(promptInput.trim());
    }
    setPosePromptOpen(false);
  };

  const handleNewSequenceClick = () => {
    setPromptInput("");
    setSequencePromptOpen(true);
  };

  const handleNewSequenceSubmit = () => {
    if (promptInput.trim()) {
      setSequences([...sequences, { id: Date.now().toString(), name: promptInput.trim(), loop: false, frames: [] }]);
    }
    setSequencePromptOpen(false);
  };

  const exportData = () => {
    const data = { keyframes, sequences };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'rocky-animations.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const importData = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        if (data.keyframes && data.sequences) {
          setKeyframes(data.keyframes);
          setSequences(data.sequences);
        } else {
          alert("Invalid file format.");
        }
      } catch (err) {
        alert("Error parsing file.");
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // --- STUDIO MODE FUNCTIONS ---
  const saveKeyframe = (name: string) => {
    const s = state.current;
    const newKeyframe: Keyframe = {
      id: Date.now().toString(),
      name: name || `Pose ${keyframes.length + 1}`,
      state: {
        body: { ...s.body },
        back_y: [...s.back_y] as [number, number, number],

        feet: {
          leg1: { ...s.feet.leg1 },
          leg2: { ...s.feet.leg2 },
          leg3: { ...s.feet.leg3 }
        },
        hands: {
          hand1: { ...s.hands.hand1 },
          hand2: { ...s.hands.hand2 }
        }
      }
    };
    setKeyframes([...keyframes, newKeyframe]);
  };

  const normalizeAngle = (current: number, target: number) => {
    let diff = (target - current) % 360;
    if (diff > 180) diff -= 360;
    if (diff < -180) diff += 360;
    return current + diff;
  };

  const applyKeyframe = (kf: Keyframe, duration = 0.3, ease: any = "easeInOut", fromSequence = false) => {
    if (!fromSequence) stopAnimations();
    const s = state.current;

    // Normalize target angles for a smooth short-path animation
    const normalizeA = (current: number, target: number) => {
      let diff = (target - current) % 360;
      if (diff > 180) diff -= 360;
      if (diff < -180) diff += 360;
      return current + diff;
    };

    const anims = [
      animate(s.body.x, kf.state.body.x, { duration, ease, onUpdate: v => s.body.x = v }),
      animate(s.body.y, kf.state.body.y, {
        duration, ease, onUpdate: v => {
          s.body.y = v;
          s.physics.body.y = v;
          s.physics.targetY = v;
          s.physics.restY = v;
        }
      }),
      animate(s.body.tilt, kf.state.body.tilt || 0, { duration, ease, onUpdate: v => s.body.tilt = v }),
      animate(s.back_y[0], kf.state.back_y ? kf.state.back_y[0] : 0, { duration, ease, onUpdate: v => s.back_y[0] = v }),
      animate(s.back_y[1], kf.state.back_y ? kf.state.back_y[1] : 0, { duration, ease, onUpdate: v => s.back_y[1] = v }),
      animate(s.back_y[2], kf.state.back_y ? kf.state.back_y[2] : 0, { duration, ease, onUpdate: v => s.back_y[2] = v }),

      animate(s.feet.leg1.x, kf.state.feet.leg1.x, { duration, ease, onUpdate: v => s.feet.leg1.x = v }),
      animate(s.feet.leg1.y, kf.state.feet.leg1.y, { duration, ease, onUpdate: v => s.feet.leg1.y = v }),
      animate(s.feet.leg1.a, normalizeA(s.feet.leg1.a, kf.state.feet.leg1.a), { duration, ease, onUpdate: v => s.feet.leg1.a = v }),

      animate(s.feet.leg2.x, kf.state.feet.leg2.x, { duration, ease, onUpdate: v => s.feet.leg2.x = v }),
      animate(s.feet.leg2.y, kf.state.feet.leg2.y, { duration, ease, onUpdate: v => s.feet.leg2.y = v }),
      animate(s.feet.leg2.a, normalizeA(s.feet.leg2.a, kf.state.feet.leg2.a), { duration, ease, onUpdate: v => s.feet.leg2.a = v }),

      animate(s.feet.leg3.x, kf.state.feet.leg3.x, { duration, ease, onUpdate: v => s.feet.leg3.x = v }),
      animate(s.feet.leg3.y, kf.state.feet.leg3.y, { duration, ease, onUpdate: v => s.feet.leg3.y = v }),
      animate(s.feet.leg3.a, normalizeA(s.feet.leg3.a, kf.state.feet.leg3.a), { duration, ease, onUpdate: v => s.feet.leg3.a = v }),

      animate(s.hands.hand1.x, kf.state.hands.hand1.x ?? (s.body.x - 121.6), { duration, ease, onUpdate: v => s.hands.hand1.x = v }),
      animate(s.hands.hand1.y, kf.state.hands.hand1.y ?? (414.7 + (s.body.y - 393.4)), { duration, ease, onUpdate: v => s.hands.hand1.y = v }),
      animate(s.hands.hand1.a, normalizeA(s.hands.hand1.a, kf.state.hands.hand1.a || 0), { duration, ease, onUpdate: v => s.hands.hand1.a = v }),

      animate(s.hands.hand2.x, kf.state.hands.hand2.x ?? (s.body.x + 294.5), { duration, ease, onUpdate: v => s.hands.hand2.x = v }),
      animate(s.hands.hand2.y, kf.state.hands.hand2.y ?? (120.6 + (s.body.y - 393.4)), { duration, ease, onUpdate: v => s.hands.hand2.y = v }),
      animate(s.hands.hand2.a, normalizeA(s.hands.hand2.a, kf.state.hands.hand2.a || 0), { duration, ease, onUpdate: v => s.hands.hand2.a = v })
    ];

    activeAnimations.current.push(...anims);
    return Promise.all(anims.map(a => a.finished)).catch(() => { });
  };

  const playSequence = async (seq: AnimationSequence) => {
    // stopAnimations() MUST run first â€” it clears playingSequenceIdRef to null.
    // Setting playingSequenceIdRef after ensures runLoop's guard check passes.
    stopAnimations();
    setIsPlayingSequence(true);
    playingSequenceIdRef.current = seq.id;
    state.current.sequenceBreathing = seq.breathing || false;
    const id = ++currentAnimId.current;

    const runLoop = async () => {
      for (const frame of seq.frames) {
        if (currentAnimId.current !== id || playingSequenceIdRef.current !== seq.id) return;

        // Clear finished animations from the ref continuously so we don't leak memory
        activeAnimations.current = activeAnimations.current.filter(a => a.currentTime !== null);

        const ease = frame.type === 'transition' ? 'linear' : 'easeInOut';

        if (frame.type === 'go to default' || frame.keyframeId === 'default') {
          await resetToDefault(frame.duration, ease, true);
        } else {
          const kf = keyframesRef.current.find(k => k.id === frame.keyframeId);
          if (kf) {
            if (frame.type === 'stay') {
              applyKeyframe(kf, 0, ease, true);
              await new Promise(r => setTimeout(r, frame.duration * 1000));
            } else {
              await applyKeyframe(kf, frame.duration, ease, true);
            }
          }
        }
      }
      if (seq.loop && currentAnimId.current === id && playingSequenceIdRef.current === seq.id) {
        runLoop();
      } else {
        if (currentAnimId.current === id) {
          setIsPlayingSequence(false);
          playingSequenceIdRef.current = null;
        }
      }
    };

    runLoop();
  };

  const stopSequence = () => {
    playingSequenceIdRef.current = null;
    setIsPlayingSequence(false);
    stopAnimations();
  };

  // --- ANIMATIONS ---
  const resetToDefault = (duration = 0.3, ease: any = "easeInOut", fromSequence = false) => {
    if (!fromSequence) stopAnimations();
    const s = state.current;

    // Normalize target angles for a smooth short-path animation
    const normalizeA = (current: number, target: number) => {
      let diff = (target - current) % 360;
      if (diff > 180) diff -= 360;
      if (diff < -180) diff += 360;
      return current + diff;
    };

    const anims = [
      animate(s.body.x, 295.1, { duration, ease, onUpdate: v => s.body.x = v }),
      animate(s.body.y, 393.4, {
        duration, ease, onUpdate: v => {
          s.body.y = v;
          s.physics.body.y = v;
          s.physics.targetY = v;
          s.physics.restY = v;
        }
      }),
      animate(s.body.tilt, 0, { duration, ease, onUpdate: v => s.body.tilt = v }),
      animate(s.back_y[0], 0, { duration, ease, onUpdate: v => s.back_y[0] = v }),
      animate(s.back_y[1], 0, { duration, ease, onUpdate: v => s.back_y[1] = v }),
      animate(s.back_y[2], 0, { duration, ease, onUpdate: v => s.back_y[2] = v }),
    ];
    // Reset physics spring â€” zero velocity so it doesn't oscillate wildly
    s.physics.body.vy = 0;
    s.physics.body.y = s.body.y; // sync from current visual
    s.physics.restY = 393.4;
    s.physics.targetY = 393.4;


    [...RIG.legs, ...RIG.hands].forEach(limb => {
      let idealX;
      let idealY;
      let idealA = 0;

      if (limb.id.startsWith('hand')) {
        if (limb.id === 'hand1') {
          idealX = s.body.x - 118.5;
          idealY = 414.7 + (s.body.y - 393.4);
          idealA = 0;
        } else {
          idealX = s.body.x + 279.4;
          idealY = 141.6 + (s.body.y - 393.4);
          idealA = -155;
        }
        const target = s.hands[limb.id as keyof typeof s.hands];
        anims.push(
          animate(target.x, idealX, { duration, ease, onUpdate: v => target.x = v }),
          animate(target.y, idealY, { duration, ease, onUpdate: v => target.y = v }),
          animate(target.a, normalizeA(target.a, idealA), { duration, ease, onUpdate: v => target.a = v })
        );
      } else {
        idealX = s.body.x + (limb.footEnd.x - RIG.body.pivot.x);
        idealY = 570; // Consistent floor constraint
        const target = s.feet[limb.id as keyof typeof s.feet];
        anims.push(
          animate(target.x, idealX, { duration, ease, onUpdate: v => target.x = v }),
          animate(target.y, idealY, { duration, ease, onUpdate: v => target.y = v }),
          animate(target.a, normalizeA(target.a, idealA), { duration, ease, onUpdate: v => target.a = v })
        );
      }
    });

    activeAnimations.current.push(...anims);
    return Promise.all(anims.map(a => a.finished)).catch(() => { });
  };

  const triggerAnimation = (animName: string) => {
    // Clear auto-return/idle timers before starting new emote
    if (emoteTimeoutRef.current) { clearTimeout(emoteTimeoutRef.current); emoteTimeoutRef.current = null; }
    if (idleTimerRef.current) { clearTimeout(idleTimerRef.current); idleTimerRef.current = null; }

    stopAnimations();
    playingSequenceIdRef.current = animName;
    const id = ++currentAnimId.current;
    const s = state.current;

    if (animName !== 'freeze' && animName !== 'sleep') {
      s.isFrozen = false;
    }

    if (animName === 'default') {
      resetToDefault(ANIM_CONFIG.pretransitionSec, ANIM_CONFIG.ease);

    } else if (animName === 'jump') {
      stopProceduralAnimations();
      resetToDefault(ANIM_CONFIG.pretransitionSec, ANIM_CONFIG.ease);
      setTimeout(() => {
        if (currentAnimId.current !== id) return;
        const animId = id;
        // Phase 1: Deep squash
        s.physics.targetY = s.physics.restY + 70;
        activeAnimations.current.push(
          animate(s.hands.hand1.y, s.hands.hand1.y + 60, { duration: 0.15, ease: 'easeOut', onUpdate: v => s.hands.hand1.y = v }),
          animate(s.hands.hand2.y, s.hands.hand2.y + 60, { duration: 0.15, ease: 'easeOut', onUpdate: v => s.hands.hand2.y = v })
        );
        setTimeout(() => {
          if (currentAnimId.current !== animId) return;
          // Phase 2: Launch
          s.physics.targetY = s.physics.restY - 20;
          applyImpulse(-550);
          const startH1Y = s.hands.hand1.y;
          const startH2Y = s.hands.hand2.y;
          activeAnimations.current.push(
            animate(startH1Y, startH1Y - 250, { duration: 0.25, ease: 'easeOut', onUpdate: v => s.hands.hand1.y = v }),
            animate(startH2Y, startH2Y - 250, { duration: 0.25, ease: 'easeOut', onUpdate: v => s.hands.hand2.y = v }),
            animate(s.feet.leg1.y, s.feet.leg1.y - 100, { duration: 0.2, ease: 'easeOut', onUpdate: v => s.feet.leg1.y = v }),
            animate(s.feet.leg3.y, s.feet.leg3.y - 100, { duration: 0.2, ease: 'easeOut', onUpdate: v => s.feet.leg3.y = v })
          );
          setTimeout(() => {
            if (currentAnimId.current !== animId) return;
            resetToDefault(0.4, "easeIn");
          }, 500);
        }, 200);
      }, ANIM_CONFIG.pretransitionMs);

    } else if (animName === 'wave') {
      resetToDefault(ANIM_CONFIG.pretransitionSec, ANIM_CONFIG.ease);
      setTimeout(() => {
        if (currentAnimId.current !== id) return;
        activeAnimations.current.push(
          animate(s.hands.hand1.y, s.hands.hand1.y - 150, { duration: 0.3, ease: "easeOut", onUpdate: v => s.hands.hand1.y = v }),
          animate(s.hands.hand2.y, s.hands.hand2.y - 100, { duration: 0.3, ease: "easeOut", onUpdate: v => s.hands.hand2.y = v }),
          animate(s.hands.hand1.x, s.hands.hand1.x - 60, { duration: 0.3, ease: "easeOut", onUpdate: v => s.hands.hand1.x = v }),
          animate(s.hands.hand2.x, s.hands.hand2.x + 60, { duration: 0.3, ease: "easeOut", onUpdate: v => s.hands.hand2.x = v }),
          animate(s.hands.hand1.a, 180, { duration: 0.3, ease: "easeOut", onUpdate: v => s.hands.hand1.a = v }),
          animate(s.hands.hand2.a, 0, { duration: 0.3, ease: "easeOut", onUpdate: v => s.hands.hand2.a = v }),
          animate(s.body.x, s.body.x + 20, { duration: 0.3, ease: "easeOut", onUpdate: v => s.body.x = v })
        );
        setTimeout(() => {
          if (currentAnimId.current !== id) return;
          activeAnimations.current.push(
            animate(s.hands.hand1.a, 135, { duration: 0.2, ease: "easeInOut", repeat: Infinity, repeatType: "reverse", onUpdate: v => s.hands.hand1.a = v }),
            animate(s.hands.hand2.a, -45, { duration: 0.2, ease: "easeInOut", repeat: Infinity, repeatType: "reverse", onUpdate: v => s.hands.hand2.a = v }),
            animate(s.hands.hand1.x, s.hands.hand1.x - 40, { duration: 0.2, ease: "easeInOut", repeat: Infinity, repeatType: "reverse", onUpdate: v => s.hands.hand1.x = v }),
            animate(s.hands.hand2.x, s.hands.hand2.x + 40, { duration: 0.2, ease: "easeInOut", repeat: Infinity, repeatType: "reverse", onUpdate: v => s.hands.hand2.x = v }),
            animate(s.body.x, s.body.x - 40, { duration: 0.4, ease: "easeInOut", repeat: Infinity, repeatType: "reverse", onUpdate: v => s.body.x = v })
          );
        }, 300);
      }, ANIM_CONFIG.pretransitionMs);

    } else if (animName === 'wave_left') {
      resetToDefault(ANIM_CONFIG.pretransitionSec, ANIM_CONFIG.ease);
      setTimeout(() => {
        if (currentAnimId.current !== id) return;
        activeAnimations.current.push(
          animate(s.hands.hand1.y, s.hands.hand1.y - 200, { duration: 0.3, ease: "easeOut", onUpdate: v => s.hands.hand1.y = v }),
          animate(s.hands.hand1.x, s.hands.hand1.x - 80, { duration: 0.3, ease: "easeOut", onUpdate: v => s.hands.hand1.x = v }),
          animate(s.hands.hand1.a, 180, { duration: 0.3, ease: "easeOut", onUpdate: v => s.hands.hand1.a = v }),
          animate(s.body.x, s.body.x - 20, { duration: 0.3, ease: "easeOut", onUpdate: v => s.body.x = v })
        );
        setTimeout(() => {
          if (currentAnimId.current !== id) return;
          activeAnimations.current.push(
            animate(s.hands.hand1.a, 135, { duration: 0.2, ease: "easeInOut", repeat: Infinity, repeatType: "reverse", onUpdate: v => s.hands.hand1.a = v }),
            animate(s.hands.hand1.x, s.hands.hand1.x - 40, { duration: 0.2, ease: "easeInOut", repeat: Infinity, repeatType: "reverse", onUpdate: v => s.hands.hand1.x = v })
          );
        }, 300);
      }, ANIM_CONFIG.pretransitionMs);

    } else if (animName === 'wave_right') {
      resetToDefault(ANIM_CONFIG.pretransitionSec, ANIM_CONFIG.ease);
      setTimeout(() => {
        if (currentAnimId.current !== id) return;
        activeAnimations.current.push(
          animate(s.hands.hand2.y, s.hands.hand2.y - 120, { duration: 0.3, ease: "easeOut", onUpdate: v => s.hands.hand2.y = v }),
          animate(s.hands.hand2.x, s.hands.hand2.x + 80, { duration: 0.3, ease: "easeOut", onUpdate: v => s.hands.hand2.x = v }),
          animate(s.body.x, s.body.x + 20, { duration: 0.3, ease: "easeOut", onUpdate: v => s.body.x = v })
        );
        setTimeout(() => {
          if (currentAnimId.current !== id) return;
          activeAnimations.current.push(
            animate(s.hands.hand2.a, -60, { duration: 0.2, ease: "easeInOut", repeat: Infinity, repeatType: "reverse", onUpdate: v => s.hands.hand2.a = v }),
            animate(s.hands.hand2.x, s.hands.hand2.x + 40, { duration: 0.2, ease: "easeInOut", repeat: Infinity, repeatType: "reverse", onUpdate: v => s.hands.hand2.x = v })
          );
        }, 300);
      }, ANIM_CONFIG.pretransitionMs);

    } else if (animName === 'dance') {
      const specialDanceSequence = sequencesRef.current.find(seq => seq.name === 'special dance');
      if (Math.random() < 0.7 && specialDanceSequence) {
        // Let the sequence engine handle it, but wait for our transition time
        resetToDefault(ANIM_CONFIG.pretransitionSec, ANIM_CONFIG.ease);
        setTimeout(() => {
          if (currentAnimId.current !== id) return;
          playSequence(specialDanceSequence);
        }, ANIM_CONFIG.pretransitionMs);
      } else {
        resetToDefault(ANIM_CONFIG.pretransitionSec, ANIM_CONFIG.ease);
        setTimeout(() => {
          if (currentAnimId.current !== id) return;
          activeAnimations.current.push(
            animate(s.body.x, s.body.x - 30, { duration: 0.4, ease: "easeInOut", repeat: Infinity, repeatType: "reverse", onUpdate: v => s.body.x = v }),
            animate(s.physics.targetY, s.physics.restY + 30, { duration: 0.2, ease: "easeInOut", repeat: Infinity, repeatType: "reverse", onUpdate: v => s.physics.targetY = v }),
            animate(s.hands.hand1.y, s.hands.hand1.y - 80, { duration: 0.4, ease: "easeInOut", repeat: Infinity, repeatType: "reverse", onUpdate: v => s.hands.hand1.y = v }),
            animate(s.hands.hand2.y, s.hands.hand2.y - 80, { duration: 0.4, ease: "easeInOut", repeat: Infinity, repeatType: "reverse", delay: 0.4, onUpdate: v => s.hands.hand2.y = v }),
            animate(s.hands.hand1.x, s.hands.hand1.x - 40, { duration: 0.4, ease: "easeInOut", repeat: Infinity, repeatType: "reverse", onUpdate: v => s.hands.hand1.x = v }),
            animate(s.hands.hand2.x, s.hands.hand2.x + 40, { duration: 0.4, ease: "easeInOut", repeat: Infinity, repeatType: "reverse", delay: 0.4, onUpdate: v => s.hands.hand2.x = v })
          );
        }, ANIM_CONFIG.pretransitionMs);
      }

    } else if (animName === 'point') {
      resetToDefault(ANIM_CONFIG.pretransitionSec, ANIM_CONFIG.ease);
      setTimeout(() => {
        if (currentAnimId.current !== id) return;
        activeAnimations.current.push(
          animate(s.body.x, s.body.x + 30, { duration: 0.3, ease: "easeOut", onUpdate: v => s.body.x = v }),
          animate(s.physics.targetY, s.physics.restY + 15, { duration: 0.3, ease: "easeOut", onUpdate: v => s.physics.targetY = v }),
          animate(s.hands.hand2.x, s.hands.hand2.x + 120, { duration: 0.3, ease: "easeOut", onUpdate: v => s.hands.hand2.x = v }),
          animate(s.hands.hand2.y, s.hands.hand2.y - 50, { duration: 0.3, ease: "easeOut", onUpdate: v => s.hands.hand2.y = v }),
          animate(s.hands.hand2.a, -75, { duration: 0.3, ease: "easeOut", onUpdate: v => s.hands.hand2.a = v }),
          animate(s.hands.hand1.x, s.hands.hand1.x - 30, { duration: 0.3, ease: "easeOut", onUpdate: v => s.hands.hand1.x = v })
        );
        setTimeout(() => {
          if (currentAnimId.current === id) resetToDefault(0.5);
        }, 3000);
      }, ANIM_CONFIG.pretransitionMs);

    } else if (animName === 'celebrate') {
      resetToDefault(ANIM_CONFIG.pretransitionSec, ANIM_CONFIG.ease);
      setTimeout(() => {
        if (currentAnimId.current !== id) return;
        // Normalize angles to shortest path so hands don't spin the long way around
        const ca1 = (() => { let d = (160 - s.hands.hand1.a) % 360; if (d > 180) d -= 360; if (d < -180) d += 360; return s.hands.hand1.a + d; })();
        const ca2 = (() => { let d = (-160 - s.hands.hand2.a) % 360; if (d > 180) d -= 360; if (d < -180) d += 360; return s.hands.hand2.a + d; })();
        // Joyful smooth sway â€” easeInOut on all loops (easeIn/Out are wrong for reverse loops)
        activeAnimations.current.push(
          animate(s.body.x, s.body.x - 30, { duration: 0.8, ease: "easeInOut", repeat: Infinity, repeatType: "reverse", onUpdate: v => s.body.x = v }),
          animate(s.physics.targetY, s.physics.restY - 25, { duration: 0.6, ease: "easeInOut", repeat: Infinity, repeatType: "reverse", onUpdate: v => s.physics.targetY = v }),
          animate(s.hands.hand1.y, s.hands.hand1.y - 180, { duration: 0.6, ease: "easeInOut", repeat: Infinity, repeatType: "reverse", onUpdate: v => s.hands.hand1.y = v }),
          animate(s.hands.hand2.y, s.hands.hand2.y - 180, { duration: 0.6, ease: "easeInOut", repeat: Infinity, repeatType: "reverse", delay: 0.1, onUpdate: v => s.hands.hand2.y = v }),
          animate(s.hands.hand1.x, s.hands.hand1.x - 40, { duration: 0.6, ease: "easeInOut", repeat: Infinity, repeatType: "reverse", onUpdate: v => s.hands.hand1.x = v }),
          animate(s.hands.hand2.x, s.hands.hand2.x + 40, { duration: 0.6, ease: "easeInOut", repeat: Infinity, repeatType: "reverse", delay: 0.1, onUpdate: v => s.hands.hand2.x = v }),
          animate(s.hands.hand1.a, ca1, { duration: 0.6, ease: "easeInOut", repeat: Infinity, repeatType: "reverse", onUpdate: v => s.hands.hand1.a = v }),
          animate(s.hands.hand2.a, ca2, { duration: 0.6, ease: "easeInOut", repeat: Infinity, repeatType: "reverse", delay: 0.1, onUpdate: v => s.hands.hand2.a = v }),
          animate(s.feet.leg1.y, s.feet.leg1.y - 15, { duration: 0.6, ease: "easeInOut", repeat: Infinity, repeatType: "reverse", delay: 0.15, onUpdate: v => s.feet.leg1.y = v }),
          animate(s.feet.leg3.y, s.feet.leg3.y - 15, { duration: 0.6, ease: "easeInOut", repeat: Infinity, repeatType: "reverse", onUpdate: v => s.feet.leg3.y = v })
        );
      }, ANIM_CONFIG.pretransitionMs);

    } else if (animName === 'sad') {
      resetToDefault(ANIM_CONFIG.pretransitionSec, ANIM_CONFIG.ease);
      setTimeout(() => {
        if (currentAnimId.current !== id) return;
        activeAnimations.current.push(
          animate(s.physics.restY, 463.4, { duration: 3.0, ease: "easeOut", onUpdate: v => s.physics.restY = v }),
          animate(s.hands.hand1.y, 513.8, { duration: 3.0, ease: "easeOut", onUpdate: v => s.hands.hand1.y = v }),
          animate(s.hands.hand2.y, 320.7, { duration: 3.0, ease: "easeOut", onUpdate: v => s.hands.hand2.y = v }),
          animate(s.hands.hand1.x, 199.4, { duration: 3.0, ease: "easeOut", onUpdate: v => s.hands.hand1.x = v }),
          animate(s.hands.hand1.a, -40, { duration: 3.0, ease: "easeOut", onUpdate: v => s.hands.hand1.a = v }),
          animate(s.hands.hand2.x, 447.3, { duration: 3.0, ease: "easeOut", onUpdate: v => s.hands.hand2.x = v }),
          animate(s.hands.hand2.a, -155, { duration: 3.0, ease: "easeOut", onUpdate: v => s.hands.hand2.a = v }),
          animate(s.feet.leg1.x, 52.8, { duration: 3.0, ease: "easeOut", onUpdate: v => s.feet.leg1.x = v }),
          animate(s.feet.leg2.x, 170.8, { duration: 3.0, ease: "easeOut", onUpdate: v => s.feet.leg2.x = v }),
          animate(s.feet.leg3.x, 499.8, { duration: 3.0, ease: "easeOut", onUpdate: v => s.feet.leg3.x = v }),
          animate(s.body.x, 307.9, { duration: 3.0, ease: "easeOut", onUpdate: v => s.body.x = v }),
          animate(s.back_y[0], -25, { duration: 3.0, ease: "easeOut", onUpdate: v => s.back_y[0] = v }),
          animate(s.back_y[1], -25, { duration: 3.0, ease: "easeOut", onUpdate: v => s.back_y[1] = v }),
          animate(s.back_y[2], -25, { duration: 3.0, ease: "easeOut", onUpdate: v => s.back_y[2] = v })
        );
      }, ANIM_CONFIG.pretransitionMs);

    } else if (animName === 'confused') {
      resetToDefault(ANIM_CONFIG.pretransitionSec, ANIM_CONFIG.ease);
      setTimeout(() => {
        if (currentAnimId.current !== id) return;
        activeAnimations.current.push(
          animate(s.body.x, s.body.x - 40, { duration: 0.6, ease: "easeInOut", repeat: Infinity, repeatType: "reverse", onUpdate: v => s.body.x = v }),
          animate(s.hands.hand1.y, s.hands.hand1.y - 120, { duration: 0.4, ease: "easeOut", onUpdate: v => s.hands.hand1.y = v }),
          animate(s.hands.hand1.x, s.hands.hand1.x + 60, { duration: 0.4, ease: "easeOut", onUpdate: v => s.hands.hand1.x = v }),
          animate(s.hands.hand1.a, 40, { duration: 0.4, ease: "easeOut", onUpdate: v => s.hands.hand1.a = v }),
          animate(s.hands.hand2.y, s.hands.hand2.y + 20, { duration: 0.4, ease: "easeOut", onUpdate: v => s.hands.hand2.y = v })
        );
      }, ANIM_CONFIG.pretransitionMs);

    } else if (animName === 'nod') {
      resetToDefault(ANIM_CONFIG.pretransitionSec, ANIM_CONFIG.ease);
      setTimeout(() => {
        if (currentAnimId.current !== id) return;
        activeAnimations.current.push(
          animate(s.physics.targetY, s.physics.restY + 40, { duration: 0.25, ease: "easeInOut", repeat: 3, repeatType: "reverse", onUpdate: v => s.physics.targetY = v }),
          animate(s.hands.hand1.y, s.hands.hand1.y + 20, { duration: 0.25, ease: "easeInOut", repeat: 3, repeatType: "reverse", onUpdate: v => s.hands.hand1.y = v }),
          animate(s.hands.hand2.y, s.hands.hand2.y + 20, { duration: 0.25, ease: "easeInOut", repeat: 3, repeatType: "reverse", onUpdate: v => s.hands.hand2.y = v })
        );
      }, ANIM_CONFIG.pretransitionMs);

    } else if (animName === 'shake') {
      resetToDefault(ANIM_CONFIG.pretransitionSec, ANIM_CONFIG.ease);
      setTimeout(() => {
        if (currentAnimId.current !== id) return;
        activeAnimations.current.push(
          animate(s.body.x, s.body.x + 40, { duration: 0.24, ease: "easeInOut", repeat: 5, repeatType: "reverse", onUpdate: v => s.body.x = v }),
          animate(s.hands.hand1.x, s.hands.hand1.x + 20, { duration: 0.24, ease: "easeInOut", repeat: 5, repeatType: "reverse", onUpdate: v => s.hands.hand1.x = v }),
          animate(s.hands.hand2.x, s.hands.hand2.x + 20, { duration: 0.24, ease: "easeInOut", repeat: 5, repeatType: "reverse", onUpdate: v => s.hands.hand2.x = v })
        );
      }, ANIM_CONFIG.pretransitionMs);

    } else if (animName === 'stretch') {
      resetToDefault(ANIM_CONFIG.pretransitionSec, ANIM_CONFIG.ease);
      setTimeout(() => {
        if (currentAnimId.current !== id) return;
        activeAnimations.current.push(
          animate(s.physics.targetY, s.physics.restY - 40, { duration: 1.2, ease: "easeOut", repeat: 1, repeatType: "reverse", onUpdate: v => s.physics.targetY = v }),
          animate(s.body.x, s.body.x + 20, { duration: 0.6, ease: "easeInOut", repeat: 3, repeatType: "reverse", onUpdate: v => s.body.x = v }),
          animate(s.feet.leg1.y, s.feet.leg1.y - 15, { duration: 1.2, ease: "easeOut", repeat: 1, repeatType: "reverse", onUpdate: v => s.feet.leg1.y = v }),
          animate(s.feet.leg3.y, s.feet.leg3.y - 15, { duration: 1.2, ease: "easeOut", repeat: 1, repeatType: "reverse", onUpdate: v => s.feet.leg3.y = v }),
          animate(s.hands.hand1.y, s.hands.hand1.y - 250, { duration: 1.2, ease: "easeOut", repeat: 1, repeatType: "reverse", onUpdate: v => s.hands.hand1.y = v }),
          animate(s.hands.hand2.y, s.hands.hand2.y - 200, { duration: 1.2, ease: "easeOut", repeat: 1, repeatType: "reverse", onUpdate: v => s.hands.hand2.y = v }),
          animate(s.hands.hand1.x, s.hands.hand1.x - 100, { duration: 1.2, ease: "easeOut", repeat: 1, repeatType: "reverse", onUpdate: v => s.hands.hand1.x = v }),
          animate(s.hands.hand2.x, s.hands.hand2.x + 100, { duration: 1.2, ease: "easeOut", repeat: 1, repeatType: "reverse", onUpdate: v => s.hands.hand2.x = v }),
          animate(s.hands.hand1.a, 45, { duration: 1.2, ease: "easeOut", repeat: 1, repeatType: "reverse", onUpdate: v => s.hands.hand1.a = v }),
          animate(s.hands.hand2.a, -45, { duration: 1.2, ease: "easeOut", repeat: 1, repeatType: "reverse", onUpdate: v => s.hands.hand2.a = v }),
          animate(s.back_y[0], -25, { duration: 1.2, ease: "easeOut", repeat: 1, repeatType: "reverse", onUpdate: v => s.back_y[0] = v }),
          animate(s.back_y[1], -15, { duration: 1.2, ease: "easeOut", repeat: 1, repeatType: "reverse", onUpdate: v => s.back_y[1] = v }),
          animate(s.back_y[2], -5, { duration: 1.2, ease: "easeOut", repeat: 1, repeatType: "reverse", onUpdate: v => s.back_y[2] = v })
        );
      }, ANIM_CONFIG.pretransitionMs);

    } else if (animName === 'idle_sway') {
      resetToDefault(ANIM_CONFIG.pretransitionSec, ANIM_CONFIG.ease);
      setTimeout(() => {
        if (currentAnimId.current !== id) return;
        const startX = s.body.x;
        activeAnimations.current.push(
          animate(s.body.x, startX + 30, { duration: 1.0, ease: "easeInOut", repeat: 1, repeatType: "reverse", onUpdate: v => s.body.x = v }),
          animate(s.hands.hand1.x, s.hands.hand1.x + 30, { duration: 1.0, ease: "easeInOut", repeat: 1, repeatType: "reverse", onUpdate: v => s.hands.hand1.x = v }),
          animate(s.hands.hand2.x, s.hands.hand2.x + 30, { duration: 1.0, ease: "easeInOut", repeat: 1, repeatType: "reverse", onUpdate: v => s.hands.hand2.x = v }),
          animate(s.feet.leg1.x, s.feet.leg1.x + 10, { duration: 1.0, ease: "easeInOut", repeat: 1, repeatType: "reverse", onUpdate: v => s.feet.leg1.x = v }),
          animate(s.feet.leg3.x, s.feet.leg3.x + 10, { duration: 1.0, ease: "easeInOut", repeat: 1, repeatType: "reverse", onUpdate: v => s.feet.leg3.x = v }),
        );
      }, ANIM_CONFIG.pretransitionMs);

    } else if (animName === 'idle_look') {
      resetToDefault(ANIM_CONFIG.pretransitionSec, ANIM_CONFIG.ease);
      setTimeout(() => {
        if (currentAnimId.current !== id) return;
        const startX = s.body.x;
        const startH1X = s.hands.hand1.x;
        const startH2X = s.hands.hand2.x;
        const startH2Y = s.hands.hand2.y;
        activeAnimations.current.push(
          animate(s.body.x, startX + 18, { duration: 0.5, ease: "easeInOut", repeat: 1, repeatType: "reverse", onUpdate: v => s.body.x = v }),
          animate(s.hands.hand1.x, startH1X + 18, { duration: 0.5, ease: "easeInOut", repeat: 1, repeatType: "reverse", onUpdate: v => s.hands.hand1.x = v }),
          animate(s.hands.hand2.x, startH2X + 18, { duration: 0.5, ease: "easeInOut", repeat: 1, repeatType: "reverse", onUpdate: v => s.hands.hand2.x = v }),
          animate(s.hands.hand2.y, startH2Y - 12, { duration: 0.5, ease: "easeInOut", repeat: 1, repeatType: "reverse", onUpdate: v => s.hands.hand2.y = v }),
        );
      }, ANIM_CONFIG.pretransitionMs);

    } else if (animName === 'crouch') {
      resetToDefault(ANIM_CONFIG.pretransitionSec, ANIM_CONFIG.ease);
      setTimeout(() => {
        if (currentAnimId.current !== id) return;
        activeAnimations.current.push(
          animate(s.physics.restY, 393.4 + 100, { duration: 0.4, ease: "easeOut", onUpdate: v => s.physics.restY = v }),
          animate(s.feet.leg1.x, s.body.x - 100, { duration: 0.4, ease: "easeOut", onUpdate: v => s.feet.leg1.x = v }),
          animate(s.feet.leg3.x, s.body.x + 100, { duration: 0.4, ease: "easeOut", onUpdate: v => s.feet.leg3.x = v }),
          animate(s.hands.hand1.y, s.hands.hand1.y + 120, { duration: 0.4, ease: "easeOut", onUpdate: v => s.hands.hand1.y = v }),
          animate(s.hands.hand2.y, s.hands.hand2.y + 120, { duration: 0.4, ease: "easeOut", onUpdate: v => s.hands.hand2.y = v }),
          animate(s.hands.hand1.x, s.hands.hand1.x + 30, { duration: 0.4, ease: "easeOut", onUpdate: v => s.hands.hand1.x = v }),
          animate(s.hands.hand2.x, s.hands.hand2.x - 30, { duration: 0.4, ease: "easeOut", onUpdate: v => s.hands.hand2.x = v }),
          animate(s.hands.hand1.a, -20, { duration: 0.4, ease: "easeOut", onUpdate: v => s.hands.hand1.a = v }),
          animate(s.hands.hand2.a, 20, { duration: 0.4, ease: "easeOut", onUpdate: v => s.hands.hand2.a = v })
        );
      }, ANIM_CONFIG.pretransitionMs);

    } else if (animName === 'bounce') {
      resetToDefault(ANIM_CONFIG.pretransitionSec, ANIM_CONFIG.ease);
      setTimeout(() => {
        if (currentAnimId.current !== id) return;
        activeAnimations.current.push(
          animate(s.physics.targetY, s.physics.restY - 80, { duration: 0.5, ease: "easeOut", repeat: Infinity, repeatType: "reverse", onUpdate: v => s.physics.targetY = v }),
          animate(s.hands.hand1.y, s.hands.hand1.y - 120, { duration: 0.5, ease: "easeOut", repeat: Infinity, repeatType: "reverse", onUpdate: v => s.hands.hand1.y = v }),
          animate(s.hands.hand2.y, s.hands.hand2.y - 120, { duration: 0.5, ease: "easeOut", repeat: Infinity, repeatType: "reverse", onUpdate: v => s.hands.hand2.y = v }),
          animate(s.hands.hand1.x, s.hands.hand1.x - 20, { duration: 0.5, ease: "easeOut", repeat: Infinity, repeatType: "reverse", onUpdate: v => s.hands.hand1.x = v }),
          animate(s.hands.hand2.x, s.hands.hand2.x + 20, { duration: 0.5, ease: "easeOut", repeat: Infinity, repeatType: "reverse", onUpdate: v => s.hands.hand2.x = v }),
          animate(s.feet.leg1.y, s.feet.leg1.y - 15, { duration: 0.5, ease: "easeOut", repeat: Infinity, repeatType: "reverse", delay: 0.125, onUpdate: v => s.feet.leg1.y = v }),
          animate(s.feet.leg3.y, s.feet.leg3.y - 15, { duration: 0.5, ease: "easeOut", repeat: Infinity, repeatType: "reverse", delay: 0.125, onUpdate: v => s.feet.leg3.y = v })
        );
      }, ANIM_CONFIG.pretransitionMs);

    } else if (animName === 'panic') {
      resetToDefault(ANIM_CONFIG.pretransitionSec * 0.5, ANIM_CONFIG.ease);
      setTimeout(() => {
        if (currentAnimId.current !== id) return;
        // Pre-calculate shortest-path angles at the moment phase 1 starts
        const pa1 = (() => { let d = (80 - s.hands.hand1.a) % 360; if (d > 180) d -= 360; if (d < -180) d += 360; return s.hands.hand1.a + d; })();
        const pa2 = (() => { let d = (-80 - s.hands.hand2.a) % 360; if (d > 180) d -= 360; if (d < -180) d += 360; return s.hands.hand2.a + d; })();
        // Phase 1: Slow nervous buildup â€” keep ref so we can STOP these before phase 2
        const buildUpAnims = [
          animate(s.body.x, s.body.x - 20, { duration: 0.7, ease: "easeInOut", repeat: 2, repeatType: "reverse", onUpdate: v => s.body.x = v }),
          animate(s.hands.hand1.y, s.hands.hand1.y - 50, { duration: 0.7, ease: "easeInOut", repeat: 2, repeatType: "reverse", onUpdate: v => s.hands.hand1.y = v }),
          animate(s.hands.hand2.y, s.hands.hand2.y - 50, { duration: 0.7, ease: "easeInOut", repeat: 2, repeatType: "reverse", delay: 0.3, onUpdate: v => s.hands.hand2.y = v }),
          animate(s.hands.hand1.a, pa1, { duration: 0.7, ease: "easeInOut", repeat: 2, repeatType: "reverse", onUpdate: v => s.hands.hand1.a = v }),
          animate(s.hands.hand2.a, pa2, { duration: 0.7, ease: "easeInOut", repeat: 2, repeatType: "reverse", delay: 0.3, onUpdate: v => s.hands.hand2.a = v }),
          animate(s.physics.targetY, s.physics.restY + 10, { duration: 0.7, ease: "easeInOut", repeat: 2, repeatType: "reverse", onUpdate: v => s.physics.targetY = v })
        ];
        activeAnimations.current.push(...buildUpAnims);
        // Phase 2: STOP phase 1 first, then start full-speed frenzy
        setTimeout(() => {
          if (currentAnimId.current !== id) return;
          // Kill phase 1 so they don't fight phase 2
          buildUpAnims.forEach(a => a.stop());
          activeAnimations.current = activeAnimations.current.filter(a => !buildUpAnims.includes(a));
          // Recalculate angles from wherever hands landed
          const fa1 = (() => { let d = (pa1 + 40 - s.hands.hand1.a) % 360; if (d > 180) d -= 360; if (d < -180) d += 360; return s.hands.hand1.a + d; })();
          const fa2 = (() => { let d = (pa2 - 40 - s.hands.hand2.a) % 360; if (d > 180) d -= 360; if (d < -180) d += 360; return s.hands.hand2.a + d; })();
          activeAnimations.current.push(
            animate(s.body.x, s.body.x - 50, { duration: 0.15, ease: "linear", repeat: Infinity, repeatType: "reverse", onUpdate: v => s.body.x = v }),
            animate(s.physics.targetY, s.physics.restY + 20, { duration: 0.15, ease: "linear", repeat: Infinity, repeatType: "reverse", onUpdate: v => s.physics.targetY = v }),
            animate(s.hands.hand1.y, s.hands.hand1.y - 150, { duration: 0.15, ease: "linear", repeat: Infinity, repeatType: "reverse", onUpdate: v => s.hands.hand1.y = v }),
            animate(s.hands.hand2.y, s.hands.hand2.y - 150, { duration: 0.15, ease: "linear", repeat: Infinity, repeatType: "reverse", delay: 0.07, onUpdate: v => s.hands.hand2.y = v }),
            animate(s.hands.hand1.x, s.hands.hand1.x - 60, { duration: 0.3, ease: "linear", repeat: Infinity, repeatType: "reverse", onUpdate: v => s.hands.hand1.x = v }),
            animate(s.hands.hand2.x, s.hands.hand2.x + 60, { duration: 0.3, ease: "linear", repeat: Infinity, repeatType: "reverse", delay: 0.15, onUpdate: v => s.hands.hand2.x = v }),
            animate(s.hands.hand1.a, fa1, { duration: 0.15, ease: "linear", repeat: Infinity, repeatType: "reverse", onUpdate: v => s.hands.hand1.a = v }),
            animate(s.hands.hand2.a, fa2, { duration: 0.15, ease: "linear", repeat: Infinity, repeatType: "reverse", delay: 0.07, onUpdate: v => s.hands.hand2.a = v })
          );
        }, 1400);
      }, ANIM_CONFIG.pretransitionMs * 0.5);

    } else if (animName === 'stomp') {
      stopProceduralAnimations();
      resetToDefault(ANIM_CONFIG.pretransitionSec * 0.5, ANIM_CONFIG.ease);
      setTimeout(() => {
        if (currentAnimId.current !== id) return;
        const animId = id;
        // Phase 1: High anticipation
        activeAnimations.current.push(
          animate(s.body.x, s.body.x - 40, { duration: 0.2, ease: 'easeOut', onUpdate: v => s.body.x = v }),
          animate(s.physics.targetY, s.physics.restY + 10, { duration: 0.2, ease: 'easeOut', onUpdate: v => s.physics.targetY = v }),
          animate(s.feet.leg3.y, s.feet.leg3.y - 220, { duration: 0.25, ease: 'easeOut', onUpdate: v => s.feet.leg3.y = v }),
          animate(s.feet.leg3.x, s.feet.leg3.x + 40, { duration: 0.25, ease: 'easeOut', onUpdate: v => s.feet.leg3.x = v }),
          animate(s.hands.hand2.y, s.hands.hand2.y - 80, { duration: 0.25, ease: 'easeOut', onUpdate: v => s.hands.hand2.y = v }),
          animate(s.hands.hand1.x, s.hands.hand1.x - 30, { duration: 0.2, ease: 'easeOut', onUpdate: v => s.hands.hand1.x = v })
        );
        // Phase 2: Slam
        setTimeout(() => {
          if (currentAnimId.current !== animId) return;
          activeAnimations.current.push(
            animate(s.body.x, s.body.x + 40, { duration: 0.1, ease: 'easeIn', onUpdate: v => s.body.x = v }),
            animate(s.feet.leg3.y, 570, { duration: 0.1, ease: 'easeIn', onUpdate: v => s.feet.leg3.y = v }),
            animate(s.feet.leg3.x, s.feet.leg3.x - 40, { duration: 0.1, ease: 'easeIn', onUpdate: v => s.feet.leg3.x = v }),
            animate(s.hands.hand2.y, s.hands.hand2.y + 120, { duration: 0.1, ease: 'easeIn', onUpdate: v => s.hands.hand2.y = v }),
            animate(s.physics.targetY, s.physics.restY + 60, { duration: 0.1, ease: 'easeIn', onUpdate: v => s.physics.targetY = v })
          );
          setTimeout(() => {
            if (currentAnimId.current !== animId) return;
            applyImpulse(100); // Massive shake down
            // Phase 3: Recover
            setTimeout(() => {
              if (currentAnimId.current !== animId) return;
              resetToDefault(0.6, "easeOut");
            }, 400);
          }, 100);
        }, 300);
      }, ANIM_CONFIG.pretransitionMs);

    } else if (animName === 'clap') {
      resetToDefault(ANIM_CONFIG.pretransitionSec * 0.65, ANIM_CONFIG.ease);
      setTimeout(() => {
        if (currentAnimId.current !== id) return;
        // Phase 1: setup - move hands to Keyframe 1
        activeAnimations.current.push(
          animate(s.hands.hand1.x, s.body.x - 5.5, { duration: 0.3, ease: "easeOut", onUpdate: v => s.hands.hand1.x = v }),
          animate(s.hands.hand1.y, s.body.y - 92.8, { duration: 0.3, ease: "easeOut", onUpdate: v => s.hands.hand1.y = v }),
          animate(s.hands.hand1.a, 0, { duration: 0.3, ease: "easeOut", onUpdate: v => s.hands.hand1.a = v }),
          animate(s.hands.hand2.x, s.body.x + 167.1, { duration: 0.3, ease: "easeOut", onUpdate: v => s.hands.hand2.x = v }),
          animate(s.hands.hand2.y, s.body.y - 262.5, { duration: 0.3, ease: "easeOut", onUpdate: v => s.hands.hand2.y = v }),
          animate(s.hands.hand2.a, -10, { duration: 0.3, ease: "easeOut", onUpdate: v => s.hands.hand2.a = v })
        );
        setTimeout(() => {
          if (currentAnimId.current !== id) return;
          // Phase 2: Clap loop - animate to Keyframe 2 and reverse
          activeAnimations.current.push(
            animate(s.hands.hand1.x, s.body.x + 28.2, { duration: 0.3, ease: "easeInOut", repeat: Infinity, repeatType: "reverse", onUpdate: v => s.hands.hand1.x = v }),
            animate(s.hands.hand1.y, s.body.y - 87.3, { duration: 0.3, ease: "easeInOut", repeat: Infinity, repeatType: "reverse", onUpdate: v => s.hands.hand1.y = v }),
            animate(s.hands.hand1.a, 5, { duration: 0.3, ease: "easeInOut", repeat: Infinity, repeatType: "reverse", onUpdate: v => s.hands.hand1.a = v }),
            animate(s.hands.hand2.x, s.body.x + 164.3, { duration: 0.3, ease: "easeInOut", repeat: Infinity, repeatType: "reverse", onUpdate: v => s.hands.hand2.x = v }),
            animate(s.hands.hand2.a, -45, { duration: 0.3, ease: "easeInOut", repeat: Infinity, repeatType: "reverse", onUpdate: v => s.hands.hand2.a = v }),
            animate(s.physics.targetY, s.physics.restY + 10, { duration: 0.3, ease: "easeInOut", repeat: Infinity, repeatType: "reverse", onUpdate: v => s.physics.targetY = v })
          );
        }, 350);
      }, ANIM_CONFIG.pretransitionMs);

    } else if (animName === 'freeze') {
      s.isFrozen = true;
      stopProceduralAnimations();

      const duration = 0.3;
      const ease = "easeInOut";
      const normalizeA = (current: number, target: number) => {
        let diff = (target - current) % 360;
        if (diff > 180) diff -= 360;
        if (diff < -180) diff += 360;
        return current + diff;
      };

      activeAnimations.current.push(
        animate(s.back_y[0], 0, { duration, ease, onUpdate: v => s.back_y[0] = v }),
        animate(s.back_y[1], 0, { duration, ease, onUpdate: v => s.back_y[1] = v }),
        animate(s.back_y[2], 0, { duration, ease, onUpdate: v => s.back_y[2] = v }),
        animate(s.hands.hand1.x, s.body.x - 121.6, { duration, ease, onUpdate: v => s.hands.hand1.x = v }),
        animate(s.hands.hand1.y, 414.7 + (s.body.y - 393.4), { duration, ease, onUpdate: v => s.hands.hand1.y = v }),
        animate(s.hands.hand1.a, normalizeA(s.hands.hand1.a, 0), { duration, ease, onUpdate: v => s.hands.hand1.a = v }),
        animate(s.hands.hand2.x, s.body.x + 294.5, { duration, ease, onUpdate: v => s.hands.hand2.x = v }),
        animate(s.hands.hand2.y, 120.6 + (s.body.y - 393.4), { duration, ease, onUpdate: v => s.hands.hand2.y = v }),
        animate(s.hands.hand2.a, normalizeA(s.hands.hand2.a, 0), { duration, ease, onUpdate: v => s.hands.hand2.a = v })
      );

      RIG.legs.forEach(limb => {
        const idealX = s.body.x + (limb.footEnd.x - RIG.body.pivot.x);
        const idealY = 570;
        const target = s.feet[limb.id as keyof typeof s.feet];
        activeAnimations.current.push(
          animate(target.x, idealX, { duration, ease, onUpdate: v => target.x = v }),
          animate(target.y, idealY, { duration, ease, onUpdate: v => target.y = v }),
          animate(target.a, normalizeA(target.a, 0), { duration, ease, onUpdate: v => target.a = v })
        );
      });

    } else if (animName === 'sleep') {
      s.isFrozen = true; // FREEZE immediately â€” halts idle breathing & procedural movement
      stopProceduralAnimations();
      const animId = id;
      const duration = 2.5;
      const ease = 'easeInOut';

      const sinkTargetY = s.body.y + 110;
      activeAnimations.current.push(
        // Body descends toward floor, keeping physics in sync
        animate(s.body.y, sinkTargetY, { duration, ease, onUpdate: v => { s.body.y = v; s.physics.body.y = v; s.physics.targetY = v; s.physics.restY = v; } }),
        animate(s.body.x, 295.1, { duration, ease, onUpdate: v => s.body.x = v }),
        animate(s.body.tilt, -2, { duration, ease, onUpdate: v => s.body.tilt = v }),

        // Legs splay wide to the floor
        animate(s.feet.leg1.x, s.body.x - 180, { duration, ease, onUpdate: v => s.feet.leg1.x = v }),
        animate(s.feet.leg1.y, 560, { duration, ease, onUpdate: v => s.feet.leg1.y = v }),
        animate(s.feet.leg1.a, 0, { duration, ease, onUpdate: v => s.feet.leg1.a = v }),

        animate(s.feet.leg2.x, s.body.x - 80, { duration, ease, onUpdate: v => s.feet.leg2.x = v }),
        animate(s.feet.leg2.y, 560, { duration, ease, onUpdate: v => s.feet.leg2.y = v }),
        animate(s.feet.leg2.a, 0, { duration, ease, onUpdate: v => s.feet.leg2.a = v }),

        animate(s.feet.leg3.x, s.body.x + 180, { duration, ease, onUpdate: v => s.feet.leg3.x = v }),
        animate(s.feet.leg3.y, 560, { duration, ease, onUpdate: v => s.feet.leg3.y = v }),
        animate(s.feet.leg3.a, 0, { duration, ease, onUpdate: v => s.feet.leg3.a = v }),

        // Hands droop and rest beside the lowered body
        animate(s.hands.hand1.x, s.body.x - 140, { duration, ease, onUpdate: v => s.hands.hand1.x = v }),
        animate(s.hands.hand1.y, s.body.y + 40, { duration, ease, onUpdate: v => s.hands.hand1.y = v }),
        animate(s.hands.hand1.a, -10, { duration, ease, onUpdate: v => s.hands.hand1.a = v }),

        animate(s.hands.hand2.x, s.body.x + 140, { duration, ease, onUpdate: v => s.hands.hand2.x = v }),
        animate(s.hands.hand2.y, s.body.y + 40, { duration, ease, onUpdate: v => s.hands.hand2.y = v }),
        animate(s.hands.hand2.a, 10, { duration, ease, onUpdate: v => s.hands.hand2.a = v }),

        // Back elements flatten to 0 (breathing stopped by isFrozen)
        animate(s.back_y[0], 0, { duration, ease, onUpdate: v => s.back_y[0] = v }),
        animate(s.back_y[1], 0, { duration, ease, onUpdate: v => s.back_y[1] = v }),
        animate(s.back_y[2], 0, { duration, ease, onUpdate: v => s.back_y[2] = v })
      );

    } else if (animName === 'chirp') {
      resetToDefault(ANIM_CONFIG.pretransitionSec * 0.4, ANIM_CONFIG.ease);
      setTimeout(() => {
        if (currentAnimId.current !== id) return;
        activeAnimations.current.push(
          animate(s.back_y[0], -20, { duration: 0.2, ease: "easeOut", onUpdate: v => s.back_y[0] = v }),
          animate(s.back_y[1], -20, { duration: 0.2, ease: "easeOut", onUpdate: v => s.back_y[1] = v }),
          animate(s.back_y[2], -20, { duration: 0.2, ease: "easeOut", onUpdate: v => s.back_y[2] = v })
        );
        setTimeout(() => {
          if (currentAnimId.current === id) {
            activeAnimations.current.push(
              animate(s.back_y[0], 0, { duration: 0.5, ease: "easeIn", onUpdate: v => s.back_y[0] = v }),
              animate(s.back_y[1], 0, { duration: 0.5, ease: "easeIn", onUpdate: v => s.back_y[1] = v }),
              animate(s.back_y[2], 0, { duration: 0.5, ease: "easeIn", onUpdate: v => s.back_y[2] = v })
            );
          }
        }, 1000);
      }, ANIM_CONFIG.pretransitionMs);

    } else if (animName === 'harmonic') {
      resetToDefault(ANIM_CONFIG.pretransitionSec * 0.4, ANIM_CONFIG.ease);
      setTimeout(() => {
        if (currentAnimId.current !== id) return;
        activeAnimations.current.push(
          animate(s.back_y[0], -30, { duration: 0.4, ease: "easeOut", onUpdate: v => s.back_y[0] = v }),
          animate(s.back_y[1], -30, { duration: 0.4, ease: "easeOut", onUpdate: v => s.back_y[1] = v }),
          animate(s.back_y[2], -30, { duration: 0.4, ease: "easeOut", onUpdate: v => s.back_y[2] = v })
        );
        setTimeout(() => {
          if (currentAnimId.current === id) {
            activeAnimations.current.push(
              animate(s.back_y[0], 0, { duration: 0.8, ease: "easeIn", onUpdate: v => s.back_y[0] = v }),
              animate(s.back_y[1], 0, { duration: 0.8, ease: "easeIn", onUpdate: v => s.back_y[1] = v }),
              animate(s.back_y[2], 0, { duration: 0.8, ease: "easeIn", onUpdate: v => s.back_y[2] = v })
            );
          }
        }, 3000);
      }, ANIM_CONFIG.pretransitionMs);
    } else {
      const script = customAnimsRef.current[animName];
      if (script) {
        resetToDefault(ANIM_CONFIG.pretransitionSec, ANIM_CONFIG.ease);
        setTimeout(() => {
          if (currentAnimId.current !== id) return;
          try {
            const push = (...anims: any[]) => activeAnimations.current.push(...anims);
            new Function('animate', 's', 'push', script)(animate, s, push);
          } catch (e) {
            console.error('[Custom anim]', animName, e);
          }
        }, ANIM_CONFIG.pretransitionMs);
      }
    }
    // ---- Auto-Return & Idle Scheduler ----
    const emoteConf = EMOTE_CONFIG[animName] || EMOTE_CONFIG.default;

    if (emoteConf.mode !== 'hold') {
      emoteTimeoutRef.current = setTimeout(() => {
        if (playingSequenceIdRef.current === animName) {
          resetToDefault(ANIM_CONFIG.pretransitionSec, ANIM_CONFIG.ease);
          playingSequenceIdRef.current = null;
        }
        // Restart idle timer once default state is reached
        idleTimerRef.current = setTimeout(() => {
          if (!playingSequenceIdRef.current && !dragRef.current.isDragging) {
            triggerAnimRef.current(IDLE_POOL[Math.floor(Math.random() * IDLE_POOL.length)]);
          }
        }, nextIdleDelay());
      }, emoteConf.timeoutMs);
    }

    if (emoteConf.mode === 'hold' || animName === 'default') {
      idleTimerRef.current = setTimeout(() => {
        if (!playingSequenceIdRef.current && !dragRef.current.isDragging) {
          triggerAnimRef.current(IDLE_POOL[Math.floor(Math.random() * IDLE_POOL.length)]);
        }
      }, nextIdleDelay());
    }
  };

  // Keep refs in sync
  useEffect(() => {
    sequencesRef.current = sequences;
    keyframesRef.current = keyframes;
    triggerAnimRef.current = triggerAnimation;
  }, [sequences, keyframes, triggerAnimation]);



  const charStyle: React.CSSProperties = {
    position: 'relative',
    width: '100%',
    height: '100%',
  };

  const svgWrapperStyle: React.CSSProperties = isFullWindow ? {
    position: 'absolute',
    width: charW,
    height: charH,
    ...(fullWindowCorner.includes('bottom') ? { bottom: 0 } : { top: 0 }),
    ...(fullWindowCorner.includes('right') ? { right: 0 } : { left: 0 }),
  } : {
    position: 'absolute',
    inset: 0,
  };

  return (
    <div
      style={{ background: 'transparent', position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden' }}
    >
      <div style={charStyle}>
      <div
        ref={stageRef}
        style={{
          position: 'absolute',
          inset: 0,
          willChange: 'transform',
          transform: 'translate3d(0px, 0px, 0)',
        }}
      >
      <div style={svgWrapperStyle}>
      <style>{`
        /* Rocky speech bubble */
        .sb-rocky-wrap {
          transform-origin: center bottom;
          filter: drop-shadow(5px 5px 0 #111);
          will-change: transform, opacity;
          pointer-events: none;
        }
        .sb-rocky-body {
          background: #ffffff;
          border: 2.5px solid #111;
          border-radius: 48px 36px 52px 24px / 24px 50px 34px 48px;
          padding: 13px 22px;
          font-family: 'Manrope', system-ui, sans-serif;
          font-size: 13.5px;
          font-weight: 500;
          line-height: 1.55;
          color: #111;
          max-width: 272px;
          word-break: break-word;
          position: relative;
          overflow: visible;
        }
        /* User speech bubble */
        .sb-user-wrap {
          background: #ffffff;
          border: 2px solid #111;
          border-radius: 22px;
          padding: 10px 20px;
          font-family: 'Manrope', system-ui, sans-serif;
          font-size: 13px;
          font-weight: 500;
          line-height: 1.55;
          color: #111;
          max-width: 310px;
          word-break: break-word;
          box-shadow: inset 0 2px 14px rgba(0,0,0,0.07), 3px 3px 0 #111;
          transform-origin: center bottom;
          will-change: transform, opacity;
          pointer-events: none;
        }
        /* Shared animations */
        @keyframes sb-appear {
          0%   { opacity: 0; transform: scale(0.28); }
          52%  { opacity: 1; transform: scale(1.09); }
          72%  { transform: scale(0.96); }
          86%  { transform: scale(1.02); }
          100% { opacity: 1; transform: scale(1); }
        }
        @keyframes sb-disappear {
          0%   { opacity: 1; transform: scale(1); }
          18%  { transform: scale(1.06); }
          100% { opacity: 0; transform: scale(0.55); }
        }
        .sb-in  { animation: sb-appear    0.45s cubic-bezier(0.34, 1.56, 0.64, 1) forwards; }
        .sb-out { animation: sb-disappear 0.32s ease-in forwards; }
      `}</style>

      {speechBubblesEnabled && userBubble && (
        <div style={{
          position: 'absolute', bottom: 16,
          left: 0, right: 0,
          display: 'flex', justifyContent: 'center',
          pointerEvents: 'none', zIndex: 100,
        }}>
          <div
            className={`sb-user-wrap sb-${userBubblePhase}`}
            onAnimationEnd={(e) => {
              if (e.animationName === 'sb-disappear') {
                setUserBubble(null);
                setUserBubblePhase('in');
              }
            }}
          >
            {userBubble}
          </div>
        </div>
      )}

      {speechBubblesEnabled && speechBubble && (
        <div
          className={`sb-rocky-wrap sb-${rockyBubblePhase}`}
          style={{ position: 'absolute', bottom: '38%', left: '50%', transform: 'translateX(-50%)', zIndex: 100 }}
          onAnimationEnd={(e) => {
            if (e.animationName === 'sb-disappear') {
              setSpeechBubble(null);
              setRockyBubblePhase('in');
            }
          }}
        >
          <div className="sb-rocky-body">
            {speechBubble}
            {/* Curved SVG tail */}
            <svg
              viewBox="-5 -3 42 24"
              style={{ position: 'absolute', bottom: -20, left: 0, width: 42, height: 24, overflow: 'visible', display: 'block' }}
            >
              <path d="M -1 -3 L 32 -3 L 32 2 C 24 6, 12 14, -3 20 C -5 13, -3 6, 0 2 Z" fill="#ffffff" />
              <path d="M 0 0 C -3 6, -5 13, -3 20" fill="none" stroke="#111" strokeWidth="2.5" strokeLinecap="round" />
              <path d="M 32 0 C 24 6, 12 14, -3 20" fill="none" stroke="#111" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
          </div>
        </div>
      )}

      <svg
        id="character"
        ref={svgRef}
        xmlns="http://www.w3.org/2000/svg"
        viewBox="-100 -200 1000 770"
        preserveAspectRatio="xMidYMax meet"
        shapeRendering="geometricPrecision"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className="w-full h-full touch-none"
        style={{
          background: 'transparent',
          filter: `drop-shadow(0 25px 40px rgba(0,0,0,0.65))${
            debugBorder && aiState !== 'idle'
              ? ` drop-shadow(0 0 16px ${
                  aiState === 'listening' ? 'rgba(0,220,80,0.95)'
                  : aiState === 'thinking' ? 'rgba(220,40,40,0.95)'
                  : 'rgba(40,80,220,0.95)'
                })`
              : ''
          }`,
        }}
      >
          <style>{`
            /* Dynamically fade vector colored paths, ignoring the PNG skin */
            svg#character path:not(.skin-overlay) { opacity: ${vectorOpacity}; transition: opacity 0.1s ease-out; }
            svg#character clipPath path { opacity: 1; }
            .skin-layer, .skin-image { transition: opacity 0.1s ease-out; }
            .skin-image { display: none; }
            .skin-overlay {
              display: none;
              pointer-events: none;
            }
            .skin-image {
              filter: saturate(1.08) contrast(1.05);
            }
          `}</style>
          <defs>
            <pattern id="skin_back_1" x="0" y="0" width="1" height="1" patternUnits="objectBoundingBox" patternContentUnits="objectBoundingBox"><image href={skinUrl('back_1')} x="0" y="0" width="1" height="1" preserveAspectRatio="none" /></pattern>
            <pattern id="skin_back_2" x="0" y="0" width="1" height="1" patternUnits="objectBoundingBox" patternContentUnits="objectBoundingBox"><image href={skinUrl('back_2')} x="0" y="0" width="1" height="1" preserveAspectRatio="none" /></pattern>
            <pattern id="skin_back_3" x="0" y="0" width="1" height="1" patternUnits="objectBoundingBox" patternContentUnits="objectBoundingBox"><image href={skinUrl('back_3')} x="0" y="0" width="1" height="1" preserveAspectRatio="none" /></pattern>
            <pattern id="skin_body" x="0" y="0" width="1" height="1" patternUnits="objectBoundingBox" patternContentUnits="objectBoundingBox"><image href={skinUrl('body_main')} x="0" y="0" width="1" height="1" preserveAspectRatio="none" /></pattern>
            <pattern id="skin_leg1_main" x="0" y="0" width="1" height="1" patternUnits="objectBoundingBox" patternContentUnits="objectBoundingBox"><image href={skinUrl('leg1_main')} x="0" y="0" width="1" height="1" preserveAspectRatio="none" /></pattern>
            <pattern id="skin_leg1_foot" x="0" y="0" width="1" height="1" patternUnits="objectBoundingBox" patternContentUnits="objectBoundingBox"><image href={skinUrl('leg1_foot')} x="0" y="0" width="1" height="1" preserveAspectRatio="none" /></pattern>
            <pattern id="skin_leg2_main" x="0" y="0" width="1" height="1" patternUnits="objectBoundingBox" patternContentUnits="objectBoundingBox"><image href={skinUrl('leg2_main')} x="0" y="0" width="1" height="1" preserveAspectRatio="none" /></pattern>
            <pattern id="skin_leg2_foot" x="0" y="0" width="1" height="1" patternUnits="objectBoundingBox" patternContentUnits="objectBoundingBox"><image href={skinUrl('leg2_foot')} x="0" y="0" width="1" height="1" preserveAspectRatio="none" /></pattern>
            <pattern id="skin_leg3_main" x="0" y="0" width="1" height="1" patternUnits="objectBoundingBox" patternContentUnits="objectBoundingBox"><image href={skinUrl('leg3_main')} x="0" y="0" width="1" height="1" preserveAspectRatio="none" /></pattern>
            <pattern id="skin_leg3_foot" x="0" y="0" width="1" height="1" patternUnits="objectBoundingBox" patternContentUnits="objectBoundingBox"><image href={skinUrl('leg3_foot')} x="0" y="0" width="1" height="1" preserveAspectRatio="none" /></pattern>
            <pattern id="skin_leg3_foot_small" x="0" y="0" width="1" height="1" patternUnits="objectBoundingBox" patternContentUnits="objectBoundingBox"><image href={skinUrl('leg3_foot_small')} x="0" y="0" width="1" height="1" preserveAspectRatio="none" /></pattern>
            <pattern id="skin_hand1_main" x="0" y="0" width="1" height="1" patternUnits="objectBoundingBox" patternContentUnits="objectBoundingBox"><image href={skinUrl('hand1_main')} x="0" y="0" width="1" height="1" preserveAspectRatio="none" /></pattern>
            <pattern id="skin_hand1_foot" x="0" y="0" width="1" height="1" patternUnits="objectBoundingBox" patternContentUnits="objectBoundingBox"><image href={skinUrl('hand1_foot')} x="0" y="0" width="1" height="1" preserveAspectRatio="none" /></pattern>
            <pattern id="skin_hand2_main" x="0" y="0" width="1" height="1" patternUnits="objectBoundingBox" patternContentUnits="objectBoundingBox"><image href={skinUrl('hand2_main')} x="0" y="0" width="1" height="1" preserveAspectRatio="none" /></pattern>
            <pattern id="skin_hand2_foot" x="0" y="0" width="1" height="1" patternUnits="objectBoundingBox" patternContentUnits="objectBoundingBox"><image href={skinUrl('hand2_foot')} x="0" y="0" width="1" height="1" preserveAspectRatio="none" /></pattern>
            <clipPath id="clip_back_1"><path d="M245.499531,184.355645L231.268515,197.86305q-7.95972,17.366662-8.442128,17.607866c-.482408.241204-3.618054,29.909254-3.376851,29.909254s45.105082,8.683331,45.346286,8.683331q.241204,0-19.296291-69.707856Z" /></clipPath>
            <clipPath id="clip_back_2"><path d="M250.806011,181.605924l22.576663,67.729987l43.416658-8.104443l10.419997-79.886652-37.048882,4.052222-39.364436,16.208886Z" /></clipPath>
            <clipPath id="clip_back_3"><path d="M333.538866,161.682501L361.759694,168.195l18.572682,34.733326q-29.909254,40.522215-30.632865,40.522215t-24.120366-4.100462l7.959721-77.667578Z" /></clipPath>
            <clipPath id="clip_body"><path d="M229.574001,388.971567l40.200477,15.118026q68.218991,4.872785,68.828089,4.872785c.609098,0,12.791061-19.990812,14.009257-19.990812q1.218196,0,15.227453-9.700039l15.227453-38.528143q15.836551-28.018515,15.836551-28.627613t4.872785-42.63687l14.618354-41.418674-4.872786-45.073264-30.454904-23.754828-25.582127-4.872785-7.918276,3.04549-13.400159-7.918276q-28.627611,7.918276-29.23671,7.918276t-62.737109,20.100239l-61.518912,43.245968l15.227453,63.955305l20.709337,60.909814l10.963767,18.272944.000007,25.082457Z" /></clipPath>
            <clipPath id="clip_leg1_main"><path d="M77.688745,359.543627v19.727901l-3.079013,41.033058l37.029147-7.082923l16.490066-13.906243l19.948221-35.426307l24.641222-40.658867l5.619927-19.885899l19.562579-24.119874c0,0,18.465121-51.880911,18.465121-51.880911s-43.022997-4.111663-43.022997-4.111663-15.44289,8.927921-15.684186,8.927921q-.241296,0-12.54735,6.51497l-24.667907,48.917544-23.011702,33.07932-3.595578,15.820545L80.545309,348.47447q0,8.669895,0,8.429064t-2.856564,2.640093Z" /></clipPath>
            <clipPath id="clip_leg1_foot"><path d="M57.31866,594.612388l20.370082,1.940008l26.190105-3.880016l18.430073-93.120374l5.820024-34.92014-2.910012-34.92014-13.580055-16.490066q-33.950136-24.250098-34.92014-24.250098t-25.220101-9.700039q-4.85002,12.61005-4.85002,13.580054c0,.970004-2.910011,31.040124-2.910011,35.890143s1.940006,41.710166,1.940006,43.650174q0,1.940008,11.640049,122.220494Z" /></clipPath>
            <clipPath id="clip_leg2_main"><path d="M230.881672,292.327454l-6.991364,48.648243.582613,14.274035-32.335059,40.200345-18.934945,11.94358-13.400115-.291307-11.943581-12.526195-9.613127-22.721933l3.495682-41.948186l22.139321-32.33506l34.665514-43.113413l34.082901-5.243523-1.74784,43.113414Z" /></clipPath>
            <clipPath id="clip_leg2_foot"><path d="M178.442654,572.187031q10.975283,2.743821,11.524047,2.926742t11.341125-4.938878l-3.109663-8.048541l2.377978-5.304721q-4.390113-9.694834-4.755956-10.426519t-.548765-14.267868q9.32899-12.438656,9.511912-12.621577t3.658428-21.218881l-1.829214-7.316855l2.377978-5.853484q0-47.559561,0-48.108325t-4.207192-49.754617L188.24038,367.040693l-40.014054,8.002811.285815,21.150286l7.716996,32.011242l5.716293,10.289328l5.716294,9.14607-2.235794,9.128205l3.58371,10.613296-2.48103,5.926905.689175,12.405151-.137835,24.948135l1.92969,4.962061l1.516185,35.561431l5.23773,17.229376l2.679099,3.772041Z" /></clipPath>
            <clipPath id="clip_leg3_main"><path d="M386.547507,227.873827l34.708138,8.23583l28.825403,64.121814l11.76547,33.531591l7.059281,47.061882l1.176547,39.414326-2.353095,10.588924-10.000651,5.29446-11.765471-3.529642-23.530943-35.296413-34.119865-58.23908-5.294463-24.707489-16.471659-28.825404l20.001308-57.650799Z" /></clipPath>
            <clipPath id="clip_leg3_foot"><path d="M487.135718,504.801547q-14.265336-40.708404-14.613271-40.708404t-14.961206-16.005012l-30.966219-49.05884-11.829791,3.131414l18.092621,76.197771-5.56696,8.002504.347935,10.090115l8.698376,28.530672q25.399257,49.406786,25.747193,49.406786t18.092622-4.523155l-1.043806-24.007517v-35.837308l8.002506-5.219026Z" /></clipPath>
            <clipPath id="clip_leg3_foot_small"><path d="M461.453762,468.892973l6.51374,52.959534l15.590109-12.334338.564854-5.64854-4.8954-57.991668l2.353558-50.711328-8.472809-9.571136-11.297078-7.060674l1.255231,63.075353l3.451885,15.06277-5.06409,12.220027Z" /></clipPath>
            <clipPath id="clip_hand1_main"><path d="M217.133362,209.258326l20.219025.56164l26.9587,8.986233-1.123279,12.35607-24.712142,47.177726-42.12297,56.163959-14.04099,10.109513-32.575098-2.808199-3.369837-30.890179l8.424594-21.903945.561639-8.424595l11.232792-13.479351l15.164269-23.027225l18.534107-15.72591l16.84919-19.095737Z" /></clipPath>
            <clipPath id="clip_hand1_foot"><path d="M132.197009,310.597424q.551051,0,13.225217,0l32.511989,19.837824l28.103584,36.369345l69.983436,85.963905-.551051,27.552533-18.184672,3.306303-77.147095-56.758219L173.525809,414.746l-36.369344-31.409889-23.144129-32.51199-5.510508-21.490976q8.816812-4.959456,9.918913-5.510507c1.102101-.551051,13.225215-13.225214,13.776268-13.225214Z" /></clipPath>
            <clipPath id="clip_hand2_main"><path d="M384.030066,199.383119q2.86216,4.29324,11.925667,30.05268l21.466198,26.236466q22.897279,14.310801,22.897279,14.787827t.954053,9.063505l61.059413,52.472933q7.632427,0,8.109453,0c.477026,0,12.879718-1.908108,13.356745-2.385134q.477027-.477026,10.971613-16.695933l-28.144573-55.335092Q488.4989,239.930385,488.4989,239.453358t-7.632428-19.558093q-20.512148-12.402693-22.897281-12.87972c-2.385133-.477027-11.44864-12.402693-11.44864-12.87972q0-.477027-23.374308-9.063506l-29.098627-.000001q-12.879714,10.017555-10.01755,14.310801Z" /></clipPath>
            <clipPath id="clip_hand2_foot"><path d="M512.827264,316.731677l26.713493-8.109453q20.989173-24.32836,21.466199-27.667547c.477026-3.339187,24.805386-62.013465,24.805386-62.490492q0-.477027,24.805386-77.755346L589.628555,120.67372l-10.01756.954052-17.172959,26.713492-56.289146,94.451277q-.477027,8.586479,0,9.063506t4.770266,20.03512l-17.172959,8.586479l19.081067,36.254031Z" /></clipPath>
          </defs>

          <g id="rootGroup" transform="translate(295.1, 393.4)">
            <g transform="translate(-295.1, -392.2)">
              {/* BODY */}
              <g id="body_main" className="cursor-grab active:cursor-grabbing">
                <g id="back_elements" transform="translate(0, 0)">
                  <g id="back_element_1">
                    <path fill="#8a5526" d="M245.499531,184.355645L231.268515,197.86305q-7.95972,17.366662-8.442128,17.607866c-.482408.241204-3.618054,29.909254-3.376851,29.909254s45.105082,8.683331,45.346286,8.683331q.241204,0-19.296291-69.707856Z" />
                    <path className="skin-overlay" fill="url(#skin_back_1)" d="M245.499531,184.355645L231.268515,197.86305q-7.95972,17.366662-8.442128,17.607866c-.482408.241204-3.618054,29.909254-3.376851,29.909254s45.105082,8.683331,45.346286,8.683331q.241204,0-19.296291-69.707856Z" />
                    <g className="skin-layer" opacity={skinOpacity}>
                      <AutoSkinImage href={skinUrl('back_1')} clipId="clip_back_1" />
                    </g>
                  </g>
                  <g id="back_element_2">
                    <path fill="#4f2e14" d="M250.806011,181.605924l22.576663,67.729987l43.416658-8.104443l10.419997-79.886652-37.048882,4.052222-39.364436,16.208886Z" />
                    <path className="skin-overlay" fill="url(#skin_back_2)" d="M250.806011,181.605924l22.576663,67.729987l43.416658-8.104443l10.419997-79.886652-37.048882,4.052222-39.364436,16.208886Z" />
                    <g className="skin-layer" opacity={skinOpacity}>
                      <AutoSkinImage href={skinUrl('back_2')} clipId="clip_back_2" />
                    </g>
                  </g>
                  <g id="back_element_3">
                    <path fill="#7a3b22" d="M333.538866,161.682501L361.759694,168.195l18.572682,34.733326q-29.909254,40.522215-30.632865,40.522215t-24.120366-4.100462l7.959721-77.667578Z" />
                    <path className="skin-overlay" fill="url(#skin_back_3)" d="M333.538866,161.682501L361.759694,168.195l18.572682,34.733326q-29.909254,40.522215-30.632865,40.522215t-24.120366-4.100462l7.959721-77.667578Z" />
                    <g className="skin-layer" opacity={skinOpacity}>
                      <AutoSkinImage href={skinUrl('back_3')} clipId="clip_back_3" />
                    </g>
                  </g>
                </g>
                <path fill="#6b401b" stroke="#3f5787" strokeWidth="1.564" d="M229.574001,388.971567l40.200477,15.118026q68.218991,4.872785,68.828089,4.872785c.609098,0,12.791061-19.990812,14.009257-19.990812q1.218196,0,15.227453-9.700039l15.227453-38.528143q15.836551-28.018515,15.836551-28.627613t4.872785-42.63687l14.618354-41.418674-4.872786-45.073264-30.454904-23.754828-25.582127-4.872785-7.918276,3.04549-13.400159-7.918276q-28.627611,7.918276-29.23671,7.918276t-62.737109,20.100239l-61.518912,43.245968l15.227453,63.955305l20.709337,60.909814l10.963767,18.272944.000007,25.082457Z" />
                <path className="skin-overlay" fill="url(#skin_body)" d="M229.574001,388.971567l40.200477,15.118026q68.218991,4.872785,68.828089,4.872785c.609098,0,12.791061-19.990812,14.009257-19.990812q1.218196,0,15.227453-9.700039l15.227453-38.528143q15.836551-28.018515,15.836551-28.627613t4.872785-42.63687l14.618354-41.418674-4.872786-45.073264-30.454904-23.754828-25.582127-4.872785-7.918276,3.04549-13.400159-7.918276q-28.627611,7.918276-29.23671,7.918276t-62.737109,20.100239l-61.518912,43.245968l15.227453,63.955305l20.709337,60.909814l10.963767,18.272944.000007,25.082457Z" />

                {/* --- IMAGE SKIN OVERLAY --- */}
                <g className="skin-layer" opacity={skinOpacity}>
                  <AutoSkinImage href={skinUrl('body_main')} clipId="clip_body" opacity={0.96} />
                </g>

              </g>

              {/* SPRINGY LEGS (1-3) */}
              <g transform="translate(210.0, 241.6)">
                <g id="leg1_main" transform="rotate(0)">
                  <g transform="translate(-210.0, -241.6)">
                    <path fill="#bc3b0c" stroke="#3f5787" strokeWidth="1.564" d="M77.688745,359.543627v19.727901l-3.079013,41.033058l37.029147-7.082923l16.490066-13.906243l19.948221-35.426307l24.641222-40.658867l5.619927-19.885899l19.562579-24.119874c0,0,18.465121-51.880911,18.465121-51.880911s-43.022997-4.111663-43.022997-4.111663-15.44289,8.927921-15.684186,8.927921q-.241296,0-12.54735,6.51497l-24.667907,48.917544-23.011702,33.07932-3.595578,15.820545L80.545309,348.47447q0,8.669895,0,8.429064t-2.856564,2.640093Z" />
                    <path className="skin-overlay" fill="url(#skin_leg1_main)" d="M77.688745,359.543627v19.727901l-3.079013,41.033058l37.029147-7.082923l16.490066-13.906243l19.948221-35.426307l24.641222-40.658867l5.619927-19.885899l19.562579-24.119874c0,0,18.465121-51.880911,18.465121-51.880911s-43.022997-4.111663-43.022997-4.111663-15.44289,8.927921-15.684186,8.927921q-.241296,0-12.54735,6.51497l-24.667907,48.917544-23.011702,33.07932-3.595578,15.820545L80.545309,348.47447q0,8.669895,0,8.429064t-2.856564,2.640093Z" />
                    <g className="skin-layer" opacity={skinOpacity}>
                      <AutoSkinImage href={skinUrl('leg1_main')} clipId="clip_leg1_main" opacity={0.94} />
                    </g>
                    <g transform="translate(105.9, 407.9)">
                      <g id="leg1_foot" transform="rotate(0)" className="cursor-grab active:cursor-grabbing">
                        <g transform="translate(-105.9, -407.9)">
                          <path fill="#8f2a05" stroke="#3f5787" strokeWidth="1.564" d="M57.31866,594.612388l20.370082,1.940008l26.190105-3.880016l18.430073-93.120374l5.820024-34.92014-2.910012-34.92014-13.580055-16.490066q-33.950136-24.250098-34.92014-24.250098t-25.220101-9.700039q-4.85002,12.61005-4.85002,13.580054c0,.970004-2.910011,31.040124-2.910011,35.890143s1.940006,41.710166,1.940006,43.650174q0,1.940008,11.640049,122.220494Z" />
                          <path className="skin-overlay" fill="url(#skin_leg1_foot)" d="M57.31866,594.612388l20.370082,1.940008l26.190105-3.880016l18.430073-93.120374l5.820024-34.92014-2.910012-34.92014-13.580055-16.490066q-33.950136-24.250098-34.92014-24.250098t-25.220101-9.700039q-4.85002,12.61005-4.85002,13.580054c0,.970004-2.910011,31.040124-2.910011,35.890143s1.940006,41.710166,1.940006,43.650174q0,1.940008,11.640049,122.220494Z" />
                          <g className="skin-layer" opacity={skinOpacity}>
                            <AutoSkinImage href={skinUrl('leg1_foot')} clipId="clip_leg1_foot" opacity={0.94} />
                          </g>
                        </g>
                      </g>
                    </g>
                  </g>
                </g>
              </g>

              <g transform="translate(225.4, 292.2)">
                <g id="leg2_main" transform="rotate(0)">
                  <g transform="translate(-225.4, -292.2)">
                    <path fill="#e0a12e" stroke="#3f5787" strokeWidth="1.564" d="M230.881672,292.327454l-6.991364,48.648243.582613,14.274035-32.335059,40.200345-18.934945,11.94358-13.400115-.291307-11.943581-12.526195-9.613127-22.721933l3.495682-41.948186l22.139321-32.33506l34.665514-43.113413l34.082901-5.243523-1.74784,43.113414Z" />
                    <path className="skin-overlay" fill="url(#skin_leg2_main)" d="M230.881672,292.327454l-6.991364,48.648243.582613,14.274035-32.335059,40.200345-18.934945,11.94358-13.400115-.291307-11.943581-12.526195-9.613127-22.721933l3.495682-41.948186l22.139321-32.33506l34.665514-43.113413l34.082901-5.243523-1.74784,43.113414Z" />
                    <g className="skin-layer" opacity={skinOpacity}>
                      <AutoSkinImage href={skinUrl('leg2_main')} clipId="clip_leg2_main" opacity={0.94} />
                    </g>
                    <g transform="translate(171.1, 381.1)">
                      <g id="leg2_foot" transform="rotate(0)" className="cursor-grab active:cursor-grabbing">
                        <g transform="translate(-171.1, -381.1)">
                          <path fill="#a8741f" stroke="#3f5787" strokeWidth="1.564" d="M178.442654,572.187031q10.975283,2.743821,11.524047,2.926742t11.341125-4.938878l-3.109663-8.048541l2.377978-5.304721q-4.390113-9.694834-4.755956-10.426519t-.548765-14.267868q9.32899-12.438656,9.511912-12.621577t3.658428-21.218881l-1.829214-7.316855l2.377978-5.853484q0-47.559561,0-48.108325t-4.207192-49.754617L188.24038,367.040693l-40.014054,8.002811.285815,21.150286l7.716996,32.011242l5.716293,10.289328l5.716294,9.14607-2.235794,9.128205l3.58371,10.613296-2.48103,5.926905.689175,12.405151-.137835,24.948135l1.92969,4.962061l1.516185,35.561431l5.23773,17.229376l2.679099,3.772041Z" />
                          <path className="skin-overlay" fill="url(#skin_leg2_foot)" d="M178.442654,572.187031q10.975283,2.743821,11.524047,2.926742t11.341125-4.938878l-3.109663-8.048541l2.377978-5.304721q-4.390113-9.694834-4.755956-10.426519t-.548765-14.267868q9.32899-12.438656,9.511912-12.621577t3.658428-21.218881l-1.829214-7.316855l2.377978-5.853484q0-47.559561,0-48.108325t-4.207192-49.754617L188.24038,367.040693l-40.014054,8.002811.285815,21.150286l7.716996,32.011242l5.716293,10.289328l5.716294,9.14607-2.235794,9.128205l3.58371,10.613296-2.48103,5.926905.689175,12.405151-.137835,24.948135l1.92969,4.962061l1.516185,35.561431l5.23773,17.229376l2.679099,3.772041Z" />
                          <g className="skin-layer" opacity={skinOpacity}>
                            <AutoSkinImage href={skinUrl('leg2_foot')} clipId="clip_leg2_foot" opacity={0.95} />
                          </g>
                        </g>
                      </g>
                    </g>
                  </g>
                </g>
              </g>

              <g transform="translate(391.6, 242.0)">
                <g id="leg3_main" transform="rotate(0)">
                  <g transform="translate(-391.6, -242.0)">
                    <path fill="#7a1f2b" stroke="#3f5787" strokeWidth="1.564" d="M386.547507,227.873827l34.708138,8.23583l28.825403,64.121814l11.76547,33.531591l7.059281,47.061882l1.176547,39.414326-2.353095,10.588924-10.000651,5.29446-11.765471-3.529642-23.530943-35.296413-34.119865-58.23908-5.294463-24.707489-16.471659-28.825404l20.001308-57.650799Z" />
                    <path className="skin-overlay" fill="url(#skin_leg3_main)" d="M386.547507,227.873827l34.708138,8.23583l28.825403,64.121814l11.76547,33.531591l7.059281,47.061882l1.176547,39.414326-2.353095,10.588924-10.000651,5.29446-11.765471-3.529642-23.530943-35.296413-34.119865-58.23908-5.294463-24.707489-16.471659-28.825404l20.001308-57.650799Z" />
                    <g className="skin-layer" opacity={skinOpacity}>
                      <AutoSkinImage href={skinUrl('leg3_main')} clipId="clip_leg3_main" opacity={0.94} />
                    </g>
                    <g transform="translate(455.5, 422.4)">
                      <g id="leg3_foot" transform="rotate(0)" className="cursor-grab active:cursor-grabbing">
                        <g transform="translate(-455.5, -422.4)">
                          <path fill="#521520" stroke="#3f5787" strokeWidth="1.564" d="M487.135718,504.801547q-14.265336-40.708404-14.613271-40.708404t-14.961206-16.005012l-30.966219-49.05884-11.829791,3.131414l18.092621,76.197771-5.56696,8.002504.347935,10.090115l8.698376,28.530672q25.399257,49.406786,25.747193,49.406786t18.092622-4.523155l-1.043806-24.007517v-35.837308l8.002506-5.219026Z" />
                          <path fill="#e08a2e" stroke="#3f5787" strokeWidth="2" d="M461.453762,468.892973l6.51374,52.959534l15.590109-12.334338.564854-5.64854-4.8954-57.991668l2.353558-50.711328-8.472809-9.571136-11.297078-7.060674l1.255231,63.075353l3.451885,15.06277-5.06409,12.220027Z" />
                          <path className="skin-overlay" fill="url(#skin_leg3_foot)" d="M487.135718,504.801547q-14.265336-40.708404-14.613271-40.708404t-14.961206-16.005012l-30.966219-49.05884-11.829791,3.131414l18.092621,76.197771-5.56696,8.002504.347935,10.090115l8.698376,28.530672q25.399257,49.406786,25.747193,49.406786t18.092622-4.523155l-1.043806-24.007517v-35.837308l8.002506-5.219026Z" />
                          <path className="skin-overlay" fill="url(#skin_leg3_foot_small)" d="M461.453762,468.892973l6.51374,52.959534l15.590109-12.334338.564854-5.64854-4.8954-57.991668l2.353558-50.711328-8.472809-9.571136-11.297078-7.060674l1.255231,63.075353l3.451885,15.06277-5.06409,12.220027Z" />
                          <g className="skin-layer" opacity={skinOpacity}>
                            <AutoSkinImage href={skinUrl('leg3_foot')} clipId="clip_leg3_foot" opacity={0.94} />
                            <AutoSkinImage href={skinUrl('leg3_foot_small')} clipId="clip_leg3_foot_small" opacity={0.86} />
                          </g>
                        </g>
                      </g>
                    </g>
                  </g>
                </g>
              </g>

              {/* STIFF HANDS (FK) */}
              <g transform="translate(235.463, 228.269)">
                <g id="hand1_main" transform="rotate(4.546)" className="cursor-grab active:cursor-grabbing">
                  <g transform="translate(-235.463, -228.269)">
                    <path fill="#d98a2b" stroke="#3f5787" strokeWidth="1.564" d="M217.133362,209.258326l20.219025.56164l26.9587,8.986233-1.123279,12.35607-24.712142,47.177726-42.12297,56.163959-14.04099,10.109513-32.575098-2.808199-3.369837-30.890179l8.424594-21.903945.561639-8.424595l11.232792-13.479351l15.164269-23.027225l18.534107-15.72591l16.84919-19.095737Z" />
                    <path className="skin-overlay" fill="url(#skin_hand1_main)" d="M217.133362,209.258326l20.219025.56164l26.9587,8.986233-1.123279,12.35607-24.712142,47.177726-42.12297,56.163959-14.04099,10.109513-32.575098-2.808199-3.369837-30.890179l8.424594-21.903945.561639-8.424595l11.232792-13.479351l15.164269-23.027225l18.534107-15.72591l16.84919-19.095737Z" />
                    <g className="skin-layer" opacity={skinOpacity}>
                      <AutoSkinImage href={skinUrl('hand1_main')} clipId="clip_hand1_main" opacity={0.93} />
                    </g>
                    <g transform="translate(143.8, 345.9)">
                      <g id="hand1_foot" transform="rotate(-4.629)" className="cursor-grab active:cursor-grabbing">
                        <g transform="translate(-143.8, -345.9)">
                          <path fill="#a8641f" stroke="#3f5787" strokeWidth="1.564" d="M132.197009,310.597424q.551051,0,13.225217,0l32.511989,19.837824l28.103584,36.369345l69.983436,85.963905-.551051,27.552533-18.184672,3.306303-77.147095-56.758219L173.525809,414.746l-36.369344-31.409889-23.144129-32.51199-5.510508-21.490976q8.816812-4.959456,9.918913-5.510507c1.102101-.551051,13.225215-13.225214,13.776268-13.225214Z" />
                          <path className="skin-overlay" fill="url(#skin_hand1_foot)" d="M132.197009,310.597424q.551051,0,13.225217,0l32.511989,19.837824l28.103584,36.369345l69.983436,85.963905-.551051,27.552533-18.184672,3.306303-77.147095-56.758219L173.525809,414.746l-36.369344-31.409889-23.144129-32.51199-5.510508-21.490976q8.816812-4.959456,9.918913-5.510507c1.102101-.551051,13.225215-13.225214,13.776268-13.225214Z" />
                          <g className="skin-layer" opacity={skinOpacity}>
                            <AutoSkinImage href={skinUrl('hand1_foot')} clipId="clip_hand1_foot" opacity={0.93} />
                          </g>
                        </g>
                      </g>
                    </g>
                  </g>
                </g>
              </g>

              <g transform="translate(402.1, 201.3)">
                <g id="hand2_main" transform="rotate(0)" className="cursor-grab active:cursor-grabbing">
                  <g transform="translate(-402.1, -201.3)">
                    <path fill="#8c4f2a" stroke="#3f5787" strokeWidth="1.564" d="M384.030066,199.383119q2.86216,4.29324,11.925667,30.05268l21.466198,26.236466q22.897279,14.310801,22.897279,14.787827t.954053,9.063505l61.059413,52.472933q7.632427,0,8.109453,0c.477026,0,12.879718-1.908108,13.356745-2.385134q.477027-.477026,10.971613-16.695933l-28.144573-55.335092Q488.4989,239.930385,488.4989,239.453358t-7.632428-19.558093q-20.512148-12.402693-22.897281-12.87972c-2.385133-.477027-11.44864-12.402693-11.44864-12.87972q0-.477027-23.374308-9.063506l-29.098627-.000001q-12.879714,10.017555-10.01755,14.310801Z" />
                    <path className="skin-overlay" fill="url(#skin_hand2_main)" d="M384.030066,199.383119q2.86216,4.29324,11.925667,30.05268l21.466198,26.236466q22.897279,14.310801,22.897279,14.787827t.954053,9.063505l61.059413,52.472933q7.632427,0,8.109453,0c.477026,0,12.879718-1.908108,13.356745-2.385134q.477027-.477026,10.971613-16.695933l-28.144573-55.335092Q488.4989,239.930385,488.4989,239.453358t-7.632428-19.558093q-20.512148-12.402693-22.897281-12.87972c-2.385133-.477027-11.44864-12.402693-11.44864-12.87972q0-.477027-23.374308-9.063506l-29.098627-.000001q-12.879714,10.017555-10.01755,14.310801Z" />
                    <g className="skin-layer" opacity={skinOpacity}>
                      <AutoSkinImage href={skinUrl('hand2_main')} clipId="clip_hand2_main" opacity={0.93} />
                    </g>
                    <g transform="translate(507.2, 303.7)">
                      <g id="hand2_foot" transform="rotate(0)" className="cursor-grab active:cursor-grabbing">
                        <g transform="translate(-507.2, -303.7)">
                          <path fill="#5e341b" stroke="#3f5787" strokeWidth="1.564" d="M512.827264,316.731677l26.713493-8.109453q20.989173-24.32836,21.466199-27.667547c.477026-3.339187,24.805386-62.013465,24.805386-62.490492q0-.477027,24.805386-77.755346L589.628555,120.67372l-10.01756.954052-17.172959,26.713492-56.289146,94.451277q-.477027,8.586479,0,9.063506t4.770266,20.03512l-17.172959,8.586479l19.081067,36.254031Z" />
                          <path className="skin-overlay" fill="url(#skin_hand2_foot)" d="M512.827264,316.731677l26.713493-8.109453q20.989173-24.32836,21.466199-27.667547c.477026-3.339187,24.805386-62.013465,24.805386-62.490492q0-.477027,24.805386-77.755346L589.628555,120.67372l-10.01756.954052-17.172959,26.713492-56.289146,94.451277q-.477027,8.586479,0,9.063506t4.770266,20.03512l-17.172959,8.586479l19.081067,36.254031Z" />
                          <g className="skin-layer" opacity={skinOpacity}>
                            <AutoSkinImage href={skinUrl('hand2_foot')} clipId="clip_hand2_foot" opacity={0.94} flip />
                          </g>
                        </g>
                      </g>
                    </g>
                  </g>
                </g>
              </g>

            </g>
          </g>
        </svg>
      </div>
      </div>
      </div>
    </div>
  );
}

