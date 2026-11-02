/**
 * Token Settings — GM-only fancy dialog for per-token module options.
 *
 * Opened from the radial menu's TOKEN SETTINGS slice (GM only). Direct-DOM
 * floating window (no ApplicationV1/V2 — safe across V12–V14), draggable by
 * its header, tabbed body. Settings are written to the token's ACTOR as
 * module flags (`flags.cypher-advanced-token.*`), so they persist with the
 * actor sheet. Unlinked (synthetic) actors redirect the update to their
 * token document, which is the documented Foundry behaviour.
 *
 * v1.5.2 — replaces the old renderTokenConfig injection with an in-module
 * home for the same data. v1.5.5 adds the optional .webm video field
 * under the image field.
 *
 * @module token-settings
 */

import { MODULE_ID } from "./constants.js";
import { getHoverArt, getHoverArtVideo } from "./hover-art.js";

/** Flag key holding the hover art image path. */
const FLAG_HOVER_ART = "hoverArt";
/** Flag key holding the hover art video path (.webm — v1.5.5). */
const FLAG_HOVER_ART_VIDEO = "hoverArtVideo";
/** Flag key holding per-state token art, v1.5.6: `{ [stateId]: {img, video} }`. */
const FLAG_TOKEN_ART = "tokenArt";

/** Tab definitions — APPEARANCE is first. Add future tabs here. */
const TABS = [
  { id: "appearance", icon: "fa-image", i18n: "CYPHERADVANCEDTOKEN.DIALOG.tabs.appearance" },
  { id: "token",      icon: "fa-user",  i18n: "CYPHERADVANCEDTOKEN.DIALOG.tabs.token" }
];

/** Animation states for the TOKEN tab — each row gets image + video slots. */
const TOKEN_STATES = [
  { id: "default",    i18n: "CYPHERADVANCEDTOKEN.TOKENSTATES.default" },
  { id: "idle",       i18n: "CYPHERADVANCEDTOKEN.TOKENSTATES.idle" },
  { id: "combatStance", i18n: "CYPHERADVANCEDTOKEN.TOKENSTATES.combatStance" },
  { id: "attack",     i18n: "CYPHERADVANCEDTOKEN.TOKENSTATES.attack" },
  { id: "hurt",       i18n: "CYPHERADVANCEDTOKEN.TOKENSTATES.hurt" },
  { id: "mediumHurt", i18n: "CYPHERADVANCEDTOKEN.TOKENSTATES.mediumHurt" },
  { id: "veryHurt",   i18n: "CYPHERADVANCEDTOKEN.TOKENSTATES.veryHurt" },
  { id: "down",       i18n: "CYPHERADVANCEDTOKEN.TOKENSTATES.down" },
  { id: "sitting",    i18n: "CYPHERADVANCEDTOKEN.TOKENSTATES.sitting" }
];

class TokenSettingsDialog {
  static instance = null;

  /** The token being configured. */
  _token = null;

  /** The dialog DOM element. */
  _el = null;

  /** Bound close-path helpers. */
  _escHandler = null;

  /**
   * Open (or focus) the dialog for a token. GM-only: the radial shows the
   * slice to GMs only, but guard here too so macros can't bypass it.
   * @param {Token} token  The clicked canvas token
   */
  open(token) {
    if (!game.user?.isGM) {
      console.warn(`[${MODULE_ID}] token settings: GM only`);
      return;
    }
    const actor = token?.actor;
    if (!actor) {
      ui.notifications.warn(game.i18n.localize("CYPHERADVANCEDTOKEN.DIALOG.noActor"));
      return;
    }

    this.close();
    this._token = token;
    console.log(`[${MODULE_ID}] token settings open → ${actor.name}`);

    const el = document.createElement("div");
    el.className = "cat-tsettings";
    el.innerHTML = this._buildHtml(actor);

    document.body.appendChild(el);
    this._el = el;
    this._center(el);
    this._bind(el, actor, token);

    requestAnimationFrame(() => el.classList.add("cat-tsettings-visible"));

    this._escHandler = (e) => {
      if (e.key === "Escape") this.close();
    };
    document.addEventListener("keydown", this._escHandler);
  }

