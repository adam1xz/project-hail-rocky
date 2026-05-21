// Generates app icons from SKIN/rocky.svg
// Usage: npm run generate-icons
// Requires: sharp (npm i -D sharp), png-to-ico (npm i -D png-to-ico)

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import pngToIco from 'png-to-ico';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SVG_PATH   = path.join(__dirname, '../SKIN/rocky.svg');
const PUBLIC_DIR = path.join(__dirname, '../public');

function prepSvg(svgSrc) {
  return svgSrc
    .replace(/fill="[^"]*"/g, 'fill="#7a3a1e"')
    .replace(/stroke="[^"]*"/g, 'stroke="#3f1f0c"')
    .replace(/fill:[^;}"']*/g, 'fill:#7a3a1e')
    .replace(/stroke:[^;}"']*/g, 'stroke:#3f1f0c');
}

async function main() {
  if (!fs.existsSync(SVG_PATH)) {
    console.error('SVG not found:', SVG_PATH);
    process.exit(1);
  }

  const svgBuf = Buffer.from(prepSvg(fs.readFileSync(SVG_PATH, 'utf8')));

  // Render at high resolution then trim transparent padding so Rocky fills the frame
  const masterBuf = await sharp(svgBuf, { density: 300 })
    .resize(1024, 1024, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png().toBuffer();

  const trimmedBuf = await sharp(masterBuf)
    .trim({ threshold: 10 })
    .png().toBuffer();

  const png512 = await sharp(trimmedBuf)
    .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png().toBuffer();
  fs.writeFileSync(path.join(PUBLIC_DIR, 'icon.png'), png512);
  console.log('Written: public/icon.png (512x512)');

  const png32 = await sharp(trimmedBuf)
    .resize(32, 32, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png().toBuffer();
  fs.writeFileSync(path.join(PUBLIC_DIR, 'tray-icon.png'), png32);
  console.log('Written: public/tray-icon.png (32x32)');

  const sizes = [16, 32, 48, 64, 128, 256];
  const pngBuffers = await Promise.all(sizes.map(size =>
    sharp(trimmedBuf)
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png().toBuffer()
  ));
  const icoBuffer = await pngToIco(pngBuffers);
  fs.writeFileSync(path.join(PUBLIC_DIR, 'icon.ico'), icoBuffer);
  console.log('Written: public/icon.ico (16/32/48/64/128/256px)');
}

main().catch(e => { console.error(e); process.exit(1); });
