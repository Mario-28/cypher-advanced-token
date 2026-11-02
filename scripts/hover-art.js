/**
 * Hover Art — storage helpers and the APPEARANCE floating media popup.
 *
 * Image and optional .webm video paths live in module flags, read back
 * with a scene-token → actor → actor-prototype fallback chain. (The
 * Prototype Token config row that used to write them was removed in
 * v1.5.1; the TOKEN SETTINGS dialog took over in v1.5.2, video in v1.5.5.)
 *
 * APPEARANCE popup behaviour: no overlay — the media floats LEFT of the
 * token in a chromeless window (raw image/video only, no panel). Press
 * and hold media to drag; scroll the wheel to zoom (anchored at the
 * cursor). Escape, the × button, or clicking anywhere else closes it.
 * Videos autoplay muted with a small speaker toggle for sound.
 *
 * @module hover-art
 */

import { MODULE_ID } from "./constants.js";

/** Hard limits for wheel zoom. */
const SCALE_MIN = 0.15;
const SCALE_MAX = 6;
/** Zoom factor per wheel notch. */
const ZOOM_STEP = 1.12;
/** Initial fit caps (natural size is never exceeded on first show). */
const FIT_MAX_W = 460;
const FIT_MAX_H = () => Math.round(window.innerHeight * 0.6);
/** Gap between token edge and popup. */
const SIDE_GAP = 12;

/** Shared flag reader: token → actor → prototype token. */
function _readFlagChain(token, key) {
  const fromToken = token.document?.getFlag?.(MODULE_ID, key);
  if (fromToken) return fromToken;
  const fromActor = token.actor?.getFlag?.(MODULE_ID, key);
  if (fromActor) return fromActor;
  const fromProto = token.actor?.prototypeToken?.getFlag?.(MODULE_ID, key);
  if (fromProto) return fromProto;
  return null;
}

/**
 * Read the hover art image path for a canvas token.
 * @param {Token} token  The canvas token
 * @returns {string|null}  Image path, or null when unset
 */
export function getHoverArt(token) {
  if (!token) return null;
  return _readFlagChain(token, "hoverArt");
}

/**
 * Read the hover art video path (.webm) for a canvas token (v1.5.5).
 * @param {Token} token  The canvas token
 * @returns {string|null}  Video path, or null when unset
 */
export function getHoverArtVideo(token) {
  if (!token) return null;
  return _readFlagChain(token, "hoverArtVideo");
}

/**
 * Token bounds in CLIENT coordinates (stage-logical px + canvas rect
 * offset — same-space comparison, no DPR scaling). Null when the canvas
 * is unavailable.
 */
function _tokenClientBounds(token) {
  try {
    const b = token.getBounds?.();
    const rect = canvas.app.view.getBoundingClientRect();
    if (!b) return null;
    return {
      left: rect.left + b.x,
      top: rect.top + b.y,
      width: b.width,
      height: b.height,
      right: rect.left + b.x + b.width,
      bottom: rect.top + b.y + b.height
    };
  } catch {
    return null;
  }
}

/**
 * Open the APPEARANCE popup for a token — hover art image (+ optional
 * .webm) floating left of the token. Singleton.
 * @param {Token} token  The canvas token that was clicked
 */
export function openHoverArtPopup(token) {
  const src = getHoverArt(token);
  const videoSrc = getHoverArtVideo(token);
  if (!src && !videoSrc) {
    console.log(`[${MODULE_ID}] APPEARANCE: no hover art for ${token.name}`);
    ui.notifications.warn(game.i18n.localize("CYPHERADVANCEDTOKEN.HOVERART.missing"));
    return;
  }
  console.log(`[${MODULE_ID}] APPEARANCE popup: img=${src} video=${videoSrc}`);
  _openMediaPopup({ token, src, videoSrc });
}

/**
 * Shared popup builder — floating media window, no overlay, left of the
 * token. Drag by holding media; wheel zooms at the cursor.
 * @param {object} opts
 * @param {Token} opts.token     Anchor token (placement)
 * @param {string|null} opts.src Image path
 * @param {string|null} opts.videoSrc  Optional .webm path
 */
