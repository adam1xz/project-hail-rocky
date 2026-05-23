// Generates installer assets from SKIN/rocky.svg
// Usage: node installer/generate-installer-assets.js
// Requires: sharp (already in devDependencies)

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SVG_PATH    = path.join(__dirname, '../SKIN/rocky.svg');
const ASSETS_DIR  = path.join(__dirname, 'assets');
const PUBLIC_DIR  = path.join(__dirname, '../public');

const PANEL_W = 164;
const PANEL_H = 314;
const BG      = { r: 10, g: 8, b: 20 };   // #0a0814 - deep navy

// Remap all fills to a warm amber, all strokes to dark amber-brown.
// Produces a flat duotone graphic that reads clearly on dark backgrounds.
function duotoneSvg(src) {
  return src
    .replace(/fill="(?!none)([^"]*)"/g, 'fill="#dfa030"')
    .replace(/stroke="([^"]*)"/g,       'stroke="#5c2e06"')
    .replace(/fill:(?!none)([^;}"'\s]*)/g, 'fill:#dfa030')
    .replace(/stroke:([^;}"'\s]*)/g,       'stroke:#5c2e06');
}

async function generateSidePanel() {
  const svgSrc = fs.readFileSync(SVG_PATH, 'utf8');
  const svgBuf = Buffer.from(duotoneSvg(svgSrc));

  // Render at high DPI into a square, then trim transparent padding
  const rendered = await sharp(svgBuf, { density: 300 })
    .resize(600, 600, { fit: 'contain', background: { r:0,g:0,b:0,alpha:0 } })
    .png()
    .toBuffer();

  const trimmed = await sharp(rendered).trim({ threshold: 10 }).png().toBuffer();
  const { width: rW, height: rH } = await sharp(trimmed).metadata();

  // Scale to fill panel, preserving aspect ratio, leaving 8px margin each side
  const maxW = PANEL_W - 16;
  const maxH = PANEL_H - 24;
  const scale = Math.min(maxW / rW, maxH / rH);
  const finalW = Math.round(rW * scale);
  const finalH = Math.round(rH * scale);

  const resized = await sharp(trimmed)
    .resize(finalW, finalH, { fit: 'fill' })
    .png()
    .toBuffer();

  const left = Math.round((PANEL_W - finalW) / 2);
  const top  = Math.round((PANEL_H - finalH) / 2);

  // Composite onto dark background
  const panel = await sharp({
    create: { width: PANEL_W, height: PANEL_H, channels: 3, background: BG }
  })
    .png()
    .composite([{ input: resized, left, top, blend: 'over' }])
    .png()
    .toBuffer();

  const outPath = path.join(ASSETS_DIR, 'side-panel.png');
  fs.writeFileSync(outPath, panel);
  console.log(`Written: side-panel.png  (${PANEL_W}x${PANEL_H})`);
}

async function copyIcon() {
  const src = path.join(PUBLIC_DIR, 'icon.ico');
  const dst = path.join(ASSETS_DIR, 'icon.ico');
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dst);
    console.log('Copied:  icon.ico');
  } else {
    console.warn('WARN: public/icon.ico not found - run "npm run generate-icons" first');
  }
}

async function main() {
  if (!fs.existsSync(SVG_PATH)) { console.error('SVG not found:', SVG_PATH); process.exit(1); }
  fs.mkdirSync(ASSETS_DIR, { recursive: true });
  await generateSidePanel();
  await copyIcon();
  console.log('Done.');
}

main().catch(e => { console.error(e); process.exit(1); });
