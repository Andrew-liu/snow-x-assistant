(() => {
  "use strict";
  const P = window.SnowXParse;
  const B = window.SnowXBadge;
  const C = window.SnowXCommon;
  const I = window.SnowXI18n;
  const T = (k, v) => I.t(k, v);
  const TAB_KEY = "sxa_popup_tab";
  const TABS = ["tags", "skin", "mutual", "general"];
  const HOUR = 3600e3;
  let settings = null;

  // 深浅色:设置里选了浅色 / 深色就用它,自动时跟随系统;主题页可临时切换预览背景(不保存)
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  let bgOverride = null;
  const applyTheme = () => {
    const pref = settings && settings.theme !== "auto" ? settings.theme : null;
    const mode = bgOverride || pref || (media.matches ? "dark" : "light");
    document.documentElement.dataset.sxaTheme = mode;
    document.querySelectorAll('#bgSeg input').forEach((r) => { r.checked = r.value === mode; });
  };
  applyTheme();
  media.addEventListener("change", applyTheme);

  // 语言:自动时跟随浏览器语言(弹窗里没有 X 页面可参考)
  let appliedLang = null;
  function applyI18n() {
    const l = C.applyLang(settings, navigator.language);
    if (l === appliedLang) return;
    appliedLang = l;
    document.documentElement.lang = l === "zh" ? "zh-CN" : "en";
    document.documentElement.dataset.sxaLang = l;
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      el.textContent = T(el.dataset.i18n, el.dataset.i18nN !== undefined ? { n: el.dataset.i18nN } : null);
    });
    document.querySelectorAll("[data-i18n-title]").forEach((el) => { el.title = T(el.dataset.i18nTitle); });
    document.querySelectorAll("[data-i18n-aria]").forEach((el) => { el.setAttribute("aria-label", T(el.dataset.i18nAria)); });
  }
  applyI18n();

  const version = chrome.runtime.getManifest().version;
  document.getElementById("ver").textContent = "v" + version;
  document.getElementById("foot").textContent = "Snow X Assistant · v" + version;

  const save = () => C.saveSettings(settings);
  const thrHint = document.getElementById("thrHint");

  // ---------- Tab ----------
  function showTab(name) {
    document.querySelectorAll(".tabs [data-tab]").forEach((b) => {
      const on = b.dataset.tab === name;
      b.setAttribute("aria-selected", String(on));
      b.tabIndex = on ? 0 : -1;
    });
    document.querySelectorAll(".panel").forEach((p) => { p.hidden = p.id !== "panel-" + name; });
    try { localStorage.setItem(TAB_KEY, name); } catch (_) {}
  }
  const tabBar = document.querySelector(".tabs");
  tabBar.addEventListener("click", (e) => {
    const b = e.target.closest("[data-tab]");
    if (b) showTab(b.dataset.tab);
  });
  tabBar.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    const tabs = Array.from(tabBar.querySelectorAll("[data-tab]"));
    const i = tabs.indexOf(document.activeElement);
    if (i < 0) return;
    const next = tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
    next.focus();
    showTab(next.dataset.tab);
  });
  document.getElementById("skinLink").addEventListener("click", () => showTab("skin"));
  let saved = null;
  try { saved = localStorage.getItem(TAB_KEY); } catch (_) {}
  showTab(TABS.includes(saved) ? saved : "tags");

  // ---------- 示例数据 ----------
  const sampleUser = { handle: "snow", followers: 123456, following: 820, tweets: 4321, followedBy: true, iFollow: true, createdAt: "Mon Jan 05 00:00:00 +0000 2015" };
  const sampleStat = { views: 200000, interactions: 9000 };
  const tweetAt = (perHour, now) => ({
    id: "s" + perHour, views: Math.round(perHour * 4), likes: 800, retweets: 120, replies: 60, quotes: 4, bookmarks: 90,
    createdAt: new Date(now - 4 * HOUR).toISOString(),
  });
  // 四档示例正好落在各档起点,默认阈值下显示 500 / 1k / 5k / 1万
  const levelSamples = () => [
    Math.max(1, Math.round(settings.velocityTrending / 2)),
    settings.velocityTrending,
    settings.velocityHot,
    settings.velocityViral,
  ];

  const aiSample = (score) => ({ score, level: score >= 75 ? 2 : 1, lang: "zh", hits: [] });

  function renderPreview(now) {
    const slot = document.getElementById("previewSlot");
    const empty = document.getElementById("previewEmpty");
    slot.replaceChildren();
    const built = B.build({ user: sampleUser, stat: sampleStat, tweet: tweetAt(levelSamples()[1], now), ai: aiSample(82), settings, now, compact: false });
    if (built) slot.append(built.wrap);
    empty.hidden = !!built;
    document.getElementById("skinLink").textContent = T("skin.link", { name: T("skin." + settings.skin) });
  }

  // 主题卡:一条模拟推文头(粉丝 + 热门流速 + 2 个质量标签),下面一行展示普通 / 升温 / 热门 / 爆款四档
  function renderSkins(now) {
    const box = document.getElementById("skins");
    box.replaceChildren();
    const samples = levelSamples();
    const rise = samples[2];
    for (const key of Object.keys(P.SKINS)) {
      const name = T("skin." + key);
      const full = Object.assign({}, settings, {
        skin: key, tagsEnabled: true, showVelocity: true, showFollowers: true, showRatio: false, maxTags: 2,
      });
      const head = B.build({ user: sampleUser, stat: sampleStat, tweet: tweetAt(rise, now), settings: full, now, compact: false });

      const velOnly = Object.assign({}, full, { tagsEnabled: false });
      const levels = B.el("span", "sxa-badge");
      levels.dataset.sxaSkin = key;
      for (const per of samples) {
        const v = B.build({ tweet: tweetAt(per, now), settings: velOnly, now });
        if (v) levels.append(...v.wrap.children);
      }

      const label = B.el("label", "skin");
      const input = document.createElement("input");
      input.type = "radio";
      input.name = "skin";
      input.value = key;
      input.dataset.key = "skin";

      const body = B.el("span", "skin-body");
      const title = B.el("span", "skin-title");
      title.dataset.inuse = T("skin.inuse");
      title.append(B.el("b", "", name), B.el("small", "", T("skind." + key)));
      const mock = B.el("span", "skin-mock");
      mock.append(B.el("i", "skin-av"), B.el("b", "", "Snow"), B.el("span", "skin-at", "@snow"));
      if (head) mock.append(head.wrap);
      const lv = B.el("span", "skin-levels");
      lv.append(B.el("span", "skin-cap", T("skin.capVel")), levels);

      const aiOnly = Object.assign({}, full, { tagsEnabled: false, showVelocity: false, showAiText: true });
      const aiRow = B.el("span", "sxa-badge");
      aiRow.dataset.sxaSkin = key;
      for (const sc of [12, 58, 86]) {
        const a = B.build({ ai: aiSample(sc), settings: aiOnly, now });
        if (a) aiRow.append(...a.wrap.children);
      }
      const aiLv = B.el("span", "skin-levels");
      aiLv.append(B.el("span", "skin-cap", T("skin.capAi")), aiRow);
      body.append(title, mock, lv, aiLv);
      label.append(input, body);
      box.append(label);
    }
  }

  function paint() {
    const now = Date.now();
    applyI18n();
    applyTheme();
    renderSkins(now);
    document.querySelectorAll('input[type="checkbox"][data-key]').forEach((el) => { el.checked = !!settings[el.dataset.key]; });
    document.querySelectorAll('input[type="radio"][data-key]').forEach((el) => { el.checked = String(settings[el.dataset.key]) === el.value; });
    document.querySelectorAll("input[data-num-radio]").forEach((el) => { el.checked = String(settings[el.dataset.numRadio]) === el.value; });
    document.querySelectorAll("input[data-tag]").forEach((el) => { el.checked = !!settings.tags[el.dataset.tag]; });
    document.querySelectorAll("[data-num]").forEach((el) => {
      if (document.activeElement !== el) el.value = String(settings[el.dataset.num]);
      el.classList.remove("bad");
      el.removeAttribute("aria-invalid");
    });
    thrHint.hidden = true;
    document.querySelectorAll("[data-depends]").forEach((el) => {
      const off = !settings[el.dataset.depends];
      el.classList.toggle("off", off);
      el.querySelectorAll("input, button, select").forEach((c) => { c.disabled = off; });
    });
    document.getElementById("thresholds").dataset.sxaSkin = settings.skin;
    renderPreview(now);
  }

  C.loadSettings((s) => {
    settings = s;
    paint();
  });

  // 阈值:读三个输入框一起校验。不合法时只标红提示、不保存,也不改动其它两项,
  // 用户接着改另一个框让顺序成立后,三项一起保存
  const THR = ["velocityTrending", "velocityHot", "velocityViral"];
  function applyThresholds() {
    const inputs = THR.map((k) => document.querySelector(`[data-num="${k}"]`));
    const vals = inputs.map((el) => Number(el.value));
    const bad = P.thresholdErrors(...vals);
    inputs.forEach((el, i) => {
      const isBad = bad.includes(THR[i]);
      el.classList.toggle("bad", isBad);
      if (isBad) el.setAttribute("aria-invalid", "true"); else el.removeAttribute("aria-invalid");
    });
    if (bad.length) {
      thrHint.textContent = T("thr.err");
      thrHint.hidden = false;
      return false;
    }
    THR.forEach((k, i) => { settings[k] = vals[i]; });
    return true;
  }

  document.addEventListener("change", (e) => {
    const el = e.target;
    if (el.name === "previewBg") {
      bgOverride = el.value;
      applyTheme();
      return;
    }
    if (!settings) return;
    if (el.dataset.num) {
      if (!applyThresholds()) return;
    } else if (el.dataset.numRadio) {
      settings[el.dataset.numRadio] = Number(el.value);
    } else if (el.type === "radio" && el.dataset.key) {
      settings[el.dataset.key] = el.dataset.key === "maxTags" ? Number(el.value) : el.value;
      if (el.dataset.key === "theme") bgOverride = null;
    } else if (el.type === "checkbox" && el.dataset.key) {
      settings[el.dataset.key] = el.checked;
    } else if (el.type === "checkbox" && el.dataset.tag) {
      settings.tags[el.dataset.tag] = el.checked;
    } else {
      return;
    }
    const focusSkin = el.name === "skin";
    settings = P.mergeSettings(settings);
    paint();
    if (focusSkin) {
      const cur = document.querySelector(`#skins input[value="${settings.skin}"]`);
      if (cur) cur.focus();
    }
    save();
  });
})();
