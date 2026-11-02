/**
 * EVALUATE — "guess the level" perception check (v1.5.22).
 *
 * The player sizes up an NPC: a hidden d20 perception roll against a
 * difficulty equal to the NPC's level (TN = level × 3, standard Cypher
 * resolution — same math the Cypher Taskbar uses for its skill rolls).
 * The die is rolled programmatically; no chat message is created, so
 * players never see the raw result.
 *
 * Outcomes:
 *   success       → three-number level estimate (true level is inside the
 *                   window but not always centred — reads as a genuine guess)
 *   natural 20    → exact level
 *   failure       → nothing (the GM gets a console + notification line)
 *   natural 1     → an outright lie, 2–3 levels too high or too low
 *
 * If the evaluating PC carries a skill whose name matches /percept/i the
 * skill rating shifts the difficulty (specialized −2, trained −1,
 * inability +1 — mirroring the Cypher System ease / hinder steps), read
 * from the same `system.basic.rating` field the Cypher Taskbar uses.
 * No pool points are spent — this is a quick read, not a committed
 * Effort roll.
 *
 * @module evaluate
 */

import { MODULE_ID } from "./constants.js";

/** How long the estimate chip lingers above the token (ms). */
const CHIP_TTL = 5200;

/**
 * Run the EVALUATE action for a token: hidden perception roll vs NPC level.
 * @param {Token} token  The clicked canvas token (the NPC being sized up)
 */
export async function evaluateNPC(token) {
  const npcActor = token?.actor;
  const npcName = token?.document?.name ?? npcActor?.name ?? "?";

  // --- Read the NPC's true level ---
  const rawLevel = Number(npcActor?.system?.level ?? npcActor?.system?.basic?.level);
  if (!Number.isFinite(rawLevel) || rawLevel <= 0) {
    ui.notifications.warn(
      game.i18n.format("CYPHERADVANCEDTOKEN.EVALUATE.noLevel", { name: npcName })
    );
    return;
  }
  const trueLevel = Math.max(1, Math.min(10, Math.round(rawLevel)));

  // --- Who evaluates? The player's controlled / assigned PC ---
  const pcActor = _evaluatingActor();
  if (!pcActor) {
    ui.notifications.warn(game.i18n.localize("CYPHERADVANCEDTOKEN.EVALUATE.noPC"));
    return;
  }

  // --- Perception skill → ease/hinder steps ---
  const skillSteps = _perceptionSteps(pcActor);

  // --- Hidden d20 roll (no chat message — invisible to players) ---
  const roll = new Roll("1d20");
  await roll.evaluate();
  const die = roll.dice?.[0]?.results?.[0]?.result ?? roll.total;

  // --- Cypher resolution: final difficulty → TN ---
  const difficulty = Math.max(0, Math.min(10, trueLevel - skillSteps));
  const tn = difficulty * 3;
  const isNat1 = die === 1;
  const isNat20 = die === 20;
  const success = die >= tn;

  console.log(
    `[${MODULE_ID}] EVALUATE  ${pcActor.name} → ${npcName} | true L${trueLevel} | ` +
    `skill ${skillSteps >= 0 ? "+" : ""}${skillSteps} | eff diff ${difficulty} (TN ${tn}) | ` +
    `rolled ${die} → ${isNat1 ? "NAT-1 LIE" : isNat20 ? "NAT-20 EXACT" : success ? "SUCCESS" : "FAIL"}`
  );

  // --- Outcome ---
  let estimate;
  let tier; // "exact" | "range" | "lie"
  if (isNat1) {
    tier = "lie";
    estimate = _lieEstimate(trueLevel);
  } else if (isNat20) {
    tier = "exact";
    estimate = String(trueLevel);
  } else if (success) {
    tier = "range";
    estimate = _rangeEstimate(trueLevel);
  } else {
    // Failure — the player gleans nothing. GM hears about it.
    if (game.user?.isGM) {
      ui.notifications.info(
        game.i18n.format("CYPHERADVANCEDTOKEN.EVALUATE.gmFail", {
          name: npcName, die, tn
        })
      );
    }
    return;
  }

  _showEstimateChip(token, npcName, estimate, tier);
}

/* -------------------------------------------- */
/*  Internals                                   */
/* -------------------------------------------- */

/**
 * The actor performing the evaluation: controlled token → user's assigned
 * character → any owned PC. GMs already know the level — no modifier.
 */
function _evaluatingActor() {
  const controlled = canvas.tokens?.controlled?.[0]?.actor;
  if (controlled) return controlled;
  if (game.user?.character) return game.user.character;
  return game.actors?.find((a) => a.type === "pc" && a.isOwner) ?? null;
}

