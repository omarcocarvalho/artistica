/* Artistica mockups — tiny shared interactions. Vanilla JS, no build.
   Everything is driven by data-attributes so screens stay plain HTML.  */
(function () {
  "use strict";

  /* ---------- Theme (runs immediately to avoid a flash) ---------------- */
  var KEY = "artistica-theme"; // "light" | "dark" | "system"
  function readTheme() { try { return localStorage.getItem(KEY) || "system"; } catch (e) { return "system"; } }
  function writeTheme(v) { try { localStorage.setItem(KEY, v); } catch (e) { /* private mode */ } }
  function applyTheme(mode) {
    var root = document.documentElement;
    if (mode === "light" || mode === "dark") root.setAttribute("data-theme", mode);
    else root.removeAttribute("data-theme");
    document.querySelectorAll("[data-theme-toggle]").forEach(function (b) {
      b.setAttribute("data-mode", mode);
      var label = { light: "Light theme", dark: "Dark theme", system: "System theme" }[mode];
      b.setAttribute("aria-label", "Theme: " + label + ". Change theme");
      var t = b.querySelector("[data-theme-label]");
      if (t) t.textContent = { light: "Light", dark: "Dark", system: "Auto" }[mode];
    });
  }
  // ?theme=light|dark|system in the URL overrides (handy for reviews/screenshots)
  try {
    var q = new URLSearchParams(location.search).get("theme");
    if (q === "light" || q === "dark" || q === "system") writeTheme(q);
  } catch (e) { /* ignore */ }
  applyTheme(readTheme());

  function ready(fn) {
    if (document.readyState !== "loading") fn();
    else document.addEventListener("DOMContentLoaded", fn);
  }

  ready(function () {
    applyTheme(readTheme());
    var $ = function (s, r) { return (r || document).querySelector(s); };
    var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

    /* Theme toggle: system -> light -> dark -> system */
    $$("[data-theme-toggle]").forEach(function (b) {
      b.addEventListener("click", function () {
        var next = { system: "light", light: "dark", dark: "system" }[readTheme()] || "system";
        writeTheme(next); applyTheme(next);
      });
    });

    /* ---------- Tabs (WAI-ARIA tabs, arrow keys) ----------------------- */
    $$("[role=tablist]").forEach(function (list) {
      var tabs = $$("[role=tab]", list);
      function select(tab, focus) {
        tabs.forEach(function (t) {
          var on = t === tab;
          t.setAttribute("aria-selected", on ? "true" : "false");
          t.tabIndex = on ? 0 : -1;
          var p = document.getElementById(t.getAttribute("aria-controls"));
          if (p) p.hidden = !on;
        });
        if (focus) tab.focus();
      }
      tabs.forEach(function (t, i) {
        t.addEventListener("click", function () { select(t); });
        t.addEventListener("keydown", function (e) {
          var k = e.key, n = null;
          if (k === "ArrowRight") n = tabs[(i + 1) % tabs.length];
          if (k === "ArrowLeft") n = tabs[(i - 1 + tabs.length) % tabs.length];
          if (k === "Home") n = tabs[0];
          if (k === "End") n = tabs[tabs.length - 1];
          if (n) { e.preventDefault(); select(n, true); }
        });
      });
    });

    /* ---------- Step flow (mobile) ------------------------------------- */
    $$("[data-stepper]").forEach(function (root) {
      var panels = $$("[data-step]", root);
      var tabs = $$("[data-step-tab]", root);
      var idx = 0;
      function go(i, focus) {
        idx = Math.max(0, Math.min(panels.length - 1, i));
        panels.forEach(function (p, j) { p.hidden = j !== idx; });
        tabs.forEach(function (t, j) {
          if (j === idx) t.setAttribute("aria-current", "step"); else t.removeAttribute("aria-current");
          t.classList.toggle("is-done", j < idx);
        });
        $$("[data-step-prev]", root).forEach(function (b) { b.disabled = idx === 0; });
        $$("[data-step-next]", root).forEach(function (b) { b.hidden = idx === panels.length - 1; });
        var h = panels[idx].querySelector("h2");
        if (h && focus) { h.tabIndex = -1; h.focus({ preventScroll: true }); }
      }
      tabs.forEach(function (t, j) { t.addEventListener("click", function () { go(j, true); }); });
      $$("[data-step-next]", root).forEach(function (b) { b.addEventListener("click", function () { go(idx + 1, true); }); });
      $$("[data-step-prev]", root).forEach(function (b) { b.addEventListener("click", function () { go(idx - 1, true); }); });
      $$("[data-step-goto]", root).forEach(function (b) { b.addEventListener("click", function () { go(+b.getAttribute("data-step-goto"), true); }); });
      go(+(root.getAttribute("data-stepper") || 0));
    });

    /* ---------- Dialogs & sheets --------------------------------------- */
    $$("[data-open]").forEach(function (b) {
      b.addEventListener("click", function () {
        var d = document.getElementById(b.getAttribute("data-open"));
        if (!d) return;
        if (d.tagName === "DIALOG") { if (!d.open) d.showModal(); }
        else { d.hidden = false; var f = d.querySelector("button, input, select, [tabindex]"); if (f) f.focus(); }
      });
    });
    $$("[data-close]").forEach(function (b) {
      b.addEventListener("click", function () {
        var id = b.getAttribute("data-close");
        var d = id ? document.getElementById(id) : b.closest("dialog, [data-sheet]");
        if (!d) return;
        if (d.tagName === "DIALOG") d.close(); else d.hidden = true;
      });
    });
    $$("dialog[data-autoopen]").forEach(function (d) { d.showModal(); });
    // Esc closes non-dialog sheets
    document.addEventListener("keydown", function (e) {
      if (e.key !== "Escape") return;
      $$("[data-sheet]").forEach(function (s) { if (!s.hidden) s.hidden = true; });
    });

    /* ---------- Sliders: live output + track fill ---------------------- */
    function syncRange(r) {
      var min = +r.min || 0, max = +r.max || 100;
      r.style.setProperty("--fill", ((r.value - min) / (max - min)) * 100 + "%");
      var outId = r.getAttribute("data-out");
      if (outId) {
        var o = document.getElementById(outId);
        if (o) o.textContent = r.value + (r.getAttribute("data-unit") || "");
      }
      var cssVar = r.getAttribute("data-css-var");
      if (cssVar) {
        var t = document.querySelector(r.getAttribute("data-target") || "body");
        if (t) t.style.setProperty(cssVar, r.value + (r.getAttribute("data-css-unit") || ""));
      }
    }
    $$("input[type=range]").forEach(function (r) { syncRange(r); r.addEventListener("input", function () { syncRange(r); }); });

    /* Generic CSS-var setter for colour inputs / selects */
    $$("input[type=color][data-css-var], select[data-css-var]").forEach(function (el) {
      function sync() {
        var t = document.querySelector(el.getAttribute("data-target") || "body");
        if (t) t.style.setProperty(el.getAttribute("data-css-var"), el.value);
      }
      sync(); el.addEventListener("input", sync);
    });

    /* ---------- Checkbox -> class on target; checkbox/radio -> reveal --- */
    $$("[data-toggle-class]").forEach(function (cb) {
      function sync() {
        $$(cb.getAttribute("data-target")).forEach(function (t) {
          t.classList.toggle(cb.getAttribute("data-toggle-class"), cb.checked);
        });
      }
      sync(); cb.addEventListener("change", sync);
    });
    $$("[data-reveal]").forEach(function (el) {
      function sync() {
        var t = document.getElementById(el.getAttribute("data-reveal"));
        if (t) t.hidden = !el.checked;
      }
      sync();
      var group = el.name ? $$('input[name="' + el.name + '"]') : [el];
      group.forEach(function (g) { g.addEventListener("change", sync); });
    });
    // <select data-reveal-value="custom" data-reveal-target="id">
    $$("select[data-reveal-value]").forEach(function (s) {
      function sync() {
        var t = document.getElementById(s.getAttribute("data-reveal-target"));
        if (t) t.hidden = s.value !== s.getAttribute("data-reveal-value");
      }
      sync(); s.addEventListener("change", sync);
    });

    /* ---------- Steppers (copies) -------------------------------------- */
    $$("[data-inc],[data-dec]").forEach(function (b) {
      b.addEventListener("click", function () {
        var id = b.getAttribute("data-inc") || b.getAttribute("data-dec");
        var i = document.getElementById(id);
        var d = b.hasAttribute("data-inc") ? 1 : -1;
        var v = Math.max(+i.min || 1, Math.min(+i.max || 99, (+i.value || 0) + d));
        i.value = v; i.dispatchEvent(new Event("input", { bubbles: true }));
      });
    });

    /* ---------- Image transforms in the edit sheet --------------------- */
    $$("[data-transform]").forEach(function (b) {
      b.addEventListener("click", function () {
        var t = document.querySelector(b.getAttribute("data-target"));
        if (!t) return;
        var s = t._tf || (t._tf = { r: 0, fx: 1, fy: 1 });
        var a = b.getAttribute("data-transform");
        if (a === "rotate-left") s.r -= 90;
        if (a === "rotate-right") s.r += 90;
        if (a === "flip-x") s.fx *= -1;
        if (a === "flip-y") s.fy *= -1;
        t.style.transform = "rotate(" + s.r + "deg) scale(" + s.fx + "," + s.fy + ")";
      });
    });

    /* ---------- Hue picker + generated value ramp ---------------------- */
    function renderRamps(scope) {
      var hue = +(scope.getAttribute("data-hue") || 40);
      var neutral = scope.getAttribute("data-neutral") === "true";
      var countEl = scope.querySelector("[data-values-count]");
      var n = countEl ? +countEl.value : 5;
      $$("[data-ramp]", scope).forEach(function (ramp) {
        ramp.innerHTML = "";
        for (var i = 0; i < n; i++) {
          var t = n === 1 ? 0 : i / (n - 1);
          var L = 0.2 + t * 0.75;                       // near-black -> lightest tint
          var C = neutral ? 0 : 0.045 + Math.sin(t * Math.PI) * 0.05 - t * 0.02;
          var s = document.createElement("span");
          s.style.background = "oklch(" + L.toFixed(3) + " " + Math.max(0.02, C).toFixed(3) + " " + hue + ")";
          if (neutral) s.style.background = "oklch(" + L.toFixed(3) + " 0 0)";
          ramp.appendChild(s);
        }
        ramp.setAttribute("aria-label", n + " values, from darkest to lightest tint");
      });
      var target = document.querySelector(scope.getAttribute("data-ramp-target") || "[data-ramp-preview]");
      if (target) {
        target.style.setProperty("--hue", hue);
        $$(".is-values", target).forEach(function (el) {
          el.classList.toggle("is-notan", n === 2);
          if (neutral) ["--p1", "--p2", "--p3", "--p4", "--p5"].forEach(function (p, k) {
            el.style.setProperty(p, "oklch(" + (0.2 + k * 0.1875).toFixed(3) + " 0 0)");
          }); else ["--p1", "--p2", "--p3", "--p4", "--p5"].forEach(function (p) { el.style.removeProperty(p); });
        });
      }
    }
    $$("[data-hue-scope]").forEach(function (scope) {
      $$("[data-hue]", scope).forEach(function (sw) {
        if (sw === scope) return;
        sw.addEventListener("click", function () {
          $$("[data-hue]", scope).forEach(function (o) { if (o !== scope) o.setAttribute("aria-pressed", "false"); });
          sw.setAttribute("aria-pressed", "true");
          scope.setAttribute("data-hue", sw.getAttribute("data-hue"));
          scope.setAttribute("data-neutral", sw.hasAttribute("data-neutral") ? "true" : "false");
          var hs = scope.querySelector("[data-hue-slider]");
          if (hs) { hs.value = sw.getAttribute("data-hue"); hs.dispatchEvent(new Event("input")); }
          renderRamps(scope);
        });
      });
      var hs = scope.querySelector("[data-hue-slider]");
      if (hs) hs.addEventListener("input", function () {
        scope.setAttribute("data-hue", hs.value);
        scope.setAttribute("data-neutral", "false");
        renderRamps(scope);
      });
      var c = scope.querySelector("[data-values-count]");
      if (c) c.addEventListener("input", function () { renderRamps(scope); });
      renderRamps(scope);
    });

    /* ---------- Page setup: units + "gutter ≥ 2 × bleed" rule ---------- */
    $$("[data-page-form]").forEach(function (form) {
      var unitRadios = $$('input[name="units"]', form);
      function currentUnit() { var r = unitRadios.filter(function (x) { return x.checked; })[0]; return r ? r.value : "mm"; }
      function fmt(mm) { return currentUnit() === "in" ? (mm / 25.4).toFixed(2) : String(Math.round(mm * 10) / 10); }
      function show() {
        $$("[data-mm]", form).forEach(function (i) { i.value = fmt(+i.getAttribute("data-mm")); });
        $$(".unit", form).forEach(function (u) { u.textContent = currentUnit(); });
      }
      $$("[data-mm]", form).forEach(function (i) {
        i.addEventListener("change", function () {
          var v = parseFloat(i.value) || 0;
          var mm = currentUnit() === "in" ? v * 25.4 : v;
          var min = parseFloat(i.getAttribute("data-min-mm") || "0");
          if (mm < min) mm = min;
          i.setAttribute("data-mm", String(mm));
          enforce(); show(); syncSheet();
        });
      });
      unitRadios.forEach(function (r) { r.addEventListener("change", show); });

      var gutterOn = $("#gutter-on", form), bleedOn = $("#bleed-on", form);
      var gutter = $("#gutter", form), bleed = $("#bleed", form), note = $("#bleed-note", form);
      function enforce() {
        if (!bleedOn || !gutter) return;
        var raised = false;
        if (bleedOn.checked) {
          var b = +bleed.getAttribute("data-mm"), g = +gutter.getAttribute("data-mm");
          if (!gutterOn.checked) { gutterOn.checked = true; raised = true; }
          if (g < 2 * b) { gutter.setAttribute("data-mm", String(2 * b)); raised = true; }
        }
        if (note) {
          if (raised) note.hidden = false;
          var span = note.querySelector("[data-gutter-value]");
          if (span) span.textContent = fmt(+gutter.getAttribute("data-mm")) + " " + currentUnit();
        }
        gutterOn.dispatchEvent(new Event("change"));
      }
      function syncSheet() {
        var safe = $("#safe", form);
        $$(form.getAttribute("data-page-form")).forEach(function (sheet) {
          if (gutter) sheet.style.setProperty("--gutter", gutterOn && gutterOn.checked ? gutter.getAttribute("data-mm") : 0);
          if (bleed) sheet.style.setProperty("--bleed", bleed.getAttribute("data-mm"));
          if (safe) sheet.style.setProperty("--safe", safe.getAttribute("data-mm"));
        });
      }
      [bleedOn, gutterOn].forEach(function (el) {
        if (el) el.addEventListener("change", function (e) { if (e.isTrusted) { enforce(); show(); syncSheet(); } });
      });
      show(); syncSheet();
    });

    /* Paper picker: mini paper-shape icon follows size + orientation */
    $$("[data-paper-select]").forEach(function (sel) {
      var icon = document.getElementById(sel.getAttribute("data-paper-select"));
      function sync() {
        var o = sel.options[sel.selectedIndex];
        var wh = (o.getAttribute("data-wh") || "210x297").split("x");
        var orient = (document.querySelector('input[name="orientation"]:checked') || {}).value;
        var w = +wh[0], h = +wh[1];
        if (orient === "landscape" && w < h || orient === "portrait" && w > h) { var t = w; w = h; h = t; }
        if (icon) { icon.style.aspectRatio = w + " / " + h; icon.title = w + " × " + h + " mm"; }
        var lbl = document.querySelector("[data-paper-dims]");
        if (lbl) lbl.textContent = sel.value === "custom" ? "" : w + " × " + h + " mm";
      }
      sel.addEventListener("change", sync);
      $$('input[name="orientation"]').forEach(function (r) { r.addEventListener("change", sync); });
      sync();
    });

    /* ---------- Image list selection ----------------------------------- */
    $$("[data-image-list]").forEach(function (list) {
      $$(".image-item", list).forEach(function (item) {
        item.addEventListener("click", function (e) {
          if (e.target.closest(".image-item__actions")) return;
          $$(".image-item", list).forEach(function (o) { o.removeAttribute("aria-current"); });
          item.setAttribute("aria-current", "true");
          var id = item.getAttribute("data-tile");
          $$(".tile.is-selected").forEach(function (t) { t.classList.remove("is-selected"); });
          if (id) $$('.tile[data-id="' + id + '"]').forEach(function (t) { t.classList.add("is-selected"); });
          $$("[data-selected-name]").forEach(function (n) { n.textContent = item.getAttribute("data-name") || ""; });
        });
      });
    });

    /* ---------- Fake export progress ----------------------------------- */
    $$("[data-fake-export]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var root = document.getElementById(btn.getAttribute("data-fake-export"));
        if (!root) return;
        var ready = $("[data-export-ready]", root), running = $("[data-export-running]", root), done = $("[data-export-done]", root);
        var fill = $(".progress__fill", root), label = $("[data-progress-label]", root), bar = $("[role=progressbar]", root);
        var steps = $$(".page-steps li", root);
        ready.hidden = true; running.hidden = false; done.hidden = true;
        var total = steps.length, i = 0;
        function tick() {
          steps.forEach(function (s, j) { s.setAttribute("data-state", j < i ? "done" : j === i ? "active" : "todo"); });
          var pct = Math.round((i / total) * 100);
          fill.style.setProperty("--value", pct + "%");
          bar.setAttribute("aria-valuenow", String(pct));
          label.textContent = i < total ? "Page " + (i + 1) + " of " + total + "…" : "Finishing…";
          if (i >= total) { setTimeout(function () { running.hidden = true; done.hidden = false; var h = $("h3", done); if (h) { h.tabIndex = -1; h.focus(); } }, 500); return; }
          i++; root._t = setTimeout(tick, 900);
        }
        tick();
      });
    });
    $$("[data-cancel-export]").forEach(function (b) {
      b.addEventListener("click", function () {
        var root = document.getElementById(b.getAttribute("data-cancel-export"));
        clearTimeout(root._t);
        $("[data-export-ready]", root).hidden = false;
        $("[data-export-running]", root).hidden = true;
        $("[data-export-done]", root).hidden = true;
      });
    });

    /* ---------- Fake model download (AI lines) ------------------------- */
    $$("[data-fake-download]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var root = document.getElementById(btn.getAttribute("data-fake-download"));
        var bar = $("[role=progressbar]", root), fill = $(".progress__fill", root), lbl = $("[data-dl-label]", root);
        var prompt = $("[data-dl-prompt]", root), run = $("[data-dl-running]", root), done = $("[data-dl-done]", root);
        prompt.hidden = true; run.hidden = false;
        var p = 0, total = +(root.getAttribute("data-mb") || 5);
        (function step() {
          p = Math.min(100, p + 9);
          fill.style.setProperty("--value", p + "%");
          bar.setAttribute("aria-valuenow", String(p));
          lbl.textContent = (total * p / 100).toFixed(1) + " of " + total + " MB";
          if (p < 100) setTimeout(step, 180);
          else { run.hidden = true; done.hidden = false; var target = root.getAttribute("data-on-done"); if (target) $$(target).forEach(function (t) { t.classList.add(root.getAttribute("data-on-done-class")); }); }
        })();
      });
    });

    /* ---------- Arrange mode demo (keyboard; drag is shown as states) --- */
    $$("[data-arrange-demo]").forEach(function (root) {
      var SAFE = 5, GUTTER = 6, MIN = 20;
      var live = $("[data-arrange-live]", root);
      var undoBtn = $("[data-arrange-undo]", root);
      var rerunBtn = $("[data-arrange-rerun-open]", root);
      function changed(on) { undoBtn.disabled = undo.length === 0; if (rerunBtn) rerunBtn.disabled = !on; }
      var blocks = $$("[data-block]", root);
      var undo = [], picked = null;
      function num(el, v) { return +el.style.getPropertyValue(v); }
      function box(el) { return { x: num(el, "--x"), y: num(el, "--y"), w: num(el, "--w"), h: num(el, "--h") }; }
      function pageOf(el) { return +el.closest("[data-page]").getAttribute("data-page"); }
      function snapshot() { return blocks.map(function (b) { return { b: b, s: b.getAttribute("style"), t: $$(".tile", b).map(function (t) { return t.getAttribute("style"); }) }; }); }
      function restore(snap) { snap.forEach(function (r) { r.b.setAttribute("style", r.s); $$(".tile", r.b).forEach(function (t, i) { t.setAttribute("style", r.t[i]); }); label(r.b); }); }
      var initial = snapshot();
      function say(text) { if (live) { live.textContent = ""; setTimeout(function () { live.textContent = text; }, 30); } }
      function label(b) { var r = box(b); b.setAttribute("aria-label", b.getAttribute("data-name") + ", " + r.w + " × " + r.h + " mm, page " + pageOf(b)); }
      function select(b) { blocks.forEach(function (o) { o.classList.toggle("is-selected", o === b); }); var w = $("[data-width]", root); if (w) { var t = $(".tile", b); w.value = t ? num(t, "--w") : box(b).w; } }
      function refusal(b, r) {
        if (r.x < SAFE || r.y < SAFE || r.x + r.w > 210 - SAFE || r.y + r.h > 297 - SAFE) return "it would go past the margin";
        var p = pageOf(b);
        for (var i = 0; i < blocks.length; i++) {
          var o = blocks[i]; if (o === b || pageOf(o) !== p) continue;
          var q = box(o);
          if (r.x < q.x + q.w + GUTTER && q.x < r.x + r.w + GUTTER && r.y < q.y + q.h + GUTTER && q.y < r.y + r.h + GUTTER) return "it would overlap another photo";
        }
        return null;
      }
      function commit(b, r, scale) {
        var why = refusal(b, r);
        if (why) { say("Can't place it there: " + why + "."); return; }
        undo.push(snapshot()); if (undo.length > 50) undo.shift(); changed(true);
        b.style.setProperty("--x", r.x); b.style.setProperty("--y", r.y); b.style.setProperty("--w", r.w); b.style.setProperty("--h", r.h);
        if (scale) $$(".tile", b).forEach(function (t) { ["--x", "--y", "--w", "--h"].forEach(function (v) { t.style.setProperty(v, Math.round(num(t, v) * scale * 10) / 10); }); });
        label(b);
        say(b.getAttribute("data-name") + ", " + r.w + " × " + r.h + " mm, page " + pageOf(b) + ", " + r.x + " mm from the left, " + r.y + " mm from the top.");
      }
      function move(b, k) { var r = box(b), d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[k]; commit(b, { x: r.x + d[0], y: r.y + d[1], w: r.w, h: r.h }); }
      $$("[data-nudge]", root).forEach(function (n) { n.addEventListener("click", function () { var b = $(".block.is-selected", root); if (b) move(b, n.getAttribute("data-nudge")); }); });
      blocks.forEach(function (b) {
        b.addEventListener("click", function () { select(b); });
        b.addEventListener("focus", function () { select(b); });
        b.addEventListener("keydown", function (e) {
          if (!root.classList.contains("is-arranging")) return;
          var r = box(b), k = e.key, d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[k];
          if (d) {
            e.preventDefault();
            if (e.shiftKey) {
              if (b.getAttribute("data-fixed") === "1") { say("Fixed size: change it in Edit."); return; }
              var first = $(".tile", b), tw = num(first, "--w"), grow = (k === "ArrowRight" || k === "ArrowDown") ? 1 : -1;
              var ntw = tw + grow; if (Math.min(ntw, num(first, "--h") * ntw / tw) < MIN) { say("Can't make it smaller: photos keep at least 20 mm on their short side."); return; }
              var s = ntw / tw;
              commit(b, { x: r.x, y: r.y, w: Math.round(r.w * s * 10) / 10, h: Math.round(r.h * s * 10) / 10 }, s);
            } else move(b, k);
          } else if (k === "Enter" || k === " ") {
            e.preventDefault();
            if (picked && picked !== b) {
              var a = box(picked), c = box(b);
              undo.push(snapshot()); changed(true);
              picked.style.setProperty("--x", c.x); picked.style.setProperty("--y", c.y);
              b.style.setProperty("--x", a.x); b.style.setProperty("--y", a.y);
              var pa = picked.closest("[data-page]"), pb = b.closest("[data-page]");
              if (pa !== pb) { var mark = document.createComment(""); pa.replaceChild(mark, picked); pb.replaceChild(picked, b); pa.replaceChild(b, mark); }
              picked.classList.remove("block--picked"); label(picked); label(b);
              say("Swapped " + picked.getAttribute("data-name") + " and " + b.getAttribute("data-name") + ".");
              picked = null;
            } else if (picked === b) { b.classList.remove("block--picked"); picked = null; say("Cancelled."); }
            else { picked = b; b.classList.add("block--picked"); say("Picked up " + b.getAttribute("data-name") + ". Move to another photo and press Enter to swap, or Escape to cancel."); }
          } else if (k === "Escape" && picked) { picked.classList.remove("block--picked"); picked = null; say("Cancelled."); }
        });
      });
      var toggle = $("[data-arrange-toggle]", root);
      if (toggle) toggle.addEventListener("click", function () {
        var on = toggle.getAttribute("aria-pressed") !== "true";
        toggle.setAttribute("aria-pressed", on ? "true" : "false");
        root.classList.toggle("is-arranging", on);
        blocks.forEach(function (b) { if (on) { b.setAttribute("role", "button"); b.setAttribute("aria-roledescription", "movable photo"); } else { b.removeAttribute("aria-roledescription"); } });
      });
      if (undoBtn) undoBtn.addEventListener("click", function () { var s = undo.pop(); if (s) restore(s); undoBtn.disabled = undo.length === 0; say("Undone."); });
      $$("[data-arrange-rerun]").forEach(function (b) { b.addEventListener("click", function () { restore(initial); undo = []; changed(false); say("Photos arranged automatically."); }); });
      var w = $("[data-width]", root);
      if (w) w.addEventListener("change", function () {
        var b = $(".block.is-selected", root); if (!b || b.getAttribute("data-fixed") === "1") return;
        var first = $(".tile", b), s = (parseFloat(w.value) || num(first, "--w")) / num(first, "--w"), r = box(b);
        commit(b, { x: r.x, y: r.y, w: Math.round(r.w * s * 10) / 10, h: Math.round(r.h * s * 10) / 10 }, s);
      });
    });

    /* Phone arrange toolbar: Arrange toggle and the selected-photo sheet */
    $$("[data-m-arrange]").forEach(function (root) {
      var toggle = $("[data-arrange-toggle]", root);
      var opts = $$("[data-needs-selection]", root);
      if (toggle) toggle.addEventListener("click", function () {
        var on = toggle.getAttribute("aria-pressed") !== "true";
        toggle.setAttribute("aria-pressed", on ? "true" : "false");
        root.classList.toggle("is-arranging", on);
        if (!on) { $$(".block.is-selected", root).forEach(function (b) { b.classList.remove("is-selected"); }); opts.forEach(function (o) { o.hidden = true; }); }
      });
      $$(".block", root).forEach(function (b) {
        b.addEventListener("click", function () {
          if (!root.classList.contains("is-arranging")) return;
          $$(".block", root).forEach(function (o) { o.classList.toggle("is-selected", o === b); });
          opts.forEach(function (o) { o.hidden = false; });
        });
      });
    });

    /* ---------- Dropzone hover feedback -------------------------------- */
    $$(".dropzone").forEach(function (z) {
      ["dragenter", "dragover"].forEach(function (ev) { z.addEventListener(ev, function (e) { e.preventDefault(); z.classList.add("is-over"); }); });
      ["dragleave", "drop"].forEach(function (ev) { z.addEventListener(ev, function (e) { e.preventDefault(); z.classList.remove("is-over"); }); });
    });
  });
})();