  /** Tear the dialog down (safe to call when nothing is open). */
  close() {
    if (this._escHandler) {
      document.removeEventListener("keydown", this._escHandler);
      this._escHandler = null;
    }
    const el = this._el;
    this._el = null;
    this._token = null;
    if (el) {
      el.classList.remove("cat-tsettings-visible");
      setTimeout(() => el.remove(), 180);
    }
  }

  /* -------------------------------------------- */
  /*  DOM                                         */
  /* -------------------------------------------- */

  /**
   * Build the window markup. Tab bar is rendered from TABS so future tabs
   * only need a lang key + a body renderer below.
   */
  _buildHtml(actor) {
    const actorValue = actor.getFlag?.(MODULE_ID, FLAG_HOVER_ART) ?? "";
    const actorVideo = actor.getFlag?.(MODULE_ID, FLAG_HOVER_ART_VIDEO) ?? "";
    const effective = this._token ? getHoverArt(this._token) : null;
    const effectiveVideo = this._token ? getHoverArtVideo(this._token) : null;
    const name = actor.name ?? this._token?.document?.name ?? "?";

    const tabs = TABS.map((t, i) => `
      <button class="cat-tsettings-tab${i === 0 ? " active" : ""}" data-tab="${t.id}">
        <i class="fas ${t.icon}"></i><span>${game.i18n.localize(t.i18n)}</span>
      </button>`).join("");

    return `
      <div class="cat-tsettings-header">
        <i class="fas fa-gear cat-tsettings-header-icon"></i>
        <div class="cat-tsettings-titles">
          <span class="cat-tsettings-title">${game.i18n.localize("CYPHERADVANCEDTOKEN.DIALOG.title")}</span>
          <span class="cat-tsettings-sub">${name}</span>
        </div>
        <button class="cat-tsettings-close" title="Close"><i class="fas fa-xmark"></i></button>
      </div>
      <div class="cat-tsettings-tabs">${tabs}</div>
      <div class="cat-tsettings-body">
        <div class="cat-tsettings-tabpage" data-tabpage="appearance">
          <div class="cat-tsettings-preview">
            ${effective
              ? `<img src="${effective}" alt="" draggable="false">`
              : effectiveVideo
                ? `<video src="${effectiveVideo}" autoplay loop muted playsinline draggable="false"></video>`
                : `<div class="cat-tsettings-preview-empty"><i class="fas fa-image"></i></div>`}
          </div>
          <div class="cat-tsettings-field">
            <label>${game.i18n.localize("CYPHERADVANCEDTOKEN.HOVERART.label")}</label>
            <div class="cat-tsettings-inputrow">
              <input type="text" class="cat-tsettings-input" value="${actorValue}"
                     placeholder="${game.i18n.localize("CYPHERADVANCEDTOKEN.DIALOG.noImage")}">
              <button class="cat-tsettings-browse cat-tsettings-imgbrowse" title="${game.i18n.localize("CYPHERADVANCEDTOKEN.HOVERART.pick")}">
                <i class="fas fa-file-import"></i>
              </button>
              <button class="cat-tsettings-clear cat-tsettings-imgclear" title="${game.i18n.localize("CYPHERADVANCEDTOKEN.DIALOG.clear")}">
                <i class="fas fa-eraser"></i>
              </button>
            </div>
            <p class="cat-tsettings-hint">${game.i18n.localize("CYPHERADVANCEDTOKEN.HOVERART.hint")}</p>
          </div>
          <div class="cat-tsettings-field">
            <label>${game.i18n.localize("CYPHERADVANCEDTOKEN.HOVERART.videoLabel")}</label>
            <div class="cat-tsettings-inputrow">
              <input type="text" class="cat-tsettings-input cat-tsettings-videoinput" value="${actorVideo}"
                     placeholder="${game.i18n.localize("CYPHERADVANCEDTOKEN.DIALOG.noImage")}">
              <button class="cat-tsettings-browse cat-tsettings-vbrowse" title="${game.i18n.localize("CYPHERADVANCEDTOKEN.HOVERART.videoPick")}">
                <i class="fas fa-film"></i>
              </button>
              <button class="cat-tsettings-clear cat-tsettings-vclear" title="${game.i18n.localize("CYPHERADVANCEDTOKEN.DIALOG.clear")}">
                <i class="fas fa-eraser"></i>
              </button>
            </div>
            <p class="cat-tsettings-hint">${game.i18n.localize("CYPHERADVANCEDTOKEN.HOVERART.videoHint")}</p>
          </div>
          <div class="cat-tsettings-override" hidden>
            <i class="fas fa-triangle-exclamation"></i>
            <span>${game.i18n.localize("CYPHERADVANCEDTOKEN.DIALOG.overrideNote")}</span>
            <button class="cat-tsettings-clear-override">
              ${game.i18n.localize("CYPHERADVANCEDTOKEN.DIALOG.clearOverride")}
            </button>
          </div>
          <div class="cat-tsettings-saved" hidden>
            <i class="fas fa-check"></i><span>${game.i18n.localize("CYPHERADVANCEDTOKEN.DIALOG.saved")}</span>
          </div>
        </div>
        <div class="cat-tsettings-tabpage" data-tabpage="token" hidden>
          ${TOKEN_STATES.map((s) => `
            <div class="cat-tsettings-state" data-state="${s.id}">
              <div class="cat-tsettings-state-thumb">
                <i class="fas fa-user"></i>
              </div>
              <div class="cat-tsettings-state-fields">
                <span class="cat-tsettings-state-label">${game.i18n.localize(s.i18n)}</span>
                <div class="cat-ts-variant-tabs">
                  ${[1, 2, 3, 4, 5].map((v) => `<button type="button" class="cat-ts-vtab${v === 1 ? " cat-ts-vtab-active" : ""}" data-v="${v}">${v}</button>`).join("")}
                </div>
                <div class="cat-tsettings-inputrow">
                  <input type="text" class="cat-tsettings-input cat-ts-img" value=""
                         placeholder="${game.i18n.localize("CYPHERADVANCEDTOKEN.HOVERART.label")}">
                  <button class="cat-tsettings-browse cat-ts-img-browse" title="${game.i18n.localize("CYPHERADVANCEDTOKEN.HOVERART.pick")}">
                    <i class="fas fa-file-import"></i>
                  </button>
                  <button class="cat-tsettings-clear cat-ts-img-clear" title="${game.i18n.localize("CYPHERADVANCEDTOKEN.DIALOG.clear")}">
                    <i class="fas fa-eraser"></i>
                  </button>
                </div>
                <div class="cat-tsettings-inputrow">
                  <input type="text" class="cat-tsettings-input cat-ts-video" value=""
                         placeholder="${game.i18n.localize("CYPHERADVANCEDTOKEN.HOVERART.videoLabel")}">
                  <button class="cat-tsettings-browse cat-ts-video-browse" title="${game.i18n.localize("CYPHERADVANCEDTOKEN.HOVERART.videoPick")}">
                    <i class="fas fa-film"></i>
                  </button>
                  <button class="cat-tsettings-clear cat-ts-video-clear" title="${game.i18n.localize("CYPHERADVANCEDTOKEN.DIALOG.clear")}">
                    <i class="fas fa-eraser"></i>
                  </button>
                </div>
              </div>
            </div>`).join("")}
        </div>
      </div>
    `;
  }

