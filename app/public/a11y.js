/*
 * נגישות — רכיב משותף לאתרים של אפי
 * Self-contained accessibility widget. No dependencies, no network calls, no tracking.
 * Usage: <script src="a11y.js" defer></script>
 * Optional config before the script:
 *   window.EFI_A11Y = { side: "left" | "right", storageKey: "my-site" };
 */
(function () {
  "use strict";
  if (window.__efiA11yLoaded) return;
  window.__efiA11yLoaded = true;

  var cfg = window.EFI_A11Y || {};
  var SIDE = cfg.side === "right" ? "right" : "left";
  var STORE_KEY = "efi-a11y:" + (cfg.storageKey || location.host + location.pathname);

  var STEP = 0.1, MIN_ZOOM = 0.8, MAX_ZOOM = 2.0;

  var DEFAULTS = {
    keyboard: false,      // ניווט מקלדת
    noMotion: false,      // ביטול אנימציות / הבהובים
    contrast: false,      // ניגודיות גבוהה
    zoom: 1,              // גודל טקסט
    readableFont: false,  // גופן קריא
    markHeadings: false,  // סימון כותרות
    markLinks: false      // סימון קישורים ולחצנים
  };

  function load() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (!raw) return Object.assign({}, DEFAULTS);
      var s = JSON.parse(raw);
      var out = Object.assign({}, DEFAULTS);
      for (var k in DEFAULTS) if (k in s) out[k] = s[k];
      if (typeof out.zoom !== "number" || isNaN(out.zoom)) out.zoom = 1;
      out.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, out.zoom));
      return out;
    } catch (e) { return Object.assign({}, DEFAULTS); }
  }
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) {}
  }

  var state = load();

  // Respect OS reduced-motion preference as the initial default (user can override).
  try {
    if (!localStorage.getItem(STORE_KEY) &&
        window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches) {
      state.noMotion = true;
    }
  } catch (e) {}

  var CSS = `
/* ==== נגישות: תשתית קבועה ==== */
.efi-a11y-skiplink {
  position: fixed; top: -60px; inset-inline-start: 12px; z-index: 2147483001;
  background: #0b3d91; color: #fff; padding: 10px 16px; border-radius: 8px;
  font: 600 15px/1.2 Arial, "Helvetica Neue", sans-serif; text-decoration: none;
  transition: top .15s ease;
}
.efi-a11y-skiplink:focus-visible { top: 10px; outline: 3px solid #ffb020; }

/* Always show a clear focus ring for keyboard users (only when focusing via keyboard). */
:focus-visible {
  outline: 3px solid #1a73e8 !important;
  outline-offset: 2px !important;
  border-radius: 4px;
}

#efi-a11y-root { position: fixed; inset: 0; pointer-events: none; z-index: 2147483000; }
#efi-a11y-root > * { pointer-events: auto; }

/* ==== הכפתור הצף ==== */
#efi-a11y-btn {
  position: fixed; ${SIDE}: 12px; top: calc(12px + env(safe-area-inset-top, 0px)); z-index: 2147483000;
  width: 52px; height: 52px; border-radius: 50%; border: 2px solid #fff;
  background: #1f6fd6; color: #fff; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 2px 10px rgba(0,0,0,.35);
  padding: 0;
}
#efi-a11y-btn:hover { background: #185db5; }
#efi-a11y-btn svg { width: 34px; height: 34px; }

/* ==== החלון ==== */
#efi-a11y-panel {
  position: fixed; ${SIDE}: 12px; top: calc(74px + env(safe-area-inset-top, 0px)); z-index: 2147483000;
  width: min(320px, calc(100vw - 24px));
  max-height: calc(100vh - 96px - env(safe-area-inset-top, 0px)); overflow-y: auto;
  box-sizing: border-box;
  background: #fff; color: #111; border-radius: 12px;
  box-shadow: 0 6px 28px rgba(0,0,0,.35);
  font: 400 16px/1.45 Arial, "Helvetica Neue", sans-serif;
  direction: rtl; text-align: right;
}
#efi-a11y-panel[hidden] { display: none; }
#efi-a11y-panel .a11y-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 14px; border-bottom: 1px solid #ddd; position: sticky; top: 0; background: #fff;
  border-radius: 12px 12px 0 0;
}
#efi-a11y-panel .a11y-head h2 { font-size: 17px; margin: 0; font-weight: 700; }
#efi-a11y-panel .a11y-close {
  background: none; border: none; font-size: 22px; cursor: pointer; color: #444;
  padding: 2px 8px; line-height: 1;
}
#efi-a11y-panel .a11y-rows { display: flex; flex-direction: column; }
#efi-a11y-panel .a11y-row {
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
  padding: 11px 14px; border-bottom: 1px solid #eee;
}
#efi-a11y-panel .a11y-row:last-child { border-bottom: none; }
#efi-a11y-panel .a11y-label { display: flex; align-items: center; gap: 10px; font-size: 15.5px; }
#efi-a11y-panel .a11y-label svg { width: 20px; height: 20px; flex: none; fill: #333; }
#efi-a11y-panel .a11y-switch {
  flex: none; width: 46px; height: 26px; border-radius: 13px; border: none;
  background: #c6c6c6; position: relative; cursor: pointer; transition: background .15s;
}
#efi-a11y-panel .a11y-switch::after {
  content: ""; position: absolute; top: 3px; inset-inline-start: 3px;
  width: 20px; height: 20px; border-radius: 50%; background: #fff; transition: inset-inline-start .15s;
}
#efi-a11y-panel .a11y-switch[aria-checked="true"] { background: #1f6fd6; }
#efi-a11y-panel .a11y-switch[aria-checked="true"]::after { inset-inline-start: 23px; }
#efi-a11y-panel .a11y-stepper { display: flex; align-items: center; gap: 8px; direction: ltr; }
#efi-a11y-panel .a11y-stepper button {
  width: 34px; height: 30px; border: 1px solid #bbb; background: #f5f5f5; border-radius: 6px;
  font-size: 17px; font-weight: 700; cursor: pointer; color: #111;
}
#efi-a11y-panel .a11y-stepper output { min-width: 44px; text-align: center; font-size: 14px; }
#efi-a11y-panel .a11y-reset {
  margin: 10px 14px 14px; padding: 9px; width: calc(100% - 28px);
  background: #f0f0f0; border: 1px solid #ccc; border-radius: 8px;
  font-size: 14.5px; cursor: pointer; color: #222;
}
#efi-a11y-panel .a11y-note {
  padding: 0 14px 12px; margin: 0; font-size: 12.5px; color: #666;
}

/* ==== מצבי תצוגה שהמשתמש מפעיל ==== */
html.efi-a11y-nomotion *, html.efi-a11y-nomotion *::before, html.efi-a11y-nomotion *::after {
  animation-duration: .001s !important;
  animation-iteration-count: 1 !important;
  transition-duration: .001s !important;
  scroll-behavior: auto !important;
}
html.efi-a11y-contrast { filter: contrast(1.45) saturate(1.05); }
html.efi-a11y-contrast img, html.efi-a11y-contrast video { filter: contrast(.9); }

html.efi-a11y-readable body, html.efi-a11y-readable body *:not(svg):not(path) {
  font-family: Arial, "Helvetica Neue", Helvetica, sans-serif !important;
  letter-spacing: .02em !important;
  word-spacing: .05em !important;
}
html.efi-a11y-readable body { line-height: 1.65 !important; }

html.efi-a11y-markheadings h1, html.efi-a11y-markheadings h2,
html.efi-a11y-markheadings h3, html.efi-a11y-markheadings h4,
html.efi-a11y-markheadings h5, html.efi-a11y-markheadings h6 {
  outline: 2px dashed #b26a00 !important;
  outline-offset: 2px !important;
  background-color: rgba(255, 200, 80, .18) !important;
}
html.efi-a11y-marklinks a, html.efi-a11y-marklinks button,
html.efi-a11y-marklinks [role="button"] {
  outline: 2px solid #0b57d0 !important;
  outline-offset: 1px !important;
}
html.efi-a11y-marklinks a { text-decoration: underline !important; }

/* ניווט מקלדת: focus בולט תמיד, גם בעכבר */
html.efi-a11y-keyboard :focus {
  outline: 3px solid #0b57d0 !important;
  outline-offset: 2px !important;
  box-shadow: 0 0 0 5px rgba(11, 87, 208, .25) !important;
}
@media (prefers-reduced-motion: reduce) {
  html.efi-a11y-nomotion * { animation: none !important; transition: none !important; }
}
`;

  var ICONS = {
    keyboard: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 5H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2zm0 12H4V7h16v10zM6 9h2v2H6zm4 0h2v2h-2zm4 0h2v2h-2zm4 0h2v2h-2zM6 13h12v2H6z"/></svg>',
    noMotion: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 18a8 8 0 0 1-8-8 7.86 7.86 0 0 1 1.66-4.87L16.87 18.34A7.93 7.93 0 0 1 12 20zm6.34-3.13L7.13 5.66A7.93 7.93 0 0 1 12 4a8 8 0 0 1 8 8 7.86 7.86 0 0 1-1.66 4.87z"/></svg>',
    contrast: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 18V4a8 8 0 0 1 0 16z"/></svg>',
    readableFont: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 2h2v20h-2z" opacity="0"/><path d="M9.5 4h5l4.5 16h-2.6l-1-3.8H8.6l-1 3.8H5zM12 6.8 9.7 13.6h4.6z"/></svg>',
    headings: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4v16h2v-7h10v7h2V4h-2v7H7V4z"/></svg>',
    links: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10.6 13.4a1 1 0 0 0 1.4 1.4l4-4a3 3 0 0 0-4.24-4.24l-2.3 2.3a1 1 0 0 0 1.42 1.42l2.3-2.3a1 1 0 0 1 1.4 1.4zm2.8-2.8a1 1 0 0 0-1.4-1.4l-4 4a3 3 0 0 0 4.24 4.24l2.3-2.3a1 1 0 0 0-1.42-1.42l-2.3 2.3a1 1 0 0 1-1.4-1.4z"/></svg>',
    text: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 17v-2h18v2zm4-4V7H5V5h6v2H9v6zm8 0V9h-2V7h6v2h-2v4z"/></svg>'
  };

  var PERSON_ICON = '<svg viewBox="0 0 24 24" fill="#fff" aria-hidden="true"><circle cx="12" cy="4.6" r="2.2"/><path d="M21 8.4c-2.4.7-5.6 1.1-9 1.1s-6.6-.4-9-1.1a1 1 0 0 0-.68 1.88C4.9 11 7.7 11.5 10.5 11.6v3.2l-2 6.5a1 1 0 0 0 1.9.6l1.6-5.3 1.6 5.3a1 1 0 1 0 1.9-.6l-2-6.5V11.6c2.8-.1 5.6-.6 8.18-1.33A1 1 0 0 0 21 8.4z"/></svg>';

  var root = document.documentElement;

  // Text resize with real reflow (no CSS zoom / transform): elements that
  // directly contain text get an inline font-size and line-height of
  // base x zoom, so text grows but layout widths stay intact and lines wrap.
  var textEls = [];

  function hasDirectText(el) {
    for (var n = el.firstChild; n; n = n.nextSibling) {
      if (n.nodeType === 3 && n.nodeValue.trim()) return true;
    }
    return false;
  }

  function restoreAll() {
    for (var i = 0; i < textEls.length; i++) {
      var t = textEls[i];
      t.el.style.fontSize = t.origFs;
      t.el.style.lineHeight = t.origLh;
    }
    textEls = [];
  }

  function scanText() {
    textEls = [];
    var all = document.body.getElementsByTagName("*");
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      if (el.closest("#efi-a11y-root")) continue;
      var tag = el.tagName;
      if (tag === "SCRIPT" || tag === "STYLE" || tag === "SVG" || tag === "NOSCRIPT") continue;
      if (!hasDirectText(el)) continue;
      var cs = getComputedStyle(el);
      var fs = parseFloat(cs.fontSize), lh = parseFloat(cs.lineHeight);
      if (!fs) continue;
      // origFs/origLh preserve any pre-existing inline styles for restore.
      textEls.push({ el: el, fs: fs, lh: isNaN(lh) ? null : lh,
                     origFs: el.style.fontSize || "", origLh: el.style.lineHeight || "" });
    }
  }

  // Single scaling mechanism: inline px on text-bearing elements only.
  // No root font-size scaling, so rem-based text is captured at true base
  // and repeated applies / observer rescans can never compound.
  function applyZoom() {
    var z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, state.zoom));
    restoreAll(); // back to true base before any measurement
    if (Math.abs(z - 1) >= 0.001) {
      scanText();
      for (var j = 0; j < textEls.length; j++) {
        var t = textEls[j];
        t.el.style.fontSize = (t.fs * z) + "px";
        if (t.lh) t.el.style.lineHeight = (t.lh * z) + "px";
      }
    }
    var out = panel && panel.querySelector("#a11y-zoom-val");
    if (out) out.value = Math.round(z * 100) + "%";
  }

  // Content injected while zoom is active (e.g. modal bodies) gets scaled too.
  var rescanTimer = null;
  new MutationObserver(function (muts) {
    if (Math.abs(state.zoom - 1) < 0.001) return;
    for (var i = 0; i < muts.length; i++) {
      if (muts[i].addedNodes.length) {
        if (rescanTimer) return;
        rescanTimer = setTimeout(function () { rescanTimer = null; applyZoom(); }, 150);
        return;
      }
    }
  }).observe(document.body, { childList: true, subtree: true });

  function applyAll() {
    root.classList.toggle("efi-a11y-keyboard", !!state.keyboard);
    root.classList.toggle("efi-a11y-nomotion", !!state.noMotion);
    root.classList.toggle("efi-a11y-contrast", !!state.contrast);
    root.classList.toggle("efi-a11y-readable", !!state.readableFont);
    root.classList.toggle("efi-a11y-markheadings", !!state.markHeadings);
    root.classList.toggle("efi-a11y-marklinks", !!state.markLinks);
    applyZoom();
  }

  // ---------- build DOM ----------
  var style = document.createElement("style");
  style.id = "efi-a11y-style";
  style.textContent = CSS;
  document.head.appendChild(style);

  // Skip link (always available for keyboard users)
  var skip = document.createElement("a");
  skip.href = "#";
  skip.className = "efi-a11y-skiplink";
  skip.textContent = "דלג לתוכן הראשי";
  skip.addEventListener("click", function (e) {
    e.preventDefault();
    var t = document.querySelector("main, [role='main'], #main, #content, h1");
    if (t) {
      if (!t.hasAttribute("tabindex")) t.setAttribute("tabindex", "-1");
      t.focus({ preventScroll: false });
      t.scrollIntoView({ block: "start" });
    }
  });
  document.body.appendChild(skip);

  // Mounted on <html> (not <body>) so body zoom never distorts the widget.
  var widgetRoot = document.createElement("div");
  widgetRoot.id = "efi-a11y-root";
  document.documentElement.appendChild(widgetRoot);

  var btn = document.createElement("button");
  btn.id = "efi-a11y-btn";
  btn.type = "button";
  btn.setAttribute("aria-label", "פתיחת תפריט נגישות");
  btn.setAttribute("aria-expanded", "false");
  btn.innerHTML = PERSON_ICON;

  var panel = document.createElement("section");
  panel.id = "efi-a11y-panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "תפריט נגישות");
  panel.hidden = true;

  function row(labelText, icon, controlHtml) {
    return '<div class="a11y-row"><span class="a11y-label">' + icon + "<span>" + labelText +
      "</span></span>" + controlHtml + "</div>";
  }
  function sw(key, labelText) {
    return '<button type="button" class="a11y-switch" role="switch" data-key="' + key +
      '" aria-checked="' + (!!state[key]) + '" aria-label="' + labelText + '"></button>';
  }

  panel.innerHTML =
    '<div class="a11y-head"><h2>נגישות</h2>' +
    '<button type="button" class="a11y-close" aria-label="סגירת תפריט נגישות">✕</button></div>' +
    '<div class="a11y-rows">' +
    row("ניווט מקלדת", ICONS.keyboard, sw("keyboard", "ניווט מקלדת")) +
    row("ביטול אנימציות / הבהובים", ICONS.noMotion, sw("noMotion", "ביטול אנימציות / הבהובים")) +
    row("ניגודיות גבוהה", ICONS.contrast, sw("contrast", "ניגודיות גבוהה")) +
    row("גודל טקסט", ICONS.text,
      '<span class="a11y-stepper">' +
      '<button type="button" data-step="1" aria-label="הגדלת טקסט">+</button>' +
      '<output id="a11y-zoom-val">' + Math.round(state.zoom * 100) + "%</output>" +
      '<button type="button" data-step="-1" aria-label="הקטנת טקסט">−</button></span>') +
    row("גופן קריא", ICONS.readableFont, sw("readableFont", "גופן קריא")) +
    row("סימון כותרות", ICONS.headings, sw("markHeadings", "סימון כותרות")) +
    row("סימון קישורים ולחצנים", ICONS.links, sw("markLinks", "סימון קישורים ולחצנים")) +
    "</div>" +
    '<p class="a11y-note">ההגדרות נשמרות במכשיר הזה בלבד. התפריט מקל על הקריאה והניווט, אך אינו מבטיח שהאתר נגיש במלואו.</p>' +
    '<button type="button" class="a11y-reset">איפוס הגדרות נגישות</button>';

  widgetRoot.appendChild(btn);
  widgetRoot.appendChild(panel);

  // ---------- behavior ----------
  var lastFocus = null;

  function openPanel() {
    lastFocus = document.activeElement;
    panel.hidden = false;
    btn.setAttribute("aria-expanded", "true");
    btn.setAttribute("aria-label", "סגירת תפריט נגישות");
    var first = panel.querySelector(".a11y-close");
    if (first) first.focus();
  }
  function closePanel() {
    panel.hidden = true;
    btn.setAttribute("aria-expanded", "false");
    btn.setAttribute("aria-label", "פתיחת תפריט נגישות");
    if (lastFocus && lastFocus.focus) lastFocus.focus(); else btn.focus();
  }

  btn.addEventListener("click", function () {
    panel.hidden ? openPanel() : closePanel();
  });
  panel.querySelector(".a11y-close").addEventListener("click", closePanel);
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !panel.hidden) closePanel();
  });

  panel.addEventListener("click", function (e) {
    var s = e.target.closest(".a11y-switch");
    if (s) {
      var key = s.getAttribute("data-key");
      state[key] = !state[key];
      s.setAttribute("aria-checked", String(!!state[key]));
      applyAll(); save();
      return;
    }
    var st = e.target.closest("[data-step]");
    if (st) {
      var d = Number(st.getAttribute("data-step"));
      state.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round((state.zoom + d * STEP) * 100) / 100));
      applyAll(); save();
      return;
    }
    if (e.target.closest(".a11y-reset")) {
      state = Object.assign({}, DEFAULTS);
      panel.querySelectorAll(".a11y-switch").forEach(function (x) {
        x.setAttribute("aria-checked", "false");
      });
      applyAll(); save();
    }
  });

  applyAll();
})();
