// Genera los assets sociales del portal con sharp (dependencia transitiva de
// astro). Salida:
//   public/og/raid-dominion.png       1200x630 (Open Graph / Twitter)
//   public/icons/apple-touch-icon.png 180x180
//   public/icons/favicon-32.png       32x32
//
// Uso: node scripts/og-image.mjs
// Los PNG se commitean: el build no depende de ejecutar este script.

import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import sharp from 'sharp';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outOg = resolve(root, 'public/og');
const outIcons = resolve(root, 'public/icons');
const logoPath = resolve(root, 'public/logo.png');

const W = 1200;
const H = 630;

const background = `
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0B1D33"/>
      <stop offset="0.52" stop-color="#07111E"/>
      <stop offset="1" stop-color="#040A12"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.78" cy="0.42" r="0.42">
      <stop offset="0" stop-color="#00BFFF" stop-opacity="0.34"/>
      <stop offset="0.55" stop-color="#0088CC" stop-opacity="0.10"/>
      <stop offset="1" stop-color="#00BFFF" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="line" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#5CA9E8" stop-opacity="0"/>
      <stop offset="0.45" stop-color="#5CA9E8" stop-opacity="0.85"/>
      <stop offset="1" stop-color="#00BFFF" stop-opacity="0"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>

  <!-- Retícula tenue -->
  <g stroke="#5CA9E8" stroke-opacity="0.075" stroke-width="1">
    ${Array.from({ length: 15 }, (_, i) => `<line x1="${i * 86}" y1="0" x2="${i * 86}" y2="${H}"/>`).join('')}
    ${Array.from({ length: 8 }, (_, i) => `<line x1="0" y1="${i * 90}" x2="${W}" y2="${i * 90}"/>`).join('')}
  </g>

  <!-- Cortes diagonales de marca -->
  <path d="M0 0 L430 0 L300 ${H} L0 ${H} Z" fill="#0A1B2E" opacity="0.55"/>
  <path d="M430 0 L470 0 L340 ${H} L300 ${H} Z" fill="#00BFFF" opacity="0.10"/>
  <path d="M0 512 L1200 512" stroke="url(#line)" stroke-width="2" opacity="0.75"/>

  <!-- Halos del logo -->
  <circle cx="1000" cy="310" r="180" fill="#00BFFF" opacity="0.055"/>
  <circle cx="1000" cy="310" r="136" fill="#00BFFF" opacity="0.075"/>

  <text x="76" y="132" font-family="DejaVu Sans, Arial, sans-serif" font-size="22" font-weight="700" letter-spacing="5" fill="#7FC9F2">ADDON · WORLD OF WARCRAFT 3.3.5A</text>
  <text x="72" y="262" font-family="DejaVu Sans, Arial, sans-serif" font-size="92" font-weight="700" font-style="italic" fill="#EAF6FF">RaidDominion</text>
  <text x="76" y="330" font-family="DejaVu Sans, Arial, sans-serif" font-size="31" fill="#B9D9EE">Bandas, hermandades y rosters para WotLK</text>

  <g font-family="DejaVu Sans, Arial, sans-serif" font-size="24" fill="#8FB7D2">
    <text x="76" y="406">✓  Addon gratuito</text>
    <text x="306" y="406">✓  Portal de hermandad</text>
    <text x="626" y="406">✓  SavedVariables</text>
  </g>

  <text x="76" y="560" font-family="DejaVu Sans Mono, monospace" font-size="22" fill="#5CA9E8">raid-dominion.netlify.app</text>
</svg>`;

async function main() {
  await mkdir(outOg, { recursive: true });
  await mkdir(outIcons, { recursive: true });

  const base = await sharp(Buffer.from(background)).png().toBuffer();
  const logo = await sharp(logoPath)
    .resize(280, 280, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  await sharp(base)
    .composite([{ input: logo, left: 860, top: 170 }])
    .png({ compressionLevel: 9 })
    .toFile(resolve(outOg, 'raid-dominion.png'));

  const iconBase = await sharp({
    create: {
      width: 180,
      height: 180,
      channels: 4,
      background: { r: 7, g: 17, b: 30, alpha: 1 },
    },
  })
    .png()
    .toBuffer();
  const iconLogo = await sharp(logoPath)
    .resize(150, 150, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  await sharp(iconBase)
    .composite([{ input: iconLogo, left: 15, top: 15 }])
    .png({ compressionLevel: 9 })
    .toFile(resolve(outIcons, 'apple-touch-icon.png'));

  const faviconLogo = await sharp(logoPath)
    .resize(32, 32, { fit: 'contain', background: { r: 7, g: 17, b: 30, alpha: 1 } })
    .png()
    .toBuffer();
  await sharp(faviconLogo)
    .png({ compressionLevel: 9 })
    .toFile(resolve(outIcons, 'favicon-32.png'));

  console.log('OK: public/og/raid-dominion.png');
  console.log('OK: public/icons/apple-touch-icon.png');
  console.log('OK: public/icons/favicon-32.png');
}

await main();
