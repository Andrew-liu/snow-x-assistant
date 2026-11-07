// 高级搜索筛选器(独立开关):在 X 搜索框旁挂载「高级搜索」按钮与可视化过滤面板。
// 编辑筛选条件时只更新面板内预览,不干扰 X 原生搜索联想;仅在点击「应用」时写入搜索框并提交。
(() => {
  "use strict";
  const P = window.SnowXParse;
  const C = window.SnowXCommon;
  const I = window.SnowXI18n;
  const B = window.SnowXBadge;
  if (!P || !C || !I || !B) return;
  const T = (k, v) => I.t(k, v);
  const E = (tag, cls, text) => B.el(tag, cls, text);

  const HIST_KEY = "sxa_search_hist";
  const FAV_KEY = "sxa_search_favs";
  const HIST_MAX = 50;
  const FAV_MAX = 200;
  const SEARCH_SEL = [
    'input[data-testid="SearchBox_Search_Input"]',
    'input[aria-label*="Search" i]',
    'input[aria-label*="搜索" i]',
    'input[placeholder*="Search" i]',
    'input[placeholder*="搜索" i]',
    'input[role="combobox"][aria-autocomplete]',
  ].join(", ");

  const fieldByKey = Object.create(null);
  for (const f of P.SEARCH_FIELDS) fieldByKey[f.key] = f;

  const nativeInputSetter =
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value") &&
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;

  function setReactValue(el, value) {
    if (!el || el.value === value) return;
    if (nativeInputSetter) nativeInputSetter.call(el, value);
    else el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function submitSearch(input) {
    if (!input) return;
    input.focus();
    const form = input.closest("form");
    if (form) {
      try {
        if (typeof form.requestSubmit === "function") { form.requestSubmit(); return; }
      } catch (_) {}
      try {
        if (!form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))) return;
      } catch (_) {}
    }
    const init = { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true, cancelable: true };
    input.dispatchEvent(new KeyboardEvent("keydown", init));
    input.dispatchEvent(new KeyboardEvent("keypress", init));
    input.dispatchEvent(new KeyboardEvent("keyup", init));
  }

  // ---------- 本地存储(历史 & 收藏) ----------
  function readStore(key) {
    return new Promise((resolve) => {
      if (!C.storage) { resolve([]); return; }
      try {
        C.storage.get(key, (r) => resolve(Array.isArray(r && r[key]) ? r[key] : []));
      } catch (_) { resolve([]); }
    });
  }

  function writeStore(key, list) {
    return new Promise((resolve) => {
      if (!C.storage) { resolve(); return; }
      try {
        C.storage.set({ [key]: list }, () => resolve());
      } catch (_) { resolve(); }
    });
  }

  async function pushHistory(query) {
    const q = String(query || "").trim();
    if (!q) return;
    const list = await readStore(HIST_KEY);
    if (list.length && list[0].query === q) return;
    list.unshift({ query: q, ts: Date.now() });
    if (list.length > HIST_MAX) list.length = HIST_MAX;
    await writeStore(HIST_KEY, list);
  }

  async function addFavorite(name, query) {
    const q = String(query || "").trim();
    if (!q) return;
    const list = await readStore(FAV_KEY);
    const id = "fav_" + Date.now().toString(36) + "_" + list.length.toString(36);
    list.unshift({ id, name: String(name || q).trim().slice(0, 80) || q, query: q, ts: Date.now() });
    if (list.length > FAV_MAX) list.length = FAV_MAX;
    await writeStore(FAV_KEY, list);
  }

  async function removeFavorite(id) {
    const list = await readStore(FAV_KEY);
    await writeStore(FAV_KEY, list.filter((f) => f && f.id !== id));
  }

  // ---------- 搜索框定位 ----------
  function looksLikeSearchInput(input) {
    if (!input) return false;
    const tid = input.getAttribute("data-testid") || "";
    if (tid === "SearchBox_Search_Input") return true;
    const text = [input.getAttribute("aria-label") || "", input.getAttribute("placeholder") || "", tid].join(" ").toLowerCase();
    return text.includes("search") || text.includes("搜索");
  }

  function isUsableSearchInput(input) {
    if (!input || !input.isConnected || !looksLikeSearchInput(input)) return false;
    const r = input.getBoundingClientRect();
    if (r.width < 40 || r.height < 12) return false;
    const cs = getComputedStyle(input);
    return cs.display !== "none" && cs.visibility !== "hidden" && cs.opacity !== "0";
  }

  function findUsableSearchInput() {
    for (const input of document.querySelectorAll(SEARCH_SEL)) {
      if (isUsableSearchInput(input)) return input;
    }
    return null;
  }

  // ---------- 状态 ----------
  let settings = P.mergeSettings();
  let triggerBtn = null;
  let panelEl = null;
  let visible = false;
  let activeView = "filters";     // filters | history | favorites
  let activeCat = "query";        // query | source | filters | type
  let searchInput = null;
  let state = {};
  let lastBuilt = "";
  const boundInputs = new WeakSet();

  // 面板内部节点引用
  let ui = null;

  function syncTheme() {
    const dark = C.themeIsDark(settings);
    if (dark === null) return;
    const theme = dark ? "dark" : "light";
    if (document.documentElement.dataset.sxaTheme !== theme) document.documentElement.dataset.sxaTheme = theme;
  }

  function syncQuery() {
    if (!ui) return;
    const { query, warnings } = P.buildSearchQuery(state);
    lastBuilt = query;
    ui.preview.textContent = query || " ";
    ui.preview.title = query || "";
    if (warnings.length) {
      ui.warn.textContent = warnings.map((w) => T(w)).join(" ");
      ui.warn.hidden = false;
    } else {
      ui.warn.textContent = "";
      ui.warn.hidden = true;
    }
  }

  // ---------- 字段控件渲染 ----------
  function renderControl(key) {
    const f = fieldByKey[key];
    if (!f) return E("span");
    if (f.type === "text") {
      const inp = E("input", "sxa-sf-input");
      inp.type = "text";
      inp.value = state[key] || "";
      if (f.hintKey) inp.placeholder = T(f.hintKey);
      inp.addEventListener("input", () => { state[key] = inp.value; syncQuery(); });
      return inp;
    }
    if (f.type === "number") {
      const inp = E("input", "sxa-sf-input");
      inp.type = "number";
      inp.min = "0";
      inp.value = state[key] !== undefined && state[key] !== "" ? String(state[key]) : "";
      inp.addEventListener("input", () => {
        state[key] = inp.value === "" ? "" : Number(inp.value);
        syncQuery();
      });
      return inp;
    }
    if (f.type === "date") {
      const inp = E("input", "sxa-sf-input");
      inp.type = "date";
      inp.value = state[key] || "";
      inp.addEventListener("input", () => { state[key] = inp.value; syncQuery(); });
      return inp;
    }
    if (f.type === "withinTime") {
      const cur = state[key] || { value: "", unit: "d" };
      const pair = E("div", "sxa-sf-pair");
      const num = E("input", "sxa-sf-input");
      num.type = "number";
      num.min = "0";
      num.value = cur.value !== undefined && cur.value !== "" ? String(cur.value) : "";
      if (f.hintKey) num.placeholder = T(f.hintKey);
      const unit = E("select", "sxa-sf-select");
      for (const u of ["d", "h", "m", "s"]) {
        const opt = E("option", null, `${u} · ${T("sf.u." + u)}`);
        opt.value = u;
        if ((cur.unit || "d") === u) opt.selected = true;
        unit.append(opt);
      }
      const commit = () => {
        state[key] = { value: num.value === "" ? "" : Number(num.value), unit: unit.value };
        syncQuery();
      };
      num.addEventListener("input", commit);
      unit.addEventListener("change", commit);
      pair.append(num, unit);
      return pair;
    }
    if (f.type === "within") {
      const cur = state[key] || { value: "", unit: "km" };
      const pair = E("div", "sxa-sf-pair");
      const num = E("input", "sxa-sf-input");
      num.type = "number";
      num.min = "0";
      num.value = cur.value !== undefined && cur.value !== "" ? String(cur.value) : "";
      if (f.hintKey) num.placeholder = T(f.hintKey);
      const unit = E("select", "sxa-sf-select");
      for (const u of ["km", "mi"]) {
        const opt = E("option", null, u);
        opt.value = u;
        if ((cur.unit || "km") === u) opt.selected = true;
        unit.append(opt);
      }
      const commit = () => {
        state[key] = { value: num.value === "" ? "" : Number(num.value), unit: unit.value };
        syncQuery();
      };
      num.addEventListener("input", commit);
      unit.addEventListener("change", commit);
      pair.append(num, unit);
      return pair;
    }
    if (f.type === "radioMedia") {
      const wrap = E("div", "sxa-sf-chips");
      const opts = [
        { v: "media", labelKey: "sf.f.filterMedia" },
        { v: "images", labelKey: "sf.f.filterImages" },
        { v: "videos", labelKey: "sf.f.filterVideos" },
      ];
      for (const o of opts) {
        const btn = E("button", "sxa-sf-chip", T(o.labelKey));
        btn.type = "button";
        btn.setAttribute("aria-pressed", (state[key] || "") === o.v ? "true" : "false");
        btn.addEventListener("click", () => {
          const was = (state[key] || "") === o.v;
          state[key] = was ? "" : o.v;
          for (const b of wrap.querySelectorAll("button")) {
            b.setAttribute("aria-pressed", b === btn && !was ? "true" : "false");
          }
          syncQuery();
        });
        wrap.append(btn);
      }
      return wrap;
    }
    return E("span");
  }

  function fieldBlock(key) {
    const f = fieldByKey[key];
    if (!f) return E("span");
    const box = E("div", "sxa-sf-field");
    box.append(E("label", "sxa-sf-label", T(f.labelKey)), renderControl(key));
    return box;
  }

  function fieldCols(cls, ...keys) {
    const row = E("div", "sxa-sf-cols " + cls);
    for (const k of keys) row.append(fieldBlock(k));
    return row;
  }

  function chipGroup(keys) {
    const wrap = E("div", "sxa-sf-chips");
    for (const k of keys) {
      const f = fieldByKey[k];
      if (!f) continue;
      const btn = E("button", "sxa-sf-chip", T(f.labelKey));
      btn.type = "button";
      btn.setAttribute("aria-pressed", state[k] === "on" ? "true" : "false");
      btn.addEventListener("click", () => {
        const on = state[k] === "on";
        state[k] = on ? "off" : "on";
        btn.setAttribute("aria-pressed", on ? "false" : "true");
        syncQuery();
      });
      wrap.append(btn);
    }
    return wrap;
  }

  function renderCategoryBody(cat) {
    const box = E("div");
    if (cat === "source") {
      box.append(
        fieldCols("cols-2", "from", "to"),
        fieldCols("cols-loc", "near", "within"),
        chipGroup(["filterVerified", "filterFollows"]),
      );
      return box;
    }
    if (cat === "filters") {
      box.append(
        fieldBlock("withinTime"),
        fieldCols("cols-2", "since", "until"),
        fieldCols("cols-3", "minFaves", "minRetweets", "minReplies"),
      );
      return box;
    }
    if (cat === "type") {
      box.append(fieldBlock("radioMedia"), chipGroup(["filterLinks", "filterQuote", "filterReplies"]));
      return box;
    }
    box.append(
      fieldBlock("exactPhrase"),
      fieldBlock("orTerms"),
      fieldBlock("exclude"),
      fieldCols("cols-2", "hashtag", "url"),
    );
    return box;
  }

  function fmtTime(ts) {
    const d = new Date(ts);
    if (isNaN(d)) return "";
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  function applyRawQuery(q) {
    state = { keywords: q };
    activeView = "filters";
    redrawPanel();
    if (searchInput && searchInput.isConnected) searchInput.focus();
  }

  async function renderHistoryView() {
    const wrap = E("div");
    const list = await readStore(HIST_KEY);
    if (!list.length) {
      wrap.append(E("div", "sxa-sf-empty", T("sf.empty")));
      return wrap;
    }
    const bar = E("div", "sxa-sf-list-bar");
    const clearBtn = E("button", "sxa-sf-btn", T("sf.clear"));
    clearBtn.type = "button";
    clearBtn.addEventListener("click", async () => {
      await writeStore(HIST_KEY, []);
      redrawPanel();
    });
    bar.append(clearBtn);
    wrap.append(bar);
    const ul = E("ul", "sxa-sf-list");
    for (const item of list) {
      const li = E("li", "sxa-sf-item");
      const meta = E("div", "sxa-sf-meta");
      const useBtn = E("button", "sxa-sf-btn", T("sf.use"));
      useBtn.type = "button";
      useBtn.addEventListener("click", () => applyRawQuery(item.query));
      meta.append(E("span", "sxa-sf-time", fmtTime(item.ts)), useBtn);
      li.append(E("div", "sxa-sf-q", item.query), meta);
      ul.append(li);
    }
    wrap.append(ul);
    return wrap;
  }

  async function renderFavoritesView() {
    const wrap = E("div");
    const list = await readStore(FAV_KEY);
    if (!list.length) {
      wrap.append(E("div", "sxa-sf-empty", T("sf.empty")));
      return wrap;
    }
    const ul = E("ul", "sxa-sf-list");
    for (const item of list) {
      const li = E("li", "sxa-sf-item");
      const acts = E("div", "sxa-sf-acts");
      const useBtn = E("button", "sxa-sf-btn", T("sf.use"));
      useBtn.type = "button";
      useBtn.addEventListener("click", () => applyRawQuery(item.query));
      const delBtn = E("button", "sxa-sf-btn", T("sf.remove"));
      delBtn.type = "button";
      delBtn.addEventListener("click", async () => {
        await removeFavorite(item.id);
        redrawPanel();
      });
      acts.append(useBtn, delBtn);
      li.append(E("div", "sxa-sf-name", item.name), E("div", "sxa-sf-q", item.query), acts);
      ul.append(li);
    }
    wrap.append(ul);
    return wrap;
  }

  // ---------- 面板构建与重绘 ----------
  function ensurePanel() {
    if (panelEl && panelEl.isConnected) return panelEl;
    panelEl = E("div", "sxa-sf-panel");
    panelEl.id = "sxa-sf-panel";
    panelEl.hidden = true;
    C.stopEvents(panelEl, ["mousedown", "mouseup", "pointerdown", "pointerup", "click"]);

    const head = E("div", "sxa-sf-head");
    const title = E("b", "sxa-sf-title");
    const spacer = E("span", "sxa-sf-spacer");
    const histBtn = E("button", "sxa-sf-ibtn", "⏱");
    histBtn.type = "button";
    const favBtn = E("button", "sxa-sf-ibtn", "★");
    favBtn.type = "button";
    const closeBtn = E("button", "sxa-sf-ibtn", "✕");
    closeBtn.type = "button";
    histBtn.addEventListener("click", () => { activeView = activeView === "history" ? "filters" : "history"; redrawPanel(); });
    favBtn.addEventListener("click", () => { activeView = activeView === "favorites" ? "filters" : "favorites"; redrawPanel(); });
    closeBtn.addEventListener("click", hidePanel);
    head.append(title, spacer, histBtn, favBtn, closeBtn);

    const kwWrap = E("div", "sxa-sf-kw");
    const kwInput = E("input", "sxa-sf-kw-in");
    kwInput.type = "text";
    kwInput.addEventListener("input", () => { state.keywords = kwInput.value; syncQuery(); });
    kwInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        doApply();
      }
    });
    kwWrap.append(E("span", "sxa-sf-kw-ico", "🔍"), kwInput);

    const tabs = E("div", "sxa-sf-tabs");
    const body = E("div", "sxa-sf-body");
    const warn = E("div", "sxa-sf-warn");
    warn.hidden = true;

    const foot = E("div", "sxa-sf-foot");
    const preview = E("div", "sxa-sf-prev");
    const copyBtn = E("button", "sxa-sf-btn");
    copyBtn.type = "button";
    const resetBtn = E("button", "sxa-sf-btn");
    resetBtn.type = "button";
    const saveBtn = E("button", "sxa-sf-btn");
    saveBtn.type = "button";
    const applyBtn = E("button", "sxa-sf-btn primary");
    applyBtn.type = "button";

    copyBtn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(lastBuilt || "");
        copyBtn.textContent = T("sf.copied");
        setTimeout(() => { if (ui) ui.copyBtn.textContent = T("sf.copy"); }, 1200);
      } catch (_) {}
    });
    resetBtn.addEventListener("click", () => {
      state = {};
      kwInput.value = "";
      if (searchInput && searchInput.isConnected) setReactValue(searchInput, "");
      redrawPanel();
    });
    saveBtn.addEventListener("click", async () => {
      if (!lastBuilt) return;
      const name = window.prompt(T("sf.savePrompt"), lastBuilt.slice(0, 40));
      if (name === null) return;
      await addFavorite(name, lastBuilt);
    });
    applyBtn.addEventListener("click", doApply);

    foot.append(preview, copyBtn, resetBtn, saveBtn, applyBtn);
    panelEl.append(head, kwWrap, tabs, body, warn, foot);
    document.documentElement.append(panelEl);

    ui = { title, histBtn, favBtn, closeBtn, kwWrap, kwInput, tabs, body, warn, preview, copyBtn, resetBtn, saveBtn, applyBtn };
    return panelEl;
  }

  async function doApply() {
    const finalQuery = lastBuilt;
    const input = (searchInput && searchInput.isConnected ? searchInput : null) || findUsableSearchInput();
    if (input) {
      input.focus();
      setReactValue(input, "");
      await new Promise((r) => setTimeout(r, 0));
      setReactValue(input, finalQuery);
      await new Promise((r) => setTimeout(r, 0));
    }
    if (finalQuery) await pushHistory(finalQuery);
    hidePanel();
    if (finalQuery && input) submitSearch(input);
  }

  function renderLangSelect() {
    const wrap = E("div", "sxa-sf-lang");
    wrap.append(E("span", null, T("sf.f.lang")));
    const sel = E("select", "sxa-sf-lang-sel");
    for (const code of P.SEARCH_LANGS) {
      const opt = E("option", null, T("sf.lang." + code));
      opt.value = code;
      if ((state.lang || "") === code) opt.selected = true;
      sel.append(opt);
    }
    sel.addEventListener("change", () => { state.lang = sel.value; syncQuery(); });
    wrap.append(sel);
    return wrap;
  }

  function redrawPanel() {
    if (!ui) return;
    syncTheme();
    ui.title.textContent = T("sf.title");
    ui.histBtn.title = T("sf.view.history");
    ui.favBtn.title = T("sf.view.favorites");
    ui.closeBtn.title = T("sf.close");
    ui.histBtn.setAttribute("aria-pressed", activeView === "history" ? "true" : "false");
    ui.favBtn.setAttribute("aria-pressed", activeView === "favorites" ? "true" : "false");
    ui.copyBtn.textContent = T("sf.copy");
    ui.resetBtn.textContent = T("sf.reset");
    ui.saveBtn.textContent = T("sf.save");
    ui.applyBtn.textContent = T("sf.apply");
    ui.kwInput.placeholder = T("sf.kwPh");
    if (ui.kwInput.value !== (state.keywords || "")) ui.kwInput.value = state.keywords || "";

    ui.tabs.replaceChildren();
    ui.body.replaceChildren();

    if (activeView === "filters") {
      ui.kwWrap.hidden = false;
      ui.tabs.hidden = false;
      for (const cat of P.SEARCH_CATEGORIES) {
        const b = E("button", "sxa-sf-tab", T("sf.cat." + cat));
        b.type = "button";
        b.setAttribute("aria-selected", cat === activeCat ? "true" : "false");
        b.addEventListener("click", () => { activeCat = cat; redrawPanel(); });
        ui.tabs.append(b);
      }
      ui.tabs.append(E("span", "sxa-sf-spacer"), renderLangSelect());
      ui.body.append(renderCategoryBody(activeCat));
    } else {
      ui.kwWrap.hidden = true;
      ui.tabs.hidden = true;
      const view = activeView;
      const loading = E("div", "sxa-sf-empty", "…");
      ui.body.append(loading);
      (view === "history" ? renderHistoryView() : renderFavoritesView()).then((node) => {
        if (visible && activeView === view && loading.parentNode === ui.body) {
          ui.body.replaceChildren(node);
        }
      });
    }
    syncQuery();
  }

  function repositionPanel() {
    if (!visible || !panelEl) return;
    const w = 430;
    const h = 408;
    const input = (searchInput && isUsableSearchInput(searchInput) ? searchInput : null) || findUsableSearchInput();
    if (!input) {
      panelEl.style.left = Math.max(8, Math.round((window.innerWidth - w) / 2)) + "px";
      panelEl.style.top = Math.max(8, Math.round((window.innerHeight - h) / 2)) + "px";
      return;
    }
    const r = input.getBoundingClientRect();
    const left = Math.max(8, Math.min(window.innerWidth - w - 8, Math.round(r.left)));
    let top = Math.round(r.bottom + 6);
    if (top + h > window.innerHeight - 8) {
      const alt = Math.round(r.top - h - 6);
      top = alt > 8 ? alt : Math.max(8, window.innerHeight - h - 8);
    }
    panelEl.style.left = left + "px";
    panelEl.style.top = top + "px";
  }

  function openPanel(input) {
    if (!settings.showSearchFilter) return;
    searchInput = input || findUsableSearchInput();
    ensurePanel();
    visible = true;
    panelEl.hidden = false;
    redrawPanel();
    repositionPanel();
    setTimeout(() => { try { if (ui && ui.kwInput) ui.kwInput.focus(); } catch (_) {} }, 0);
  }

  function hidePanel() {
    visible = false;
    if (panelEl) panelEl.hidden = true;
  }

  // ---------- 搜索框旁触发按钮 ----------
  function ensureTrigger() {
    if (!settings.showSearchFilter) {
      if (triggerBtn) triggerBtn.hidden = true;
      hidePanel();
      return;
    }
    if (!triggerBtn || !triggerBtn.isConnected) {
      triggerBtn = E("button", "sxa-sf-trigger", T("sf.trigger"));
      triggerBtn.type = "button";
      triggerBtn.id = "sxa-sf-btn";
      triggerBtn.hidden = true;
      C.stopEvents(triggerBtn, ["pointerdown", "mousedown"]);
      triggerBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (visible) hidePanel();
        else openPanel(findUsableSearchInput());
      });
      document.documentElement.append(triggerBtn);
    }
    positionTrigger();
  }

  function positionTrigger() {
    if (!triggerBtn || !triggerBtn.isConnected) return;
    if (!settings.showSearchFilter) {
      triggerBtn.hidden = true;
      return;
    }
    const input = findUsableSearchInput();
    if (!input) {
      triggerBtn.hidden = true;
      return;
    }
    syncTheme();
    triggerBtn.textContent = T("sf.trigger");
    triggerBtn.title = T("sf.triggerTip");
    triggerBtn.hidden = false;
    const r = input.getBoundingClientRect();
    const w = triggerBtn.offsetWidth || 68;
    const h = 24;
    const left = Math.max(r.left + 8, Math.round(r.right - w - 34));
    const top = Math.round(r.top + (r.height - h) / 2);
    triggerBtn.style.left = left + "px";
    triggerBtn.style.top = top + "px";
  }

  function onInputKeyDown(e) {
    if (!settings.showSearchFilter) return;
    const input = e.currentTarget;
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === "F" || e.key === "f")) {
      e.preventDefault();
      e.stopPropagation();
      openPanel(input);
      return;
    }
    if (e.key === "Enter" && !visible) {
      const q = (input.value || "").trim();
      if (q) pushHistory(q);
    }
  }

  function scan() {
    if (!settings.showSearchFilter) {
      if (triggerBtn) triggerBtn.hidden = true;
      hidePanel();
      return;
    }
    for (const input of document.querySelectorAll(SEARCH_SEL)) {
      if (!looksLikeSearchInput(input)) continue;
      if (!boundInputs.has(input)) {
        boundInputs.add(input);
        input.addEventListener("keydown", onInputKeyDown);
      }
    }
    ensureTrigger();
  }

  // ---------- 全局事件与初始化 ----------
  document.addEventListener("pointerdown", (e) => {
    if (!visible || !panelEl) return;
    const t = e.target;
    if (panelEl.contains(t) || (triggerBtn && triggerBtn.contains(t)) || t === searchInput) return;
    hidePanel();
  }, true);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && visible) hidePanel();
  });

  window.addEventListener("scroll", () => {
    if (!settings.showSearchFilter) return;
    positionTrigger();
    if (visible) repositionPanel();
  }, { capture: true, passive: true });

  window.addEventListener("resize", () => {
    if (!settings.showSearchFilter) return;
    positionTrigger();
    if (visible) repositionPanel();
  }, { passive: true });

  let scanQueued = false;
  function queueScan() {
    if (scanQueued) return;
    scanQueued = true;
    requestAnimationFrame(() => {
      scanQueued = false;
      scan();
    });
  }

  new MutationObserver((muts) => {
    if (!settings.showSearchFilter) return;
    for (const m of muts) {
      const t = m.target;
      if (t && t.nodeType === 1 && (t.id === "sxa-sf-btn" || t.id === "sxa-sf-panel" || (panelEl && panelEl.contains(t)))) continue;
      if ((m.addedNodes && m.addedNodes.length) || (m.removedNodes && m.removedNodes.length)) {
        queueScan();
        return;
      }
    }
  }).observe(document.documentElement, { childList: true, subtree: true });

  C.loadSettings((s) => {
    settings = s;
    C.applyLang(s);
    scan();
  });
  C.onSettingsChange((s) => {
    settings = s;
    C.applyLang(s);
    scan();
    if (visible) redrawPanel();
  });
})();
