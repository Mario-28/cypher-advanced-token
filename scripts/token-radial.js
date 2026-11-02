/**
 * Token Radial — left-click on a canvas token opens a radial above the
 * token: APPEARANCE / INSPECT / EVALUATE, plus a GM-only TOKEN SETTINGS
 * slice.
 *
 * Interaction model: canvas-level DOM listeners (pointerdown + click) with a
 * stage-logical-space hit test via token.getBounds() (survives DPR scaling).
 * canvas.tokens.placeables is the only safe Token[] in V13+ (children is
 * polluted with non-Token display objects).
 *
 * v1.3.0: compact glass radial, connector line, drag-to-reposition with the
 * offset persisted per token (flag `radialOffset` = menu-centre delta from
 * the token's top-centre anchor, so it survives canvas pan/zoom).
 *
 * @module token-radial
 */

import { MODULE_ID } from "./constants.js";
import { evaluateNPC } from "./evaluate.js";
import { openHoverArtPopup } from "./hover-art.js";
import { reportRange } from "./range.js";
import { openTokenSettings } from "./token-settings.js";

/** Menu diameter — 40% smaller than the original 220. */
const MENU_SIZE = 132;
const GAP_DEG = 3;
/** Vertical gap between token top edge and menu bottom edge (min 50). */
const ABOVE_GAP = 56;
/** Pixels of pointer movement that distinguish a click from a drag. */
const DRAG_THRESHOLD = 5;
/** Flag key holding the per-token menu offset {dx, dy} from the anchor. */
const FLAG_OFFSET = "radialOffset";

/**
 * Player-facing segments. The TOKEN SETTINGS slice is appended for GMs
 * only (see open()), so the slice count — and thus wedge angles — is
 * computed per open.
 */
const BASE_SEGMENTS = [
  { action: "appearance", icon: "fa-image",            i18n: "CYPHERADVANCEDTOKEN.RADIAL.appearance", seg: "#e8c47a" },
  { action: "range",      icon: "fa-arrows-left-right", i18n: "CYPHERADVANCEDTOKEN.RADIAL.range",        seg: "#86b8a3" },
  { action: "inspect",    icon: "fa-magnifying-glass", i18n: "CYPHERADVANCEDTOKEN.RADIAL.inspect",    seg: "#d9915c" },
  { action: "evaluate",   icon: "fa-gauge-high",       i18n: "CYPHERADVANCEDTOKEN.RADIAL.evaluate",   seg: "#c76b8a" }
];

/**
 * Slices for a token the viewing PLAYER owns: APPEARANCE stays, RANGE
 * (distance to others) and INSPECT / EVALUATE go away, replaced by
 * LIGHT / ABOUT / FIGHT!.
 */
const OWN_SEGMENTS = [
  { action: "appearance", icon: "fa-image",       i18n: "CYPHERADVANCEDTOKEN.RADIAL.appearance", seg: "#e8c47a" },
  { action: "light",      icon: "fa-lightbulb",   i18n: "CYPHERADVANCEDTOKEN.RADIAL.light",      seg: "#f4d35e" },
  { action: "about",      icon: "fa-circle-info", i18n: "CYPHERADVANCEDTOKEN.RADIAL.about",      seg: "#7fa8c9" },
  { action: "fight",      icon: "fa-hand-fist",   i18n: "CYPHERADVANCEDTOKEN.RADIAL.fight",      seg: "#c75b5b" }
];

/** GM-only slice — cool violet, visually distinct from the warm player set. */
const GM_SEGMENTS = [
  { action: "settings", icon: "fa-gear", i18n: "CYPHERADVANCEDTOKEN.RADIAL.settings", seg: "#9b7fc7" }
];

/**
 * Hex → rgba() string.
 * @param {string} hex  #rgb or #rrggbb
 * @param {number} alpha
 * @returns {string}
 */
