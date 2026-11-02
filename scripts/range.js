/**
 * Range — Cypher distance bands between tokens (v1.5.8, metric v1.5.10).
 *
 * Measures from the user's controlled token ("your token") to the clicked
 * token and reports the Cypher band: Immediate / Short / Long / Very Long.
 * No state is kept — pure measurement plus a transient floating chip
 * above the target that fades away.
 *
 * Bands (Cypher System core, shown in metric):
 *   Immediate < 3 m (10 ft), Short 3–15 m (10–50 ft),
 *   Long 15–30 m (50–100 ft), Very Long 30 m+ (100–500 ft).
 *
 * @module range
 */

import { MODULE_ID } from "./constants.js";

/** Cypher bands, ordered near → far. `max` in METERS, Infinity for open. */
const BANDS = [
  { max: 3,        i18n: "CYPHERADVANCEDTOKEN.RANGE.immediate", color: "#9fd8a0" },
  { max: 15,       i18n: "CYPHERADVANCEDTOKEN.RANGE.short",     color: "#e8c47a" },
  { max: 30,       i18n: "CYPHERADVANCEDTOKEN.RANGE.long",      color: "#d9915c" },
  { max: Infinity, i18n: "CYPHERADVANCEDTOKEN.RANGE.veryLong",  color: "#c76b8a" }
];

/** Feet → meters, for scenes measured in imperial. */
const FT_TO_M = 0.3048;

/**
 * Resolve the Cypher band for a distance in meters.
 * @param {number} meters
 * @returns {{max:number, i18n:string, color:string}}
 */
export function cypherBand(meters) {
  return BANDS.find((b) => meters < b.max) ?? BANDS[BANDS.length - 1];
}

/**
 * Centre-to-centre distance between two tokens, in METERS.
 * Prefers the V12+ grid `measurePath` (grid-aware); falls back to
 * Euclidean world distance converted through grid scale.
 */
function _distanceMeters(fromToken, toToken) {
  const scene = canvas.scene;
  const a = fromToken.center ?? fromToken.getCenter?.();
  const b = toToken.center ?? toToken.getCenter?.();
  if (!a || !b || !scene) return null;

  const toMeters = (sceneUnits) => {
    const units = scene.grid?.units ?? "m";
    return /^\s*m/i.test(units) ? sceneUnits : sceneUnits * FT_TO_M;
  };

  if (canvas.grid?.measurePath) {
    try {
      const res = canvas.grid.measurePath([{ x: a.x, y: a.y }, { x: b.x, y: b.y }]);
      if (Number.isFinite(res?.distance)) return toMeters(res.distance);
    } catch { /* fall through to Euclidean */ }
  }
  const size = scene.grid?.size || 100;
  const per = scene.grid?.distance || 1;
  const world = Math.hypot(b.x - a.x, b.y - a.y);
  return toMeters((world / size) * per);
}

/**
 * Report range from `fromToken` to `toToken`: floating chip above the
 * target with band + exact distance, plus a console line.
 * @param {Token|null} fromToken  The user's controlled token
 * @param {Token} toToken         The clicked token
 */
export function reportRange(fromToken, toToken) {
  if (!fromToken) {
    ui.notifications.warn(game.i18n.localize("CYPHERADVANCEDTOKEN.RANGE.noToken"));
    return;
  }
  const meters = _distanceMeters(fromToken, toToken);
  if (meters == null) {
    ui.notifications.warn(game.i18n.localize("CYPHERADVANCEDTOKEN.RANGE.noToken"));
    return;
  }

  const band = cypherBand(meters);
  const bandLabel = game.i18n.localize(band.i18n);
  const unitLabel = game.i18n.localize("CYPHERADVANCEDTOKEN.RANGE.m");
  console.log(`[${MODULE_ID}] RANGE: ${fromToken.name} → ${toToken.name} = ${Math.round(meters)} m (${bandLabel})`);

  // Floating chip above the target token
  let left = window.innerWidth / 2;
  let top = window.innerHeight / 2;
  try {
    const b = toToken.getBounds?.();
    const rect = canvas.app.view.getBoundingClientRect();
    if (b) {
      left = rect.left + b.x + b.width / 2;
      top = rect.top + b.y - 8;
    }
  } catch { /* centered fallback */ }

  const chip = document.createElement("div");
  chip.className = "cat-rangechip";
  chip.style.left = `${Math.round(left)}px`;
  chip.style.top = `${Math.round(top)}px`;
  chip.innerHTML = `
    <i class="fas fa-arrows-left-right" style="color:${band.color}"></i>
    <span class="cat-rangechip-band" style="color:${band.color}">${bandLabel}</span>
    <span class="cat-rangechip-dist">· ${Math.round(meters)} ${unitLabel}</span>
  `;
  document.body.appendChild(chip);
  requestAnimationFrame(() => chip.classList.add("cat-rangechip-visible"));

  setTimeout(() => {
    chip.classList.remove("cat-rangechip-visible");
    setTimeout(() => chip.remove(), 300);
  }, 2200);
}
