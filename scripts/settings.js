/**
 * Module settings registration for Cypher Advanced Token.
 * Registers all client and world-scoped settings during the `init` hook.
 *
 * @module settings
 */

import { MODULE_ID, DEFAULT_SETTINGS } from "./constants.js";

/**
 * Setting key names exposed for use with game.settings.get/set.
 * @type {Object<string, string>}
 */
export const SETTINGS = {
  enabled: "enabled",
  debug: "debug"
};

/**
 * Register all module settings with Foundry.
 * Called during the `init` hook.
 */
export function registerSettings() {
  game.settings.register(MODULE_ID, SETTINGS.enabled, {
    name: game.i18n.localize("CYPHERADVANCEDTOKEN.SETTINGS.enabled.name"),
    hint: game.i18n.localize("CYPHERADVANCEDTOKEN.SETTINGS.enabled.hint"),
    scope: "client",
    config: true,
    type: Boolean,
    default: DEFAULT_SETTINGS.enabled,
    requiresReload: false
  });

  game.settings.register(MODULE_ID, SETTINGS.debug, {
    name: game.i18n.localize("CYPHERADVANCEDTOKEN.SETTINGS.debug.name"),
    hint: game.i18n.localize("CYPHERADVANCEDTOKEN.SETTINGS.debug.hint"),
    scope: "client",
    config: true,
    type: Boolean,
    default: DEFAULT_SETTINGS.debug,
    requiresReload: false
  });
}