function _openMediaPopup({ token, src, videoSrc }) {
  closeHoverArtPopup();

  const name = token.actor?.name || token.document?.name || "";
  const titleText = game.i18n.localize("CYPHERADVANCEDTOKEN.HOVERART.title");

  const pop = document.createElement("div");
  pop.className = "cat-artpop";
  const muteLabel = game.i18n.localize("CYPHERADVANCEDTOKEN.HOVERART.muteToggle");
  pop.innerHTML = `
    ${src ? `<img class="cat-artpop-img" src="${src}" alt="${name}" draggable="false" title="${titleText}">` : ""}
    ${videoSrc ? `
      <video class="cat-artpop-video" src="${videoSrc}" autoplay loop muted playsinline draggable="false" title="${titleText}"></video>
      <button class="cat-artpop-sound" title="${muteLabel}"><i class="fas fa-volume-xmark"></i></button>
    ` : ""}
    <button class="cat-artpop-close" title="Close"><i class="fas fa-xmark"></i></button>
    <div class="cat-artpop-caption">${name}</div>
  `;
  document.body.appendChild(pop);

  const img = pop.querySelector(".cat-artpop-img");
  const video = pop.querySelector(".cat-artpop-video");
  const close = () => closeHoverArtPopup();

  /* ---- close paths ---- */
  pop.querySelector(".cat-artpop-close").addEventListener("click", (e) => {
    e.stopPropagation();
    close();
  });

  const onKey = (e) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      close();
    }
  };
  document.addEventListener("keydown", onKey, true);
  pop._catKeyHandler = onKey;

  const onOutside = (e) => {
    if (!pop.contains(e.target)) close();
  };
  // Defer one tick so the opening click can't trigger it.
  setTimeout(() => document.addEventListener("mousedown", onOutside), 50);
  pop._catOutsideHandler = onOutside;

  /* ---- video sound toggle (autoplay is muted; tap the speaker) ---- */
  if (video) {
    const soundBtn = pop.querySelector(".cat-artpop-sound");
    const icon = soundBtn.querySelector("i");
    soundBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      video.muted = !video.muted;
      icon.className = video.muted ? "fas fa-volume-xmark" : "fas fa-volume-high";
      soundBtn.classList.toggle("cat-artpop-sound-on", !video.muted);
      if (!video.muted) video.play().catch(() => {});
    });
  }

  /* ---- drag: press and hold any media ---- */
  const bindDrag = (el) => {
    if (!el) return;
    el.addEventListener("dragstart", (e) => e.preventDefault());
    el.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      const startX = e.clientX;
      const startY = e.clientY;
      const startLeft = parseFloat(pop.style.left) || 0;
      const startTop = parseFloat(pop.style.top) || 0;
      pop.classList.add("cat-artpop-dragging");

      const onMove = (ev) => {
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        if (Math.hypot(dx, dy) < 4) return;
        let left = startLeft + dx;
        let top = startTop + dy;
        left = Math.max(0, Math.min(left, window.innerWidth - pop.offsetWidth));
        top = Math.max(0, Math.min(top, window.innerHeight - pop.offsetHeight));
        pop.style.left = `${left}px`;
        pop.style.top = `${top}px`;
      };
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        pop.classList.remove("cat-artpop-dragging");
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    });
  };
  bindDrag(img);
  bindDrag(video);

  /* ---- zoom state shared by image + video ---- */
  let scale = 1;
  const applyScale = () => {
    if (img && img.naturalWidth) img.style.width = `${Math.round(img.naturalWidth * scale)}px`;
    if (video && video.videoWidth) video.style.width = `${Math.round(video.videoWidth * scale)}px`;
  };

  pop.addEventListener("wheel", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!img?.naturalWidth && !video?.videoWidth) return;
    const next = Math.min(SCALE_MAX, Math.max(SCALE_MIN, scale * (e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP)));
    if (next === scale) return;
    const L = parseFloat(pop.style.left) || 0;
    const T = parseFloat(pop.style.top) || 0;
    // Unscaled media coords under the cursor → keep them under it
    const u = (e.clientX - L) / scale;
    const v = (e.clientY - T) / scale;
    scale = next;
    applyScale();
    pop.style.left = `${Math.round(e.clientX - u * scale)}px`;
    pop.style.top = `${Math.round(e.clientY - v * scale)}px`;
  }, { passive: false });

  /* ---- initial fit + placement ---- */
  const placeNextToToken = () => {
    const W = img ? img.naturalWidth : (video ? video.videoWidth : 0);
    const H = img ? img.naturalHeight : (video ? video.videoHeight : 0);
    if (!W || !H) return; // broken media — leave defaults
    const fitH = FIT_MAX_H();
    scale = Math.min(FIT_MAX_W / W, fitH / H, 1);
    if (!Number.isFinite(scale) || scale <= 0) scale = 1;
    applyScale();
    pop.style.left = "40px";
    pop.style.top = "40px";

    const tb = _tokenClientBounds(token);
    if (tb) {
      // Default: LEFT side of the token. No room there → dock right instead.
      let left = tb.left - pop.offsetWidth - SIDE_GAP;
      if (left < 8) {
        left = tb.right + SIDE_GAP;
      }
      left = Math.max(8, Math.min(left, window.innerWidth - pop.offsetWidth - 8));
      let top = Math.max(8, Math.min(tb.top, window.innerHeight - pop.offsetHeight - 8));
      pop.style.left = `${Math.round(left)}px`;
      pop.style.top = `${Math.round(top)}px`;
    }
  };

  let pending = 0;
  const onMediaReady = (el, evt) => {
    // Video elements don't report .complete — use readyState for them.
    const ready = el.tagName === "VIDEO"
      ? el.readyState >= 1
      : (el.complete && el.naturalWidth > 0);
    if (ready) {
      placeNextToToken();
    } else {
      pending++;
      el.addEventListener(evt, () => { if (--pending <= 0) placeNextToToken(); }, { once: true });
      if (img) img.addEventListener("error", () => {
        ui.notifications.warn(`${game.i18n.localize("CYPHERADVANCEDTOKEN.HOVERART.missing")} (${src})`);
        close();
      }, { once: true });
    }
  };
  if (img) onMediaReady(img, "load");
  if (video) onMediaReady(video, "loadedmetadata");

  requestAnimationFrame(() => pop.classList.add("cat-artpop-visible"));
}

/** Close the APPEARANCE popup if it is open. */
export function closeHoverArtPopup() {
  const el = document.querySelector(".cat-artpop");
  if (!el) return;
  if (el._catKeyHandler) document.removeEventListener("keydown", el._catKeyHandler, true);
  if (el._catOutsideHandler) document.removeEventListener("mousedown", el._catOutsideHandler);
  el.classList.remove("cat-artpop-visible");
  setTimeout(() => el.remove(), 160);
}