/**
 * Ease steps granted by the best perception-matching skill on the PC.
 * The Cypher system stores the rating at `system.basic.rating` (fallback
 * `system.rating`); values mirror the proven cypher-taskbar mapping:
 *   specialized → 2, trained/practiced → 1, inability → −1, else 0.
 * Positive numbers ease the difficulty (lower it); negative hinder.
 */
function _perceptionSteps(actor) {
  if (!actor || actor.type !== "pc") return 0;
  const stepsFrom = (item) => {
    const raw = String(item?.system?.basic?.rating ?? item?.system?.rating ?? "")
      .trim()
      .toLowerCase();
    if (["specialized", "specialised"].includes(raw)) return 2;
    if (["practiced", "practised", "trained"].includes(raw)) return 1;
    if (["inability", "hindered", "hindrance"].includes(raw)) return -1;
    return 0;
  };
  const skills =
    actor.items?.filter(
      (i) => i.type === "skill" && /percept/i.test(i.name ?? "")
    ) ?? [];
  if (!skills.length) return 0;
  return Math.max(...skills.map(stepsFrom));
}

/**
 * Three-consecutive-number range that CONTAINS the true level but does
 * not always centre it: offset shifts the window so repeat evaluations
 * of the same NPC don't read like a lookup table. Clamped to 1–10.
 *   L5 → "4–6" | "5–7" | "3–5"
 */
function _rangeEstimate(trueLevel) {
  const offsets = [-1, 0, 1];
  const off = offsets[Math.floor(Math.random() * offsets.length)];
  let lo = trueLevel + off;
  lo = Math.max(1, Math.min(8, lo)); // keep hi = lo + 2 ≤ 10
  const hi = Math.min(10, lo + 2);
  return `${lo}–${hi}`;
}

/**
 * Natural-1 lie: a confidently wrong single number, shifted 2–3 away from
 * truth in a random direction (clamped 1–10 so the lie stays plausible).
 */
function _lieEstimate(trueLevel) {
  const dir = Math.random() < 0.5 ? -1 : 1;
  const mag = 2 + Math.floor(Math.random() * 2); // 2 or 3
  return String(Math.max(1, Math.min(10, trueLevel + dir * mag)));
}

/**
 * Floating estimate chip pinned above the token — same lifecycle pattern
 * as the RANGE chip (CSS transition in, timed fade-out, self-remove).
 * Tier colours: exact = gold, range = teal, lie = rose (indistinguishable
 * from "range" to the player — the lie must look like a real read).
 */
function _showEstimateChip(token, npcName, estimate, tier) {
  document.querySelectorAll(".cat-evalchip").forEach((el) => el.remove());

  const anchor = _tokenTopClient(token);
  if (!anchor) return;

  const chip = document.createElement("div");
  chip.className = `cat-evalchip cat-evalchip-${tier}`;

  const icon =
    tier === "exact" ? "fa-bullseye" : tier === "lie" ? "fa-eye" : "fa-gauge-high";
  const label = game.i18n.localize(`CYPHERADVANCEDTOKEN.EVALUATE.tier.${tier}`);

  chip.innerHTML = `
    <i class="fas ${icon} cat-evalchip-icon"></i>
    <div class="cat-evalchip-text">
      <span class="cat-evalchip-name">${foundry.utils.escapeHTML(npcName)}</span>
      <span class="cat-evalchip-est">${foundry.utils.escapeHTML(estimate)}</span>
      <span class="cat-evalchip-label">${foundry.utils.escapeHTML(label)}</span>
    </div>
  `;
  chip.style.left = `${Math.round(anchor.x)}px`;
  chip.style.top = `${Math.round(anchor.y)}px`;
  document.body.appendChild(chip);

  requestAnimationFrame(() => chip.classList.add("cat-evalchip-visible"));

  setTimeout(() => {
    chip.classList.remove("cat-evalchip-visible");
    setTimeout(() => chip.remove(), 400);
  }, CHIP_TTL);
}

/**
 * Token top-centre in client (viewport) coordinates — geometry shared
 * with the radial menu's anchor logic.
 */
function _tokenTopClient(token) {
  try {
    let c = token.center;
    if (!c && typeof token.getCenter === "function") c = token.getCenter();
    if (!c) return null;
    const h = token.h ?? token.document?.height ?? 0;
    const wt = canvas.tokens?.worldTransform;
    if (!wt) return null;
    const pt = wt.apply(new globalThis.PIXI.Point(c.x, c.y - h / 2));
    const rect = canvas.app.view.getBoundingClientRect();
    return { x: rect.left + pt.x, y: rect.top + pt.y };
  } catch {
    return null;
  }
}