  /**
   * Wire up the window: close button, header drag, browse/clear/save for
   * the hover art field, and the scene-override notice.
   */
  _bind(el, actor, token) {
    el.querySelector(".cat-tsettings-close").addEventListener("click", () => this.close());

    // Header drag
    this._bindDrag(el);

    // Tab switching
    el.querySelectorAll(".cat-tsettings-tab").forEach((btn) => {
      btn.addEventListener("click", () => {
        el.querySelectorAll(".cat-tsettings-tab").forEach((b) => b.classList.toggle("active", b === btn));
        el.querySelectorAll(".cat-tsettings-tabpage").forEach((p) => {
          p.hidden = p.dataset.tabpage !== btn.dataset.tab;
        });
      });
    });

    const input = el.querySelector(".cat-tsettings-input");
    const videoInput = el.querySelector(".cat-tsettings-videoinput");
    const preview = el.querySelector(".cat-tsettings-preview");
    const overrideRow = el.querySelector(".cat-tsettings-override");
    const savedChip = el.querySelector(".cat-tsettings-saved");

    // Scene-token override notice (token flag shadows the actor value).
    // Suppressed for synthetic actors: their flag writes are redirected to
    // the token document, so "actor value" and "token flag" are one store.
    const isSynthetic = !!actor.isToken;
    const syncOverrideNotice = () => {
      const tokenImg = token.document?.getFlag?.(MODULE_ID, FLAG_HOVER_ART);
      const tokenVid = token.document?.getFlag?.(MODULE_ID, FLAG_HOVER_ART_VIDEO);
      overrideRow.hidden = isSynthetic || (!tokenImg && !tokenVid);
    };
    syncOverrideNotice();

    let savedTimer = null;
    const flashSaved = () => {
      savedChip.hidden = false;
      savedChip.classList.remove("cat-tsettings-saved-flash");
      void savedChip.offsetWidth; // restart animation
      savedChip.classList.add("cat-tsettings-saved-flash");
      clearTimeout(savedTimer);
      savedTimer = setTimeout(() => { savedChip.hidden = true; }, 1600);
    };

    const syncPreview = () => {
      const imgPath = getHoverArt(token);
      const vidPath = getHoverArtVideo(token);
      preview.innerHTML = imgPath
        ? `<img src="${imgPath}" alt="" draggable="false">`
        : vidPath
          ? `<video src="${vidPath}" autoplay loop muted playsinline draggable="false"></video>`
          : `<div class="cat-tsettings-preview-empty"><i class="fas fa-image"></i></div>`;
    };

    /** Persist a new hover art path on the actor. Empty string clears. */
    const save = async (path) => {
      try {
        if (path) {
          await actor.setFlag(MODULE_ID, FLAG_HOVER_ART, path);
          console.log(`[${MODULE_ID}] hover art saved on ${actor.name}: ${path}`);
        } else {
          await actor.unsetFlag(MODULE_ID, FLAG_HOVER_ART);
          console.log(`[${MODULE_ID}] hover art cleared on ${actor.name}`);
        }
        syncPreview();
        flashSaved();
      } catch (err) {
        console.error(`[${MODULE_ID}] hover art save failed`, err);
        ui.notifications.error(`[${MODULE_ID}] save failed — see console.`);
      }
    };

    /** Persist a hover art video path on the actor. Empty clears. */
    const saveVideo = async (path) => {
      try {
        if (path) {
          await actor.setFlag(MODULE_ID, FLAG_HOVER_ART_VIDEO, path);
          console.log(`[${MODULE_ID}] hover art video saved on ${actor.name}: ${path}`);
        } else {
          await actor.unsetFlag(MODULE_ID, FLAG_HOVER_ART_VIDEO);
          console.log(`[${MODULE_ID}] hover art video cleared on ${actor.name}`);
        }
        syncPreview();
        flashSaved();
      } catch (err) {
        console.error(`[${MODULE_ID}] hover art video save failed`, err);
        ui.notifications.error(`[${MODULE_ID}] save failed — see console.`);
      }
    };

    // Commit on Enter / blur (change fires on blur)
    input.addEventListener("change", () => save(input.value.trim()));
    videoInput.addEventListener("change", () => saveVideo(videoInput.value.trim()));

    // File pickers — shared helper (namespaced V13+, V12 fallback)
    el.querySelector(".cat-tsettings-imgbrowse").addEventListener("click", () => {
      this._pickFile("image", input.value, (path) => {
        input.value = path;
        save(path);
      });
    });

    // Video file picker (.webm / video)
    el.querySelector(".cat-tsettings-vbrowse").addEventListener("click", () => {
      this._pickFile("video", videoInput.value, (path) => {
        videoInput.value = path;
        saveVideo(path);
      });
    });

    // Clear buttons
    el.querySelector(".cat-tsettings-imgclear").addEventListener("click", () => {
      input.value = "";
      save("");
    });
    el.querySelector(".cat-tsettings-vclear").addEventListener("click", () => {
      videoInput.value = "";
      saveVideo("");
    });

    // Clear scene-token overrides (so the actor values win again)
    el.querySelector(".cat-tsettings-clear-override").addEventListener("click", async () => {
      try {
        await token.document?.unsetFlag(MODULE_ID, FLAG_HOVER_ART);
        await token.document?.unsetFlag(MODULE_ID, FLAG_HOVER_ART_VIDEO);
        syncOverrideNotice();
        syncPreview();
        flashSaved();
      } catch (err) {
        console.error(`[${MODULE_ID}] override clear failed`, err);
      }
    });

    this._bindTokenStates(el, actor, flashSaved);
  }

