// 互关清理(独立开关):只在你自己的 /<你>/following 页面生效。
// 工具栏吸顶插在“正在关注”tab 下方,勾选框作为 UserCell 的兄弟节点放在左侧 52px 列,取关前弹确认框。
// 通过点击 X 页面自带的“正在关注 → 取消关注”按钮完成,不直接调用 X 接口。
(() => {
  "use strict";
  const P = window.SnowXParse;
  const SETTINGS_KEY = "sxa_settings";
  const MAX_PER_RUN = 100;
  const COL = '[data-testid="primaryColumn"]';
  const CELL_SEL = '[data-testid="UserCell"]';
  const FOLLOWS_YOU = '[data-testid="userFollowIndicator"]';
  const FOLLOWS_YOU_TEXT = /^(Follows you|关注了你|フォローされています)$/u;
  const UNFOLLOW_BTN = '[data-testid$="-unfollow"]';
  const CONFIRM_BTN = '[data-testid="confirmationSheetConfirm"]';
  const PROFILE_LINKS = [
    'a[data-testid="AppTabBar_Profile_Link"]',
    'a[data-testid="SideNav_AccountSwitcher_Button"]',
    'a[data-testid="DashButton_ProfileIcon_Link"]',
  ];
  const HOST_ATTR = "data-sxa-mc-host";
  const HIT_ATTR = "data-sxa-mc-hit";
  const ROW_ATTR = "data-sxa-mc-row";
  const PAGE_STYLE_ID = "sxa-mc-page-style";
  const HIT_W = 52;

  let settings = P.mergeSettings();
  let mounted = false;
  let mode = "oneway";            // oneway | all,默认只看未回关
  const selected = new Set();
  const done = new Set();         // 本次会话已取关
  let running = false;
  let stopFlag = false;
  let phase = "normal";           // normal | progress | complete
  let progress = null;            // { done, total, log: [{h, ok}] }
  let result = null;              // { ok, fail, missing, stopped }
  let ui = null;
  let timer = null;

  const storage = (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) || null;
  if (storage) {
    storage.get(SETTINGS_KEY, (r) => { settings = P.mergeSettings(r && r[SETTINGS_KEY]); schedule(); });
    chrome.storage.onChanged.addListener((c, area) => {
      if (area === "local" && c[SETTINGS_KEY]) { settings = P.mergeSettings(c[SETTINGS_KEY].newValue); schedule(); }
    });
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // ---------- 页面判断 ----------
  function loggedInHandle() {
    for (const sel of PROFILE_LINKS) {
      for (const a of document.querySelectorAll(sel)) {
        const h = P.profilePathToHandle(a.pathname);
        if (h) return h;
      }
    }
    return null;
  }

  function onOwnFollowingPage() {
    const page = P.followingPageHandle(location.pathname);
    if (!page) return false;
    const me = loggedInHandle();
    return !!me && me === page; // 识别不到自己时宁可不启用
  }

  function isDark() {
    const m = document.body && getComputedStyle(document.body).backgroundColor.match(/\d+/g);
    return !!m && (+m[0] * 299 + +m[1] * 587 + +m[2] * 114) / 1000 < 128;
  }

  // ---------- 用户行 ----------
  function cellHandle(cell) {
    const freq = new Map();
    for (const a of cell.querySelectorAll('a[href^="/"]')) {
      const path = (a.getAttribute("href") || "").split(/[?#]/)[0];
      if (!/^\/@?[A-Za-z0-9_]{1,15}\/?$/.test(path)) continue;
      const h = P.profilePathToHandle(path);
      if (h) freq.set(h, (freq.get(h) || 0) + 1);
    }
    let best = null, n = 0;
    for (const [h, c] of freq) if (c > n) { best = h; n = c; }
    return best;
  }

  function followsYou(cell, handle) {
    if (cell.querySelector(FOLLOWS_YOU)) return true;
    for (const s of cell.querySelectorAll("span")) if (FOLLOWS_YOU_TEXT.test((s.textContent || "").trim())) return true;
    const u = window.__sxaUsers && window.__sxaUsers.get(handle);
    return !!(u && u.followedBy);
  }

  const cells = () => Array.from(document.querySelectorAll(`${COL} ${CELL_SEL}`));

  function findCell(handle) {
    for (const c of cells()) if (cellHandle(c) === handle) return c;
    return null;
  }

  function stopAll(el) {
    for (const ev of ["click", "mousedown", "mouseup", "pointerdown", "pointerup", "touchstart", "touchend", "keydown", "keyup"]) {
      el.addEventListener(ev, (e) => { e.stopPropagation(); });
    }
  }

  // 页面级样式:给 UserCell 父容器预留勾选列、勾选框配色、筛选隐藏
  function injectPageStyle() {
    if (document.getElementById(PAGE_STYLE_ID)) return;
    const st = document.createElement("style");
    st.id = PAGE_STYLE_ID;
    st.textContent = `
${COL} :has(> ${CELL_SEL}){padding-left:${HIT_W}px!important;position:relative}
:root{--sxa-cb-border:rgba(0,0,0,.22);--sxa-cb-on:rgba(0,0,0,.88);--sxa-cb-glow:rgba(0,0,0,.08)}
html[data-sxa-theme="dark"]{--sxa-cb-border:rgba(255,255,255,.22);--sxa-cb-on:#818cf8;--sxa-cb-glow:rgba(99,102,241,.35)}
[${HIT_ATTR}]{position:absolute;left:0;top:12px;width:${HIT_W}px;height:40px;display:flex;align-items:center;justify-content:center;cursor:pointer;z-index:2;-webkit-tap-highlight-color:transparent}
[${HIT_ATTR}] input{position:absolute;opacity:0;width:1px;height:1px;margin:0;pointer-events:none}
[${HIT_ATTR}] i{width:20px;height:20px;box-sizing:border-box;border-radius:5px;border:1.5px solid var(--sxa-cb-border);display:flex;align-items:center;justify-content:center;font:700 12px/1 sans-serif;font-style:normal;color:transparent;transition:all .15s cubic-bezier(.34,1.56,.64,1);pointer-events:none}
[${HIT_ATTR}]:hover i{border-color:var(--sxa-cb-on)}
[${HIT_ATTR}][aria-checked="true"] i{background:var(--sxa-cb-on);border-color:var(--sxa-cb-on);color:#fff;box-shadow:0 0 18px var(--sxa-cb-glow)}
[${HIT_ATTR}][aria-disabled="true"]{cursor:not-allowed;opacity:.35}
[${HIT_ATTR}]:focus-visible{outline:2px solid #1d9bf0;outline-offset:-4px;border-radius:8px}
html[data-sxa-mc-filter="oneway"] [${ROW_ATTR}="mutual"]{display:none!important}
html[data-sxa-mc-filter="oneway"] ${COL} :not(section):not(${COL}):has(> ${CELL_SEL}:only-child ${FOLLOWS_YOU}){display:none!important}
html[data-sxa-mc-filter="oneway"] ${COL} :has(> [${HIT_ATTR}] + ${CELL_SEL} ${FOLLOWS_YOU}){display:none!important}
[${ROW_ATTR}="done"] > ${CELL_SEL}{opacity:.4}
`;
    (document.head || document.documentElement).append(st);
  }

  function ensureCheckbox(cell, handle) {
    const row = cell.parentElement;
    if (!row) return;
    let hit = row.querySelector(`:scope > [${HIT_ATTR}]`);
    if (!hit) {
      hit = document.createElement("label");
      hit.setAttribute(HIT_ATTR, "");
      hit.setAttribute("role", "checkbox");
      hit.tabIndex = 0;
      const input = document.createElement("input");
      input.type = "checkbox";
      input.tabIndex = -1;
      hit.append(input, document.createElement("i"));
      // 抢在 X 的 UserCell 点击(跳转主页)之前处理
      const toggle = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const h = hit.dataset.handle;
        if (!h || running || done.has(h)) return;
        if (selected.has(h)) selected.delete(h); else selected.add(h);
        refresh();
      };
      for (const ev of ["pointerdown", "mousedown", "mouseup", "pointerup"]) hit.addEventListener(ev, (e) => { e.stopPropagation(); }, true);
      hit.addEventListener("click", toggle, true);
      hit.addEventListener("keydown", (e) => { if (e.key === " " || e.key === "Enter") toggle(e); });
      row.insertBefore(hit, cell);
    }
    hit.dataset.handle = handle; // 虚拟列表复用 DOM 时随行更新
    const on = selected.has(handle);
    hit.querySelector("i").textContent = on ? "✓" : "";
    hit.firstElementChild.checked = on;
    hit.setAttribute("aria-checked", String(on));
    hit.setAttribute("aria-label", "选择 @" + handle);
    hit.setAttribute("aria-disabled", String(running || done.has(handle)));
  }

  function decorateCells() {
    let loaded = 0, oneway = 0;
    for (const cell of cells()) {
      const handle = cellHandle(cell);
      const row = cell.parentElement;
      if (!handle || !row) continue;
      loaded++;
      const mutual = followsYou(cell, handle);
      if (!mutual) oneway++;
      row.setAttribute(ROW_ATTR, done.has(handle) ? "done" : mutual ? "mutual" : "oneway");
      ensureCheckbox(cell, handle);
    }
    return { loaded, oneway };
  }

  // ---------- 工具栏挂载位置(tab 横线下方、列表上方,吸顶) ----------
  function findTablist() {
    const col = document.querySelector(COL);
    return col ? col.querySelector('[role="tablist"]') : null;
  }

  function stickyStrip(tablist) {
    const col = document.querySelector(COL);
    let node = tablist, strip = tablist;
    for (let d = 0; d < 12 && node; d++) {
      const pos = getComputedStyle(node).position;
      if (pos === "sticky" || pos === "-webkit-sticky") strip = node;
      if (col && node.parentElement === col) break;
      node = node.parentElement;
    }
    return strip;
  }

  function insertHost(host) {
    const col = document.querySelector(COL);
    const tablist = findTablist();
    if (tablist) {
      let after = stickyStrip(tablist);
      const next = after.nextElementSibling;
      if (next && !next.querySelector(CELL_SEL) && next.tagName !== "SECTION" && next.getBoundingClientRect().height <= 8) after = next;
      after.after(host);
      return;
    }
    const section = col && col.querySelector("section");
    if (section) { section.before(host); return; }
    if (col) col.prepend(host);
    else document.body.append(host);
  }

  function stickyTop() {
    const tablist = findTablist();
    if (!tablist) return 0;
    const strip = stickyStrip(tablist);
    const st = getComputedStyle(strip);
    const top = st.position.includes("sticky") ? parseFloat(st.top) || 0 : 0;
    return top + strip.offsetHeight;
  }

  // ---------- 工具栏 ----------
  const TEMPLATE = `
<style>
:host{all:initial;display:block;font-family:TwitterChirp,-apple-system,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;-webkit-font-smoothing:antialiased;
  --surface:rgba(255,255,255,.82);--border:rgba(0,0,0,.08);--pri:rgba(0,0,0,.88);--sec:rgba(0,0,0,.55);--dim:rgba(0,0,0,.35);
  --accent:#1a1a2e;--danger:#dc2626;--danger-glow:rgba(220,38,38,.22);--success:#059669;
  --btn-bg:rgba(0,0,0,.05);--btn-border:rgba(0,0,0,.08);--btn-hover:rgba(0,0,0,.08);--seg-bg:rgba(0,0,0,.05);--seg-on:rgba(0,0,0,.88);
  --badge-bg:rgba(0,0,0,.06);--glow:rgba(0,0,0,.03);--track:rgba(0,0,0,.08);--complete-bg:rgba(16,185,129,.1);--complete-border:rgba(5,150,105,.45);
  --overlay:rgba(0,0,0,.35);--panel:rgba(255,255,255,.96);--panel-border:rgba(0,0,0,.08);--panel-shadow:0 40px 80px rgba(0,0,0,.15);--icon-bg:rgba(220,38,38,.1);
  --danger-bg:linear-gradient(135deg,#f43f3f,#e01d1d);--danger-border:rgba(220,38,38,.32)}
:host(.dark){--surface:rgba(18,18,32,.72);--border:rgba(255,255,255,.07);--pri:rgba(255,255,255,.9);--sec:rgba(255,255,255,.55);--dim:rgba(255,255,255,.32);
  --accent:#818cf8;--danger:#ef4444;--danger-glow:rgba(239,68,68,.3);--success:#10b981;
  --btn-bg:rgba(255,255,255,.05);--btn-border:rgba(255,255,255,.07);--btn-hover:rgba(255,255,255,.09);--seg-bg:rgba(255,255,255,.05);--seg-on:rgba(129,140,248,.24);
  --badge-bg:rgba(255,255,255,.06);--glow:rgba(99,102,241,.1);--track:rgba(255,255,255,.07);--complete-bg:rgba(10,25,15,.6);--complete-border:rgba(16,185,129,.5);
  --overlay:rgba(0,0,0,.6);--panel:rgba(24,24,44,.94);--panel-border:rgba(255,255,255,.08);--panel-shadow:0 40px 80px rgba(0,0,0,.6);--icon-bg:rgba(239,68,68,.14);
  --danger-bg:linear-gradient(135deg,rgba(239,68,68,.75),rgba(220,38,38,.65));--danger-border:rgba(239,68,68,.25)}
*{box-sizing:border-box}
.bar{position:relative;display:flex;flex-direction:column;gap:12px;padding:14px 16px;background:var(--surface);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border-bottom:1px solid var(--border);color:var(--pri);overflow:hidden}
.bar::before{content:"";position:absolute;top:-30px;right:-20px;width:120px;height:120px;border-radius:50%;background:radial-gradient(circle,var(--glow),transparent 70%);pointer-events:none}
.head{display:flex;align-items:center;justify-content:space-between;gap:12px}
.title{display:flex;align-items:center;gap:6px;font-size:14px;font-weight:700;letter-spacing:-.01em}
.badge{font-size:10px;font-weight:500;color:var(--dim);background:var(--badge-bg);padding:2px 7px;border-radius:100px}
.stats{display:flex;gap:14px;font-size:11px;flex-shrink:0;color:var(--sec);white-space:nowrap}
.stats b{font-weight:600;color:var(--pri)} .stats b.accent{color:var(--accent)} .stats b.danger{color:var(--danger)} .stats b.ok{color:var(--success)}
.actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.seg{display:flex;gap:2px;background:var(--seg-bg);border-radius:10px;padding:2px}
.seg button{border:none;padding:7px 14px;border-radius:8px;font:500 12px/1 inherit;font-family:inherit;color:var(--sec);background:transparent;cursor:pointer;transition:all .2s;white-space:nowrap}
.seg button.on{background:var(--seg-on);color:#fff;font-weight:600}
.spacer{flex:1}
.btn{border:1px solid var(--btn-border);border-radius:8px;background:var(--btn-bg);color:var(--sec);font:500 12px/1 inherit;font-family:inherit;padding:7px 14px;cursor:pointer;transition:all .15s;white-space:nowrap}
.btn:hover:not(:disabled){background:var(--btn-hover);color:var(--pri)}
.btn:disabled,.seg button:disabled{opacity:.4;cursor:not-allowed}
.btn:focus-visible,.seg button:focus-visible{outline:2px solid #1d9bf0;outline-offset:2px}
.btn-danger{border-color:var(--danger-border);background:var(--danger-bg);color:#fff;font-weight:600;box-shadow:0 4px 16px var(--danger-glow)}
.btn-danger:hover:not(:disabled){background:var(--danger-bg);color:#fff;filter:brightness(1.05)}
.tip{display:flex;align-items:center;gap:8px;font-size:11px;min-height:16px}
.status{color:var(--dim)} .warn{color:var(--danger)}
.prog{display:none;flex-direction:column;gap:8px} .prog.show{display:flex}
.prog-head{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:12px;color:var(--sec)}
.prog-head .btn{padding:4px 10px;font-size:11px}
.track{height:4px;background:var(--track);border-radius:2px;overflow:hidden}
.fill{position:relative;height:100%;width:0;background:linear-gradient(90deg,rgba(239,68,68,.5),rgba(239,68,68,.85),rgba(248,113,113,.95));border-radius:2px;transition:width .3s ease-out}
.log{display:flex;flex-wrap:wrap;gap:8px;font:11px/1.4 ui-monospace,"SF Mono",Consolas,monospace;color:var(--dim)}
.log .ok{color:rgba(16,185,129,.85)} .log .fail{color:rgba(239,68,68,.85)}
.done{display:none;align-items:center;gap:12px;padding:10px 14px;background:var(--complete-bg);border-left:3px solid var(--complete-border);border-radius:0 8px 8px 0}
.done.show{display:flex}
.done-text{flex:1;font-size:12px;color:var(--sec)} .done-text b{color:var(--success);font-weight:600}
.overlay{display:none;position:fixed;inset:0;z-index:2147483646;background:var(--overlay);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);align-items:center;justify-content:center}
.overlay.show{display:flex}
.panel{width:360px;max-width:90vw;padding:24px;border-radius:20px;background:var(--panel);border:1px solid var(--panel-border);box-shadow:var(--panel-shadow);display:flex;flex-direction:column;align-items:center;gap:14px;text-align:center;color:var(--pri);animation:pop .2s cubic-bezier(.16,1,.3,1)}
@keyframes pop{from{opacity:0;transform:scale(.9)}to{opacity:1;transform:none}}
.icon{width:48px;height:48px;border-radius:50%;background:var(--icon-bg);display:flex;align-items:center;justify-content:center;font-size:22px}
.p-title{font-size:15px;font-weight:700} .p-desc{font-size:13px;color:var(--sec)} .p-desc b{color:var(--danger)} .p-note{font-size:12px;color:var(--dim)}
.p-actions{display:flex;gap:8px;width:100%;margin-top:4px}
.p-actions .btn{flex:1;padding:10px;border-radius:10px;font-size:13px}
.p-actions .confirm{background:linear-gradient(135deg,#ef4444,#dc2626);border:none;color:#fff;font-weight:600}
@media (prefers-reduced-motion:reduce){.panel{animation:none}.fill{transition:none}}
</style>
<div class="overlay" data-r="overlay" role="dialog" aria-modal="true" aria-labelledby="sxa-p-title">
  <div class="panel">
    <div class="icon">⚠️</div>
    <div class="p-title" id="sxa-p-title">确认取消关注</div>
    <div class="p-desc" data-r="desc"></div>
    <div class="p-note" data-r="note"></div>
    <div class="p-actions">
      <button class="btn" data-a="cancel">取消</button>
      <button class="btn confirm" data-a="confirm">确认取消关注</button>
    </div>
  </div>
</div>
<div class="bar" role="region" aria-label="互关清理">
  <div class="head">
    <div class="title">互关清理<span class="badge">SNOW X</span></div>
    <div class="stats">
      <span>列表 <b data-r="loaded">0</b> 人</span>
      <span>已选 <b class="accent" data-r="sel">0</b> 人</span>
      <span>未回关 <b class="danger" data-r="oneway">0</b> 人</span>
      <span data-r="doneWrap" hidden>已取关 <b class="ok" data-r="doneN">0</b> 人</span>
    </div>
  </div>
  <div class="actions">
    <div class="seg">
      <button data-a="oneway">仅未回关</button>
      <button data-a="all">全部</button>
    </div>
    <div class="spacer"></div>
    <button class="btn" data-a="selAll">全选未回关</button>
    <button class="btn" data-a="clear">清除选择</button>
    <button class="btn btn-danger" data-a="go">取消关注所选</button>
  </div>
  <div class="tip">
    <span class="status" data-r="status" aria-live="polite"></span>
    <div class="spacer"></div>
    <span class="warn">⚠️ 建议分批取关,每小时不超过 50 人,降低账号限制风险</span>
  </div>
  <div class="prog" data-r="prog">
    <div class="prog-head"><span data-r="progText">正在取消关注…</span><span><span data-r="progN">0 / 0</span> <button class="btn" data-a="stop">停止</button></span></div>
    <div class="track"><div class="fill" data-r="fill"></div></div>
    <div class="log" data-r="log"></div>
  </div>
  <div class="done" data-r="done">
    <span>✅</span><span class="done-text" data-r="doneText"></span>
    <button class="btn" data-a="dismiss">知道了</button>
  </div>
</div>`;

  function mount() {
    mounted = true;
    injectPageStyle();
    document.documentElement.setAttribute("data-sxa-mc-filter", mode);
    const host = document.createElement("div");
    host.setAttribute(HOST_ATTR, "");
    host.style.cssText = "position:sticky;z-index:3;display:block";
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = TEMPLATE; // 静态模板,不含任何外部数据
    stopAll(host);
    const r = (k) => shadow.querySelector(`[data-r="${k}"]`);
    const a = (k) => shadow.querySelector(`[data-a="${k}"]`);
    ui = {
      host, shadow,
      loaded: r("loaded"), sel: r("sel"), oneway: r("oneway"), doneWrap: r("doneWrap"), doneN: r("doneN"),
      status: r("status"), prog: r("prog"), progText: r("progText"), progN: r("progN"), fill: r("fill"), log: r("log"),
      done: r("done"), doneText: r("doneText"), overlay: r("overlay"), desc: r("desc"), note: r("note"),
      bOneway: a("oneway"), bAll: a("all"), selAll: a("selAll"), clear: a("clear"), go: a("go"), stop: a("stop"),
    };
    ui.bOneway.addEventListener("click", () => setMode("oneway"));
    ui.bAll.addEventListener("click", () => setMode("all"));
    ui.selAll.addEventListener("click", selectOneway);
    ui.clear.addEventListener("click", () => { selected.clear(); refresh(); });
    ui.go.addEventListener("click", askConfirm);
    ui.stop.addEventListener("click", () => { stopFlag = true; ui.stop.disabled = true; });
    a("dismiss").addEventListener("click", () => { phase = "normal"; result = null; refresh(); });
    a("cancel").addEventListener("click", () => closeDialog(false));
    a("confirm").addEventListener("click", () => closeDialog(true));
    ui.overlay.addEventListener("click", (e) => { if (e.target === ui.overlay) closeDialog(false); });
    shadow.addEventListener("keydown", (e) => { if (e.key === "Escape" && ui.overlay.classList.contains("show")) closeDialog(false); });
    insertHost(host);
    setStatus("向下滚动加载更多关注,只处理已加载的账号");
  }

  function placeHost() {
    if (!ui) return;
    if (!ui.host.isConnected) insertHost(ui.host);
    const top = stickyTop() + "px";
    if (ui.host.style.top !== top) ui.host.style.top = top;
    const bg = document.body ? getComputedStyle(document.body).backgroundColor : "";
    if (ui.host.style.background !== bg) ui.host.style.background = bg;
    ui.host.classList.toggle("dark", isDark());
  }

  function unmount() {
    mounted = false;
    stopFlag = true;
    if (ui) ui.host.remove();
    ui = null;
    document.querySelectorAll(`[${HIT_ATTR}]`).forEach((n) => n.remove());
    document.querySelectorAll(`[${ROW_ATTR}]`).forEach((n) => n.removeAttribute(ROW_ATTR));
    document.getElementById(PAGE_STYLE_ID)?.remove();
    document.documentElement.removeAttribute("data-sxa-mc-filter");
    selected.clear();
    phase = "normal";
  }

  function setMode(m) {
    mode = m;
    document.documentElement.setAttribute("data-sxa-mc-filter", m);
    refresh();
  }

  function selectOneway() {
    for (const c of cells()) {
      const h = cellHandle(c);
      if (h && c.parentElement && c.parentElement.getAttribute(ROW_ATTR) === "oneway") selected.add(h);
    }
    refresh();
  }

  function setStatus(text) { if (ui) ui.status.textContent = text; }

  const pending = () => [...selected].filter((h) => !done.has(h));

  // ---------- 确认弹窗 ----------
  let dialogResolve = null;
  function askConfirm() {
    const list = pending();
    if (!list.length || running) return;
    const n = Math.min(list.length, MAX_PER_RUN);
    ui.desc.replaceChildren("将取消关注 ", Object.assign(document.createElement("b"), { textContent: String(n) }), " 个账号");
    const sec = (settings.mutualDelayMs / 1000).toFixed(1);
    ui.note.textContent = list.length > MAX_PER_RUN
      ? `单次最多 ${MAX_PER_RUN} 个,剩余的请下一轮处理 · 每个间隔约 ${sec} 秒 · 此操作不可撤销`
      : `每个间隔约 ${sec} 秒,可随时停止 · 此操作不可撤销`;
    ui.overlay.classList.add("show");
    ui.shadow.querySelector('[data-a="cancel"]').focus();
    dialogResolve = (ok) => { if (ok) runBatch(); };
  }
  function closeDialog(ok) {
    if (!ui) return;
    ui.overlay.classList.remove("show");
    const fn = dialogResolve;
    dialogResolve = null;
    if (fn) fn(ok);
  }

  let lastCounts = { loaded: 0, oneway: 0 };
  function updateBar() {
    if (!ui) return;
    const sel = pending().length;
    ui.loaded.textContent = String(lastCounts.loaded);
    ui.sel.textContent = String(sel);
    ui.oneway.textContent = String(lastCounts.oneway);
    ui.doneN.textContent = String(done.size);
    ui.doneWrap.hidden = done.size === 0;
    ui.bOneway.classList.toggle("on", mode === "oneway");
    ui.bAll.classList.toggle("on", mode === "all");
    ui.bOneway.setAttribute("aria-pressed", String(mode === "oneway"));
    ui.bAll.setAttribute("aria-pressed", String(mode === "all"));
    for (const b of [ui.bOneway, ui.bAll, ui.selAll]) b.disabled = running;
    ui.clear.disabled = running || sel === 0;
    ui.go.disabled = running || sel === 0;
    ui.go.textContent = sel ? `取消关注所选 (${Math.min(sel, MAX_PER_RUN)})` : "取消关注所选";

    ui.prog.classList.toggle("show", phase === "progress");
    if (phase === "progress" && progress) {
      ui.progN.textContent = `${progress.done} / ${progress.total}`;
      ui.fill.style.width = `${progress.total ? (progress.done / progress.total) * 100 : 0}%`;
      ui.log.replaceChildren();
      progress.log.slice(-6).forEach((e, i) => {
        if (i) ui.log.append(" · ");
        ui.log.append(Object.assign(document.createElement("span"), { className: e.ok ? "ok" : "fail", textContent: `${e.ok ? "✓" : "✗"} @${e.h}` }));
      });
    }
    ui.done.classList.toggle("show", phase === "complete" && !!result);
    if (phase === "complete" && result) {
      const b = (n) => Object.assign(document.createElement("b"), { textContent: String(n) });
      const parts = ["完成!成功取消关注 ", b(result.ok), " 人"];
      if (result.fail) parts.push(",失败 ", b(result.fail), " 人");
      if (result.missing) parts.push(`,${result.missing} 人已滚出列表,滚回去可重试`);
      if (result.stopped) parts.push(",已手动停止");
      ui.doneText.replaceChildren(...parts);
    }
  }

  function refresh() {
    if (!mounted) return;
    placeHost();
    lastCounts = decorateCells();
    updateBar();
  }

  // ---------- 批量取关 ----------
  async function waitFor(fn, timeout) {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      const v = fn();
      if (v) return v;
      await sleep(120);
    }
    return null;
  }

  async function unfollowCell(cell) {
    const b = cell.querySelector(UNFOLLOW_BTN);
    if (!b) return "not-following";
    b.click();
    const confirmBtn = await waitFor(() => document.querySelector(CONFIRM_BTN), 4000);
    if (!confirmBtn) return "no-confirm";
    confirmBtn.click();
    // 按钮从 -unfollow 变回 -follow 才算成功
    const ok = await waitFor(() => !cell.isConnected || !cell.querySelector(UNFOLLOW_BTN), 4000);
    return ok ? "ok" : "unconfirmed";
  }

  async function runBatch() {
    if (running) return;
    const list = pending().slice(0, MAX_PER_RUN);
    if (!list.length) return;
    running = true;
    stopFlag = false;
    ui.stop.disabled = false;
    phase = "progress";
    progress = { done: 0, total: list.length, log: [] };
    result = null;
    refresh();
    let ok = 0, fail = 0, missing = 0;
    for (let i = 0; i < list.length; i++) {
      if (stopFlag || !mounted) break;
      const h = list[i];
      ui.progText.textContent = `正在取消关注 @${h}`;
      const cell = findCell(h);
      if (!cell) { missing++; progress.done = i + 1; refresh(); continue; }
      cell.scrollIntoView({ block: "center" });
      await sleep(300);
      const r = await unfollowCell(cell);
      const good = r === "ok" || r === "not-following";
      if (good) { ok++; done.add(h); selected.delete(h); } else fail++;
      progress.done = i + 1;
      progress.log.push({ h, ok: good });
      refresh();
      if (i < list.length - 1) await sleep(settings.mutualDelayMs + Math.floor(Math.random() * 600));
    }
    running = false;
    if (!mounted) return;
    result = { ok, fail, missing, stopped: stopFlag };
    phase = "complete";
    progress = null;
    const left = pending().length;
    setStatus(left ? `还有 ${left} 人待处理` : "向下滚动加载更多关注,只处理已加载的账号");
    refresh();
  }

  // ---------- 调度 ----------
  function tick() {
    const should = settings.mutualEnabled && onOwnFollowingPage();
    if (!should) { if (mounted) unmount(); return; }
    if (!mounted) mount();
    refresh();
  }

  function schedule() {
    if (timer) return;
    timer = setTimeout(() => { timer = null; tick(); }, 250);
  }

  new MutationObserver((muts) => {
    for (const m of muts) {
      const t = m.target;
      if (t.nodeType === 1 && (t.hasAttribute(HOST_ATTR) || t.closest(`[${HIT_ATTR}], .sxa-badge, #sxa-tip, #sxa-hud`))) continue;
      schedule();
      return;
    }
  }).observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener("popstate", schedule);
})();
