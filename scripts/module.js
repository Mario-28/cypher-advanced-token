/**
 * Cypher Advanced Token — Main Entry Point
 *
 * Advanced token overlays and interactions for the Cypher System.
 *
 * @module cypher-advanced-token
 */

import { MODULE_ID } from "./constants.js";
import { SETTINGS, registerSettings } from "./settings.js";
import { TokenRadial } from "./token-radial.js";
import { randomIdleVariantSrc, randomStateVariantSrc } from "./token-settings.js";

// ============================================================================
// Hook: init — Register settings
// ============================================================================

Hooks.once("init", () => {
  console.log(`[${MODULE_ID}] Initialising Cypher Advanced Token…`);
  registerSettings();
});

// ============================================================================
// Hook: ready — Token radial
// ============================================================================

Hooks.once("ready", () => {
  console.log(`[${MODULE_ID}] Cypher Advanced Token ready.`);

  // Left-click token → APPEARANCE / INSPECT / EVALUATE radial.
  // The enabled setting is checked per-click so toggling needs no reload.
  TokenRadial.instance.bind();
  console.log(`[${MODULE_ID}] Token radial bound.`);

  // Radial must not survive scene transitions
  Hooks.on("canvasReady", () => TokenRadial.instance.close());

  // === v1.5.17 — combat stance swap ===================================
  // Combat starts → every combatant's token takes a random COMBAT
  // STANCE variant; combat ends (or the encounter is deleted while
  // active) → back to a random IDLE variant (prototype art fallback).
  // Tokens without art for the target state keep their current look.
  //
  // Coverage, because combat can "start" several ways:
  //   • Begin Combat on an existing encounter → combatStart hook + an
  //     updateCombat diff with active:true (other clients only get the
  //     updateCombat — combatStart fires solely on the initiating one)
  //   • Token HUD toggle creating a NEW encounter → createCombat with
  //     active:true already set (no updateCombat fires at all)
  //   • Combatants dropped into an already-running encounter →
  //     createCombatant on the active combat
  // A debounce makes sure the same transition swaps only once.

  const _applyStateToToken = async (tokenDoc, actor, stateId) => {
    if (!tokenDoc || !actor) return;
    let src = randomStateVariantSrc(actor, stateId);
    if (stateId === "idle") {
      src = src || actor.prototypeToken?.texture?.src;
    }
    if (!src || tokenDoc.texture?.src === src) return;
    await tokenDoc.update({ "texture.src": src });
    console.log(`[${MODULE_ID}] ${stateId} → ${src} (${actor.name})`);
  };

  const _swapCombatTokens = async (combat, stateId) => {
    for (const c of combat.combatants ?? []) {
      try {
        const tokenDoc =
          c.token ?? game.scenes?.get(c.sceneId)?.tokens?.get(c.tokenId);
        await _applyStateToToken(tokenDoc, tokenDoc?.actor, stateId);
      } catch (err) {
        console.error(`[${MODULE_ID}] combat ${stateId} swap failed`, err);
      }
    }
  };

  const _recentSwaps = new Map(); // `${combatId}:${stateId}` → timestamp
  const _swapOnce = (combat, stateId) => {
    const id = combat.id ?? combat._id;
    const key = `${id}:${stateId}`;
    const now = Date.now();
    if (now - (_recentSwaps.get(key) ?? 0) < 1200) return;
    _recentSwaps.set(key, now);
    _swapCombatTokens(combat, stateId);
  };

  const _combatantToken = (c) =>
    c?.token ?? game.scenes?.get(c?.sceneId)?.tokens?.get(c?.tokenId);

  // Begin Combat pressed (initiating client only)
  Hooks.on("combatStart", (combat) => _swapOnce(combat, "combatStance"));

  // Encounter created already active (token HUD toggle path)
  Hooks.on("createCombat", (combat) => {
    if (combat.active) _swapOnce(combat, "combatStance");
  });

  // Activation flips via a plain update (covers non-initiating clients)
  Hooks.on("updateCombat", (combat, changed) => {
    if (!("active" in changed)) return; // round/turn advances don't swap
    if (changed.active) _swapOnce(combat, "combatStance");
    else _swapOnce(combat, "idle");
  });

  // Deleting a running encounter must not leave tokens in stance.
  Hooks.on("deleteCombat", (combat) => {
    if (combat.active) _swapOnce(combat, "idle");
  });

  // Tokens joining or leaving a live encounter follow suit individually.
  Hooks.on("createCombatant", (combatant) => {
    const combat = combatant.combat ?? combatant.parent;
    if (!combat?.active) return;
    try {
      const tokenDoc = _combatantToken(combatant);
      _applyStateToToken(tokenDoc, tokenDoc?.actor, "combatStance");
    } catch (err) {
      console.error(`[${MODULE_ID}] combat combatStance swap failed`, err);
    }
  });

  Hooks.on("deleteCombatant", (combatant) => {
    try {
      const tokenDoc = _combatantToken(combatant);
      _applyStateToToken(tokenDoc, tokenDoc?.actor, "idle");
    } catch (err) {
      console.error(`[${MODULE_ID}] combat idle swap failed`, err);
    }
  });

  // v1.5.12 — each time a token is PLACED on canvas (drag-drop, paste,
  // API create), roll a random IDLE variant (video wins per variant)
  // and make it the token's texture. Tokens already on a scene keep
  // their look — re-drop to reroll.
  Hooks.on("createToken", async (tokenDoc) => {
    try {
      const actor = tokenDoc.actor;
      if (!actor) return;
      const src = randomIdleVariantSrc(actor);
      if (src && tokenDoc.texture?.src !== src) {
        await tokenDoc.update({ "texture.src": src });
        console.log(`[${MODULE_ID}] random IDLE variant → ${src} (${actor.name})`);
      }
    } catch (err) {
      console.error(`[${MODULE_ID}] random IDLE variant failed`, err);
    }
  });
});