  /**
   * TOKEN tab — one row per animation state; each state holds FIVE
   * numbered variants (tabs), each variant with image + video slots.
   * Persisted on the actor under the `tokenArt` object flag:
   * `{ [stateId]: { "1": { img?, video? }, … "5": {…} } }`.
   * A tab lights up while its variant holds art; variant 1 is the
   * initial selection (or the first filled variant on open).
   */
  _bindTokenStates(el, actor, flashSaved) {
    const readAll = () => actor.getFlag?.(MODULE_ID, FLAG_TOKEN_ART) ?? {};
    const VARIANTS = ["1", "2", "3", "4", "5"];

    el.querySelectorAll(".cat-tsettings-state").forEach((row) => {
      const stateId = row.dataset.state;
      const imgInput = row.querySelector(".cat-ts-img");
      const vidInput = row.querySelector(".cat-ts-video");
      const thumb = row.querySelector(".cat-tsettings-state-thumb");
      const tabs = [...row.querySelectorAll(".cat-ts-vtab")];

      // Start on variant 1, or the first variant that already has art.
      const initial = readAll()[stateId] ?? {};
      let current = VARIANTS.find((v) => initial[v]?.img || initial[v]?.video) ?? "1";

      const syncRow = () => {
        const all = readAll();
        const state = all[stateId] ?? {};
        const entry = state[current] ?? {};
        imgInput.value = entry.img ?? "";
        vidInput.value = entry.video ?? "";
        thumb.innerHTML = entry.img
          ? `<img src="${entry.img}" draggable="false">`
          : entry.video
            ? `<video src="${entry.video}" muted preload="metadata" draggable="false"></video>`
            : `<i class="fas fa-user"></i>`;
        tabs.forEach((t) => {
          const tv = state[t.dataset.v] ?? {};
          t.classList.toggle("cat-ts-vtab-active", t.dataset.v === current);
          t.classList.toggle("cat-ts-vtab-filled", !!(tv.img || tv.video));
        });
      };

      /** Merge one slot into the current variant; prune empty levels. */
      const saveSlot = async (kind, value) => {
        try {
          const all = { ...readAll() };
          const state = { ...(all[stateId] ?? {}) };
          const vEntry = { ...(state[current] ?? {}) };
          if (value) vEntry[kind] = value;
          else delete vEntry[kind];
          if (vEntry.img || vEntry.video) state[current] = vEntry;
          else delete state[current];
          if (Object.keys(state).length) all[stateId] = state;
          else delete all[stateId];
          await actor.setFlag(MODULE_ID, FLAG_TOKEN_ART, all);
          console.log(`[${MODULE_ID}] tokenArt.${stateId}.${current}.${kind} → ${value || "(cleared)"} on ${actor.name}`);
          syncRow();
          flashSaved();
        } catch (err) {
          console.error(`[${MODULE_ID}] tokenArt save failed`, err);
          ui.notifications.error(`[${MODULE_ID}] save failed — see console.`);
        }
      };

      imgInput.addEventListener("change", () => saveSlot("img", imgInput.value.trim()));
      vidInput.addEventListener("change", () => saveSlot("video", vidInput.value.trim()));
      row.querySelector(".cat-ts-img-browse").addEventListener("click", () => {
        this._pickFile("image", imgInput.value, (path) => {
          imgInput.value = path;
          saveSlot("img", path);
        });
      });
      row.querySelector(".cat-ts-video-browse").addEventListener("click", () => {
        this._pickFile("video", vidInput.value, (path) => {
          vidInput.value = path;
          saveSlot("video", path);
        });
      });
      row.querySelector(".cat-ts-img-clear").addEventListener("click", () => {
        imgInput.value = "";
        saveSlot("img", "");
      });
      row.querySelector(".cat-ts-video-clear").addEventListener("click", () => {
        vidInput.value = "";
        saveSlot("video", "");
      });
      tabs.forEach((t) => t.addEventListener("click", () => {
        current = t.dataset.v;
        syncRow();
      }));

      syncRow();
    });
  }

