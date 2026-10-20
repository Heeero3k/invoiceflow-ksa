// Generates InvoiceFlow KSA logo SVGs ("Ink & Champagne": navy #0F1B2D, gold #B08A4E, ivory #F6F4EF).
const fs = require("fs");
const path = require("path");
const out = __dirname;

const NAVY = "#0F1B2D", GOLD = "#B08A4E", GOLD_LIGHT = "#D9BC86", IVORY = "#F6F4EF";

// Mark drawn in a 1024 space; its bounding box is roughly x 300..830, y 210..870 (centre 565,540).
function zigzag(x0, x1, yBase, depth, teeth) {
  const w = (x1 - x0) / teeth;
  let d = "";
  for (let i = teeth; i > 0; i--) {
    d += ` L${x0 + (i - 0.5) * w},${yBase - depth} L${x0 + (i - 1) * w},${yBase}`;
  }
  return d;
}

function qr(x, y, size, color) {
  // Small stylised QR: three finder squares + a few modules.
  const m = size / 7;
  const finder = (fx, fy) =>
    `<rect x="${fx}" y="${fy}" width="${m * 3}" height="${m * 3}" rx="${m * 0.5}" fill="none" stroke="${color}" stroke-width="${m * 0.7}"/>` +
    `<rect x="${fx + m}" y="${fy + m}" width="${m}" height="${m}" fill="${color}"/>`;
  const dots = [[4, 4], [6, 4], [5, 5], [4, 6], [6, 6]]
    .map(([cx, cy]) => `<rect x="${x + cx * m}" y="${y + cy * m}" width="${m}" height="${m}" fill="${color}"/>`).join("");
  return finder(x, y) + finder(x + m * 4, y) + finder(x, y + m * 4) + dots;
}

function mark({ mono = false } = {}) {
  const paper = mono ? "#fff" : "url(#paper)";
  const ink = mono ? "#000" : NAVY;
  const soft = mono ? "#000" : "#C9CFD8";
  const gold = mono ? "#fff" : "url(#gold)";
  const L = 310, R = 720, T = 210, B = 800;
  const receipt = `M${L + 44},${T} H${R - 44} Q${R},${T} ${R},${T + 44} V${B}${zigzag(L, R, B, 34, 8)} V${T + 44} Q${L},${T} ${L + 44},${T} Z`;
  const lines = mono ? "" : `
    <rect x="362" y="290" width="190" height="34" rx="17" fill="${ink}"/>
    <rect x="362" y="350" width="130" height="20" rx="10" fill="${soft}"/>
    ${qr(574, 284, 98, ink)}
    <rect x="362" y="438" width="306" height="20" rx="10" fill="${soft}"/>
    <rect x="362" y="490" width="306" height="20" rx="10" fill="${soft}"/>
    <rect x="362" y="542" width="220" height="20" rx="10" fill="${soft}"/>
    <rect x="362" y="626" width="150" height="40" rx="20" fill="${GOLD}"/>`;
  // Gold seal with a check, cut out of the paper by a navy ring.
  const cx = 712, cy = 748, r = 124;
  const seal = mono
    ? `<circle cx="${cx}" cy="${cy}" r="${r + 26}" fill="#000"/><circle cx="${cx}" cy="${cy}" r="${r}" fill="#fff"/>
       <path d="M${cx - 58},${cy + 2} L${cx - 16},${cy + 44} L${cx + 62},${cy - 40}" fill="none" stroke="#000" stroke-width="34" stroke-linecap="round" stroke-linejoin="round"/>`
    : `<circle cx="${cx}" cy="${cy}" r="${r + 26}" fill="${NAVY}"/><circle cx="${cx}" cy="${cy}" r="${r}" fill="${gold}"/>
       <circle cx="${cx}" cy="${cy}" r="${r - 14}" fill="none" stroke="${GOLD_LIGHT}" stroke-opacity=".55" stroke-width="4"/>
       <path d="M${cx - 58},${cy + 2} L${cx - 16},${cy + 44} L${cx + 62},${cy - 40}" fill="none" stroke="${NAVY}" stroke-width="34" stroke-linecap="round" stroke-linejoin="round"/>`;
  // Monochrome icons are alpha masks: punch the ring and the check out of the silhouette.
  if (mono) return `<mask id="mono"><path d="${receipt}" fill="#fff"/>${seal}</mask><rect x="0" y="0" width="1024" height="1024" fill="#fff" mask="url(#mono)"/>`;
  return `<path d="${receipt}" fill="${paper}"/>${lines}${seal}`;
}

const defs = `<defs>
  <radialGradient id="bg" cx="35%" cy="25%" r="90%"><stop offset="0" stop-color="#22385A"/><stop offset=".55" stop-color="#14233A"/><stop offset="1" stop-color="${NAVY}"/></radialGradient>
  <linearGradient id="paper" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="${IVORY}"/></linearGradient>
  <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#E4C894"/><stop offset=".5" stop-color="${GOLD}"/><stop offset="1" stop-color="#8E6B36"/></linearGradient>
  <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="18" stdDeviation="22" flood-color="#000" flood-opacity=".35"/></filter>
</defs>`;

const centred = (size, scale, inner) =>
  `<g transform="translate(${size / 2} ${size / 2}) scale(${scale}) translate(-515 -540)">${inner}</g>`;

const svg = (size, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${defs}${body}</svg>`;

const files = {
  // Full-bleed square (iOS / Play store icon; the stores round the corners themselves).
  icon: svg(1024, `<rect width="1024" height="1024" fill="url(#bg)"/>${centred(1024, 1.02, `<g filter="url(#shadow)">${mark()}</g>`)}`),
  "store-icon": svg(512, `<rect width="512" height="512" fill="url(#bg)"/>${centred(512, 0.51, `<g filter="url(#shadow)">${mark()}</g>`)}`),
  // Android adaptive icon: mark kept inside the 66% safe zone.
  "android-icon-foreground": svg(512, centred(512, 0.38, `<g filter="url(#shadow)">${mark()}</g>`)),
  "android-icon-background": svg(512, `<rect width="512" height="512" fill="url(#bg)"/>`),
  "android-icon-monochrome": svg(432, centred(432, 0.32, mark({ mono: true }))),
  // Splash: rounded tile so it reads on both light and dark splash backgrounds.
  "splash-icon": svg(1024, `<rect x="112" y="112" width="800" height="800" rx="200" fill="url(#bg)"/>${centred(1024, 0.78, mark())}`),
  favicon: svg(48, `<rect width="48" height="48" rx="10" fill="url(#bg)"/>${centred(48, 0.06, mark())}`),
};
for (const [name, s] of Object.entries(files)) fs.writeFileSync(path.join(out, `${name}.svg`), s);
console.log(Object.keys(files).join(" "));
