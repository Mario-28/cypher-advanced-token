/**
 * Constants and enumerations for the Cypher Advanced Token module.
 * @module constants
 */

/** @type {string} The module identifier used for flags, settings, and localization */
export const MODULE_ID = "cypher-advanced-token";

/** @type {string} Short prefix used for CSS classes and DOM ids */
export const CSS_PREFIX = "cat";

/**
 * Socket events broadcast between clients.
 * @type {Object<string, string>}
 */
export const SOCKET_EVENTS = {
  // Example: tokenOverlayUpdate: "tokenOverlayUpdate"
};

/**
 * Default values for all module settings.
 * @type {Object<string, *>}
 */
export const DEFAULT_SETTINGS = {
  enabled: true,
  debug: false
};
