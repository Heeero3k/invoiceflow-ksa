// Google Play feature graphic (1024x500) in the logo's "Ink & Champagne" colours.
// Usage: node assets/brand/generate-feature-graphic.js  -> writes feature-graphic.svg next to this file.
const fs = require("fs");
const path = require("path");
const { mark, defs, GOLD, GOLD_LIGHT, IVORY } = require("./generate-logo");

const W = 1024;
const H = 500;

// A spreadsheet card behind the receipt: the Excel file the app produces.
function sheetCard(x, y, w, h) {
  const rows = 7;
  const cols = 4;
  const header = 44;
  const rowH = (h - header - 24) / rows;
  let cells = "";
  for (let r = 0; r < rows; r++) {
    const cy = y + header + 12 + r * rowH;
    cells += `<rect x="${x + 22}" y="${cy + rowH * 0.3}" width="${w * 0.34}" height="${rowH * 0.36}" rx="5" fill="#C9CFD8"/>`;
    cells += `<rect x="${x + w - 22 - w * 0.2}" y="${cy + rowH * 0.3}" width="${w * 0.2}" height="${rowH * 0.36}" rx="5" fill="${r === rows - 1 ? GOLD : "#DDE1E7"}"/>`;
    if (r) cells += `<line x1="${x + 14}" x2="${x + w - 14}" y1="${cy}" y2="${cy}" stroke="#E6E2D8" stroke-width="2"/>`;
  }
  for (let c = 1; c < cols; c++) {
    const cx = x + (w / cols) * c;
    cells += `<line x1="${cx}" x2="${cx}" y1="${y + header}" y2="${y + h - 14}" stroke="#ECE8DF" stroke-width="2"/>`;
  }
  return `<g filter="url(#shadow)"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="26" fill="${IVORY}"/>
    <path d="M${x + 26},${y} H${x + w - 26} Q${x + w},${y} ${x + w},${y + 26} V${y + header} H${x} V${y + 26} Q${x},${y} ${x + 26},${y} Z" fill="#1E7A4C"/>
    <rect x="${x + 22}" y="${y + 14}" width="70" height="16" rx="8" fill="#FFFFFF" fill-opacity=".85"/>${cells}</g>`;
}

function chip(xRight, y, label) {
  const width = 34 + label.length * 11;
  const x = xRight - width;
  return `<rect x="${x}" y="${y}" width="${width}" height="44" rx="22" fill="${GOLD}" fill-opacity=".14" stroke="${GOLD_LIGHT}" stroke-opacity=".55" stroke-width="1.5"/>
    <text x="${x + width / 2}" y="${y + 29}" font-family="IBM Plex Sans Arabic" font-weight="600" font-size="19" fill="${GOLD_LIGHT}" text-anchor="middle">${label}</text>`;
}

function chips(xRight, y, labels, gap = 12) {
  let out = "";
  for (const label of labels) {
    out += chip(xRight, y, label);
    xRight -= 34 + label.length * 11 + gap;
  }
  return out;
}

const textRight = 960;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${defs}
  <defs>
    <radialGradient id="glow" cx="28%" cy="55%" r="45%"><stop offset="0" stop-color="${GOLD}" stop-opacity=".28"/><stop offset="1" stop-color="${GOLD}" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  <g stroke="${GOLD_LIGHT}" stroke-opacity=".07" stroke-width="2">
    ${Array.from({ length: 12 }, (_, i) => `<line x1="${-200 + i * 110}" y1="${H}" x2="${100 + i * 110}" y2="0"/>`).join("")}
  </g>
  <g transform="rotate(-8 230 250)">${sheetCard(90, 105, 300, 300)}</g>
  <g transform="translate(330 262) scale(0.47) translate(-515 -540)"><g filter="url(#shadow)">${mark()}</g></g>
  <text x="${textRight}" y="168" font-family="IBM Plex Sans Arabic" font-weight="700" font-size="62" fill="#FFFFFF" text-anchor="end">InvoiceFlow <tspan fill="${GOLD_LIGHT}">KSA</tspan></text>
  <text x="${textRight}" y="236" font-family="IBM Plex Sans Arabic" font-weight="600" font-size="34" fill="${IVORY}" text-anchor="end" direction="rtl">صوّر فواتيرك دفعة واحدة</text>
  <text x="${textRight}" y="284" font-family="IBM Plex Sans Arabic" font-weight="400" font-size="27" fill="#C9CFD8" text-anchor="end" direction="rtl">جدول مرتّب لكل مشروع، جاهز للمحاسب</text>
  ${chips(textRight, 330, ["قراءة رمز الزكاة", "Excel", "Google Drive"])}
</svg>`;

fs.writeFileSync(path.join(__dirname, "feature-graphic.svg"), svg);
console.log("feature-graphic.svg");