function hexA(hex, alpha) {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

class TokenRadial {
  static instance = null;

  /** The token the open menu belongs to. */
  _token = null;

  /** The menu DOM element. */
  _menuEl = null;

  /** Connector-line SVG overlay. */
  _linkEl = null;

  /** Canvas listener state. */
  _bound = false;
  _view = null;
  _downPos = null;
  _onPointerDown = null;
  _onClick = null;

  /** Bound close-path helpers (stored so they can be removed). */
  _outsideHandler = null;
  _escHandler = null;
  _resizeHandler = null;

  /* -------------------------------------------- */
  /*  Binding                                     */
  /* -------------------------------------------- */

  /**
   * Install canvas listeners. Idempotent — call once in `ready`.
   * Re-attaches automatically on every canvasReady (scene change).
   */
  bind() {
    if (this._bound) return;
    this._bound = true;
    if (canvas?.ready) this._attachCanvasListeners();
    Hooks.on("canvasReady", () => this._attachCanvasListeners());
  }

  /**
   * Attach pointerdown/click listeners to the active canvas element.
   * Removes any previous attachment first (same view persists across
   * scenes, but re-attach defensively).
   */
  _attachCanvasListeners() {
    const view = canvas?.app?.view;
    if (!view) return;

    if (this._view && this._onPointerDown && this._onClick) {
      this._view.removeEventListener("pointerdown", this._onPointerDown);
      this._view.removeEventListener("click", this._onClick);
    }

    this._view = view;
    this._downPos = null;

    this._onPointerDown = (e) => {
      if (e.button === 0) this._downPos = { x: e.clientX, y: e.clientY };
    };

    this._onClick = (e) => {
      const down = this._downPos;
      this._downPos = null;
      if (!down) return;
      // Distinguish click from drag: ignore if the pointer travelled
      if (Math.abs(e.clientX - down.x) > DRAG_THRESHOLD) return;
      if (Math.abs(e.clientY - down.y) > DRAG_THRESHOLD) return;

      // Enabled setting gates at click time — toggling needs no reload
      if (!game.settings.get(MODULE_ID, "enabled")) return;

      const token = this._tokenAtEvent(e);
      const label = token ? (token.document?.name ?? token.name ?? "?") : "miss";

      // Debug: every qualifying click reports its hit result
      if (game.settings.get(MODULE_ID, "debug")) {
        console.log(`[${MODULE_ID}] click @ client (${e.clientX},${e.clientY}) → token: ${label}`);
      }

      if (!token) {
        // Click on empty canvas dismisses an open menu
        if (this._menuEl) this.close();
        return;
      }

      // Clicking the token that already owns the open menu toggles it shut
      if (this._menuEl && this._token === token) {
        this.close();
        return;
      }
      this.open(token);
    };

    view.addEventListener("pointerdown", this._onPointerDown);
    view.addEventListener("click", this._onClick);
    console.log(`[${MODULE_ID}] canvas listeners attached to ${view.tagName}#${view.id || "?"}`);
  }

  /**
   * Hit test: which token sits under a DOM pointer event?
   * Done entirely in STAGE-LOGICAL pixels (= CSS pixels of the canvas
   * element): `token.getBounds()` is computed by PIXI in stage space, so the
   * pointer must be converted to the same space with NO backing-store
   * scaling. Walks the layer topmost-first.
   * @param {MouseEvent} e  The DOM click event
   * @returns {Token|null}
   */
  _tokenAtEvent(e) {
    try {
      const view = canvas.app.view;
      const rect = view.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;

      // placeables is the documented Token[] on TokenLayer — children can
      // contain non-Token display objects in V13+
      const tokens = canvas.tokens?.placeables ?? canvas.tokens?.children ?? [];
      for (let i = tokens.length - 1; i >= 0; i--) {
        const t = tokens[i];
        if (!t?.visible || t.document?.hidden) continue;
        const b = t.getBounds?.();
        if (!b) continue;
        if (px >= b.x && px <= b.x + b.width && py >= b.y && py <= b.y + b.height) {
          if (game.settings.get(MODULE_ID, "debug")) {
            console.log(`[${MODULE_ID}] hit ${t.constructor?.name} doc=${!!t.document} name=${t.document?.name}`);
          }
          return t;
        }
      }

      // Debug: report the miss with diagnostics
      if (game.settings.get(MODULE_ID, "debug") && tokens.length) {
        const t0 = tokens[tokens.length - 1];
        console.log(
          `[${MODULE_ID}] miss @ css (${px.toFixed(0)},${py.toFixed(0)}) | tokens=${tokens.length} | top: ${t0.document?.name ?? "?"}`,
          "bounds:", t0.getBounds?.()
        );
      }
      return null;
    } catch (err) {
      console.error(`[${MODULE_ID}] hit test failed`, err);
      return null;
    }
  }

  /**
   * World coordinates → client (viewport) coordinates.
   * Token-layer transform maps world → stage-logical px; adding the canvas
   * rect offset lands in client space. NO backing-store scaling — stage
   * logical space is exactly the canvas element's CSS pixel space.
   */
  _worldToClient(pt) {
    const wt = canvas.tokens?.worldTransform;
    if (!wt) return null;
    const c = wt.apply(new globalThis.PIXI.Point(pt.x, pt.y));
    const rect = canvas.app.view.getBoundingClientRect();
    return { x: rect.left + c.x, y: rect.top + c.y };
  }

  /* -------------------------------------------- */
  /*  Open / close                                */
  /* -------------------------------------------- */

  /**
   * Open the radial for a token. Position: saved per-token offset from a
   * previous drag if present, otherwise centred above the token with at
   * least ABOVE_GAP px of clearance.
   * @param {Token} token  The clicked canvas token
   */
  open(token) {
    this.close();

    const anchor = this._menuAnchor(token);
    if (!anchor) return;
    console.log(`[${MODULE_ID}] radial open → ${token.document?.name ?? token.name}`);

    const half = MENU_SIZE / 2;
    const outerR = half - 5;
    const innerR = outerR * 0.36;

    // Segment set depends on who's looking at whose token:
    //   GM         → base set minus RANGE, + TOKEN SETTINGS
    //   player,    → APPEARANCE + LIGHT / ABOUT / FIGHT!
    //   own token
    //   player,    → full base set (RANGE measures distance to others)
    //   other token
    const isGM = !!game.user?.isGM;
    let segments;
    if (isGM) {
      segments = BASE_SEGMENTS.filter((s) => s.action !== "range");
      segments.push(...GM_SEGMENTS);
    } else if (token.actor?.isOwner) {
      segments = [...OWN_SEGMENTS];
    } else {
      segments = [...BASE_SEGMENTS];
    }
    const segCount = segments.length;
    const slice = 360 / segCount;
    // Segment 0 (APPEARANCE) centered at the top for any slice count.
    const angleOffset = -slice / 2;

    // --- Position: saved offset wins, default above the token ---
    const saved = token.document?.getFlag?.(MODULE_ID, FLAG_OFFSET);
    let centerX = anchor.x;
    let centerY = anchor.y - ABOVE_GAP - half;
    if (saved && Number.isFinite(saved.dx) && Number.isFinite(saved.dy)) {
      centerX = anchor.x + saved.dx;
      centerY = anchor.y + saved.dy;
      if (game.settings.get(MODULE_ID, "debug")) {
        console.log(`[${MODULE_ID}] offset restored: dx=${saved.dx.toFixed(0)} dy=${saved.dy.toFixed(0)}`);
      }
    }
    let left = centerX - half;
    let top = centerY - half;
    left = Math.max(8, Math.min(left, window.innerWidth - MENU_SIZE - 8));
    top = Math.max(8, Math.min(top, window.innerHeight - MENU_SIZE - 8));

    // --- SVG wedge paths (per-segment gradient hues via CSS vars) ---
    let paths = "";
    segments.forEach((seg, i) => {
      const start = angleOffset + i * slice + GAP_DEG / 2;
      const end = angleOffset + (i + 1) * slice - GAP_DEG / 2;
      const segVars = `--seg:${seg.seg};--seg-fill:${hexA(seg.seg, 0.22)};--seg-fill-hover:${hexA(seg.seg, 0.42)};--seg-stroke:${hexA(seg.seg, 0.5)};--seg-glow:${hexA(seg.seg, 0.45)}`;
      paths += `<path class="cat-pie-seg" data-action="${seg.action}" style="${segVars}" d="${this._wedgePath(start, end, innerR, outerR)}" />`;
    });

    // --- Label chips at slice midpoints ---
    let labels = "";
    segments.forEach((seg, i) => {
      const mid = angleOffset + (i * slice + (i + 1) * slice) / 2;
      const rad = (mid - 90) * Math.PI / 180;
      const labelR = (innerR + outerR) / 2;
      const lx = Math.cos(rad) * labelR + half;
      const ly = Math.sin(rad) * labelR + half;
      labels += `
        <div class="cat-pie-label" data-action="${seg.action}" title="${game.i18n.localize(seg.i18n)}"
             style="--seg:${seg.seg};--seg-glow:${hexA(seg.seg, 0.7)};left:${lx.toFixed(1)}px;top:${ly.toFixed(1)}px;">
          <i class="fas ${seg.icon}"></i>
          <span>${game.i18n.localize(seg.i18n)}</span>
        </div>`;
    });

    const portrait = token.actor?.img || token.document?.texture?.src || "icons/svg/mystery-man.svg";

    const menu = document.createElement("div");
    menu.className = "cat-radial";
    menu.style.width = `${MENU_SIZE}px`;
    menu.style.height = `${MENU_SIZE}px`;
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;

    menu.innerHTML = `
      <svg class="cat-pie-svg" viewBox="-${half} -${half} ${MENU_SIZE} ${MENU_SIZE}" width="${MENU_SIZE}" height="${MENU_SIZE}">
        <circle class="cat-pie-disc" cx="0" cy="0" r="${outerR}" />
        ${paths}
        <circle class="cat-pie-core" cx="0" cy="0" r="${innerR - 2}" />
      </svg>
      ${labels}
      <img class="cat-pie-portrait" src="${portrait}" alt="" draggable="false">
    `;

    document.body.appendChild(menu);
    this._menuEl = menu;
    this._token = token;

    requestAnimationFrame(() => menu.classList.add("cat-radial-visible"));

    // --- Connector line: token anchor → menu centre ---
    this._updateLink(anchor, { x: left + half, y: top + half });

    // --- Segment + label clicks ---
    const onAction = (e) => {
      e.stopPropagation();
      const action = e.currentTarget.dataset.action;
      this._runAction(action, token);
    };
    menu.querySelectorAll(".cat-pie-seg, .cat-pie-label").forEach((el) => {
      el.addEventListener("click", onAction);
    });

    // --- Hover sync between wedge and label ---
    menu.querySelectorAll(".cat-pie-seg").forEach((seg) => {
      const label = menu.querySelector(`.cat-pie-label[data-action="${seg.dataset.action}"]`);
      seg.addEventListener("mouseenter", () => label?.classList.add("cat-pie-label-active"));
      seg.addEventListener("mouseleave", () => label?.classList.remove("cat-pie-label-active"));
    });
    menu.querySelectorAll(".cat-pie-label").forEach((lbl) => {
      const seg = menu.querySelector(`.cat-pie-seg[data-action="${lbl.dataset.action}"]`);
      lbl.addEventListener("mouseenter", () => seg?.classList.add("cat-pie-seg-hover"));
      lbl.addEventListener("mouseleave", () => seg?.classList.remove("cat-pie-seg-hover"));
    });

    // --- Drag: grab anywhere on the menu EXCEPT action targets ---
    menu.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      if (e.target.closest(".cat-pie-seg, .cat-pie-label")) return;
      this._startDrag(e, menu, token, anchor);
    });

    // --- Close paths (delayed so the opening click can't close us) ---
    setTimeout(() => {
      this._outsideHandler = (e) => {
        if (!menu.contains(e.target)) this.close();
      };
      this._escHandler = (e) => {
        if (e.key === "Escape") this.close();
      };
      document.addEventListener("mousedown", this._outsideHandler);
      document.addEventListener("keydown", this._escHandler);
    }, 50);

    this._resizeHandler = () => this.close();
    window.addEventListener("resize", this._resizeHandler);
  }

  /** Tear the menu down (unconditionally safe to call). */
  close() {
    if (this._outsideHandler) {
      document.removeEventListener("mousedown", this._outsideHandler);
      this._outsideHandler = null;
    }
    if (this._escHandler) {
      document.removeEventListener("keydown", this._escHandler);
      this._escHandler = null;
    }
    if (this._resizeHandler) {
      window.removeEventListener("resize", this._resizeHandler);
      this._resizeHandler = null;
    }
    const el = this._menuEl;
    this._menuEl = null;
    this._token = null;
    this._removeLink();
    if (el) {
      el.classList.remove("cat-radial-visible");
      setTimeout(() => el.remove(), 180);
    }
  }

  /* -------------------------------------------- */
  /*  Drag                                        */
  /* -------------------------------------------- */

  /**
   * Reposition drag for the open radial. Moves the menu, keeps the
   * connector line glued to it, and persists the offset (menu centre
   * relative to the token anchor) on the token document when the drag ends.
   */
  _startDrag(e, menu, token, anchor) {
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const startLeft = parseFloat(menu.style.left) || 0;
    const startTop = parseFloat(menu.style.top) || 0;
    const half = MENU_SIZE / 2;
    let moved = false;

    const onMove = (ev) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (!moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      moved = true;
      menu.classList.add("cat-radial-dragging");
      let left = startLeft + dx;
      let top = startTop + dy;
      left = Math.max(8, Math.min(left, window.innerWidth - MENU_SIZE - 8));
      top = Math.max(8, Math.min(top, window.innerHeight - MENU_SIZE - 8));
      menu.style.left = `${left}px`;
      menu.style.top = `${top}px`;
      this._updateLink(anchor, { x: left + half, y: top + half });
    };

    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      menu.classList.remove("cat-radial-dragging");
      if (!moved || !token.document) return;

      const left = parseFloat(menu.style.left) || 0;
      const top = parseFloat(menu.style.top) || 0;
      const offset = {
        dx: Math.round(left + half - anchor.x),
        dy: Math.round(top + half - anchor.y)
      };
      token.document.setFlag(MODULE_ID, FLAG_OFFSET, offset).catch((err) => {
        console.warn(`[${MODULE_ID}] could not save radial offset`, err);
      });
      console.log(`[${MODULE_ID}] radial offset saved for ${token.document.name}:`, offset);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  /* -------------------------------------------- */
  /*  Connector line                              */
  /* -------------------------------------------- */

  /**
   * Draw (or update) the glowing connector line between the token anchor
   * point and the menu centre. Full-viewport SVG overlay, pointer-events
   * none, sits just beneath the menu in z-order.
   */
  _updateLink(from, to) {
    let link = this._linkEl;
    if (!link || !link.isConnected) {
      link = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      link.setAttribute("class", "cat-radial-link");
      link.innerHTML = `<line class="cat-link-line" x1="0" y1="0" x2="0" y2="0"></line>
                        <circle class="cat-link-dot" cx="0" cy="0" r="0"></circle>`;
      document.body.appendChild(link);
      this._linkEl = link;
    }
    const line = link.querySelector(".cat-link-line");
    const dot = link.querySelector(".cat-link-dot");
    dot.setAttribute("r", "3.5");
    line.setAttribute("x1", from.x);
    line.setAttribute("y1", from.y);
    line.setAttribute("x2", to.x);
    line.setAttribute("y2", to.y);
    dot.setAttribute("cx", from.x);
    dot.setAttribute("cy", from.y);
    requestAnimationFrame(() => link.classList.add("cat-radial-link-visible"));
  }

  /** Remove the connector line overlay. */
  _removeLink() {
    const link = this._linkEl;
    this._linkEl = null;
    if (link) {
      link.classList.remove("cat-radial-link-visible");
      setTimeout(() => link.remove(), 160);
    }
  }

  /* -------------------------------------------- */
  /*  Actions                                     */
  /* -------------------------------------------- */

  _runAction(action, token) {
    this.close();
    console.log(`[${MODULE_ID}] radial action: ${action} → ${token.document?.name ?? token.name}`);
    if (action === "appearance") {
      openHoverArtPopup(token);
    } else if (action === "range") {
      reportRange(canvas.tokens.controlled[0] ?? null, token);
    } else if (action === "inspect") {
      // TODO: INSPECT behaviour — spec pending
      console.log(`[${MODULE_ID}] INSPECT clicked for`, token.document?.name ?? token.name);
      ui.notifications.info(`${game.i18n.localize("CYPHERADVANCEDTOKEN.RADIAL.inspect")} — coming soon.`);
    } else if (action === "evaluate") {
      evaluateNPC(token);
    } else if (action === "light") {
      // TODO: LIGHT behaviour — spec pending
      console.log(`[${MODULE_ID}] LIGHT clicked for`, token.document?.name ?? token.name);
      ui.notifications.info(`${game.i18n.localize("CYPHERADVANCEDTOKEN.RADIAL.light")} — coming soon.`);
    } else if (action === "about") {
      // TODO: ABOUT behaviour — spec pending
      console.log(`[${MODULE_ID}] ABOUT clicked for`, token.document?.name ?? token.name);
      ui.notifications.info(`${game.i18n.localize("CYPHERADVANCEDTOKEN.RADIAL.about")} — coming soon.`);
    } else if (action === "fight") {
      // FIGHT! — enter/leave combat, the token HUD toggle. V14 renamed
      // TokenDocument#toggleCombat → toggleCombatant; feature-detect so
      // V12/V13 keep working. With no encounter on the scene the toggle
      // creates one — on player clients that needs GM rights, so failures
      // get a clear explanation.
      const td = token.document;
      if (!td) return;
      const name = td.name ?? token.name ?? "?";
      const toggle =
        typeof td.toggleCombatant === "function"
          ? () => td.toggleCombatant()
          : typeof td.toggleCombat === "function"
            ? () => td.toggleCombat()
            : null;
      if (!toggle) {
        console.error(`[${MODULE_ID}] FIGHT! no combat toggle API on TokenDocument`);
        ui.notifications.warn(game.i18n.localize("CYPHERADVANCEDTOKEN.RADIAL.fightFail"));
        return;
      }
      toggle()
        .then((nowActive) => {
          const inNow = typeof nowActive === "boolean" ? nowActive : td.inCombat;
          const state = inNow
            ? game.i18n.localize("CYPHERADVANCEDTOKEN.RADIAL.fightEnter")
            : game.i18n.localize("CYPHERADVANCEDTOKEN.RADIAL.fightLeave");
          ui.notifications.info(
            game.i18n.format("CYPHERADVANCEDTOKEN.RADIAL.fightDone", { name, state })
          );
        })
        .catch((err) => {
          console.error(`[${MODULE_ID}] FIGHT! combat toggle failed`, err);
          ui.notifications.warn(
            game.i18n.localize("CYPHERADVANCEDTOKEN.RADIAL.fightFail")
          );
        });
    } else if (action === "settings") {
      openTokenSettings(token);
    }
  }

  /* -------------------------------------------- */
  /*  Geometry helpers                            */
  /* -------------------------------------------- */

  /**
   * The token's top-centre point in client coordinates — the anchor both
   * for default positioning and for saved offsets.
   * V13+ exposes `token.center` (getter); V12 has getCenter().
   */
  _menuAnchor(token) {
    try {
      // centre candidates: V13 `center` getter → V12 getCenter() → raw doc
      let c = token.center;
      if (!c && typeof token.getCenter === "function") c = token.getCenter();
      if (!c && token.document) {
        c = {
          x: token.document.x + (token.w || token.document.width || 0) / 2,
          y: token.document.y + (token.h || token.document.height || 0) / 2
        };
      }
      if (!c) throw new Error("no centre available for token");
      const h = token.h ?? token.document?.height ?? token.bounds?.height ?? 0;
      const topCenter = { x: c.x, y: c.y - h / 2 };
      return this._worldToClient(topCenter);
    } catch (err) {
      console.warn(`[${MODULE_ID}] menu anchor failed`, err);
      return null;
    }
  }

  /**
   * Donut wedge path centred on (0,0), angle 0 = up, clockwise.
   */
  _wedgePath(startAngle, endAngle, innerR, outerR) {
    const toRad = (a) => (a - 90) * Math.PI / 180;
    const sa = toRad(startAngle);
    const ea = toRad(endAngle);
    const x1 = Math.cos(sa) * outerR;
    const y1 = Math.sin(sa) * outerR;
    const x2 = Math.cos(ea) * outerR;
    const y2 = Math.sin(ea) * outerR;
    const x3 = Math.cos(ea) * innerR;
    const y3 = Math.sin(ea) * innerR;
    const x4 = Math.cos(sa) * innerR;
    const y4 = Math.sin(sa) * innerR;
    const largeArc = endAngle - startAngle > 180 ? 1 : 0;
    return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${outerR} ${outerR} 0 ${largeArc} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} L ${x3.toFixed(2)} ${y3.toFixed(2)} A ${innerR} ${innerR} 0 ${largeArc} 0 ${x4.toFixed(2)} ${y4.toFixed(2)} Z`;
  }
}

TokenRadial.instance = new TokenRadial();
export { TokenRadial };