  /**
   * File picker helper — namespaced FilePicker (V13+), V12 global
   * fallback, and the V14 static browse API as last resort.
   * @param {"image"|"video"} type
   * @param {string} current   Current path for the picker field
   * @param {(path: string) => void} callback
   */
  _pickFile(type, current, callback) {
    const FilePickerClass = foundry.applications?.apps?.FilePicker ?? globalThis.FilePicker;
    const options = { type, current, callback };
    try {
      new FilePickerClass(options).browse();
    } catch {
      FilePickerClass.browse?.(options);
    }
  }

  /** Drag the window by its header. */
  _bindDrag(el) {
    const header = el.querySelector(".cat-tsettings-header");
    header.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      if (e.target.closest(".cat-tsettings-close")) return;
      e.preventDefault();
      const startX = e.clientX;
      const startY = e.clientY;
      const startLeft = parseFloat(el.style.left) || 0;
      const startTop = parseFloat(el.style.top) || 0;
      el.classList.add("cat-tsettings-dragging");

      const onMove = (ev) => {
        const w = el.offsetWidth;
        const h = el.offsetHeight;
        let left = startLeft + ev.clientX - startX;
        let top = startTop + ev.clientY - startY;
        left = Math.max(0, Math.min(left, window.innerWidth - w));
        top = Math.max(0, Math.min(top, window.innerHeight - h));
        el.style.left = `${left}px`;
        el.style.top = `${top}px`;
      };
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        el.classList.remove("cat-tsettings-dragging");
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    });
  }

  /** Center on first open. */
  _center(el) {
    // Must be measurable: it's already in the DOM at this point.
    const w = el.offsetWidth || 420;
    const h = el.offsetHeight || 480;
    el.style.left = `${Math.max(0, (window.innerWidth - w) / 2)}px`;
    el.style.top = `${Math.max(0, (window.innerHeight - h) / 2.4)}px`;
  }
}

TokenSettingsDialog.instance = new TokenSettingsDialog();

/**
 * Open the token settings dialog for a token (GM only).
 * @param {Token} token
 */
/**
 * v1.5.12 — pick a random IDLE variant for a freshly placed token.
 * Video wins within a variant. Returns null when no variant holds art.
 * @param {Actor} actor
 * @returns {string|null}
 */
/**
 * v1.5.13 — random art src for ANY state (uniform across its filled
 * variants; video wins inside a variant). randomIdleVariantSrc below
 * delegates to this.
 * @param {Actor} actor
 * @param {string} stateId  e.g. "idle", "run"
 * @returns {string|null}
 */
export function randomStateVariantSrc(actor, stateId) {
  const art = actor?.getFlag?.(MODULE_ID, FLAG_TOKEN_ART) ?? {};
  const candidates = Object.values(art[stateId] ?? {})
    .map((e) => e?.video || e?.img || null)
    .filter(Boolean);
  if (!candidates.length) return null;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

export function randomIdleVariantSrc(actor) {
  return randomStateVariantSrc(actor, "idle");
}

export function openTokenSettings(token) {
  TokenSettingsDialog.instance.open(token);
}
