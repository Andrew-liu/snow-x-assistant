(() => {
  "use strict";
  const P = window.SnowXParse;
  const B = window.SnowXBadge;
  const KEY = "sxa_settings";
  const TAB_KEY = "sxa_popup_tab";
  const TABS = ["tags", "skin", "mutual"];
  const HOUR = 3600e3;
  let settings = null;

  const SKIN_DESC = {
    signal: "实心彩色胶囊,档位越高越亮",
    shield: "GitHub 徽章式,左边是名称,右边是数值",
    sticker: "粗黑描边加硬投影,微微歪斜的贴纸",
    terminal: "整条命令行,等宽字体竖线分隔",
    heatbar: "流速画成 5 格热度条,其余是纯文字",
    neon: "发光描边,在深色背景上最显眼",
    minimal: "不加框,只给文字上色,最贴近 X 原生",
    aurora: "渐变填充,爆款带呼吸光晕",
  };

  // 跟随系统深浅色;主题页可临时切换预览背景(不保存)
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  let bgOverride = null;
  const applyTheme = () => {
    const mode = bgOverride || (media.matches ? "dark" : "light");
    document.documentElement.dataset.sxaTheme = mode;
    document.querySelectorAll('#bgSeg input').forEach((r) => { r.checked = r.value === mode; });
  };
  applyTheme();
  media.addEventListener("change", applyTheme);

  const version = chrome.runtime.getManifest().version;
  document.getElementById("ver").textContent = "v" + version;
  document.getElementById("foot").textContent = "Snow X Assistant · v" + version;

  const save = () => chrome.storage.local.set({ [KEY]: settings });

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
  const levelSamples = () => [
    Math.max(1, Math.round(settings.velocityTrending / 2)),
    Math.round((settings.velocityTrending + settings.velocityHot) / 2),
    Math.round((settings.velocityHot + settings.velocityViral) / 2),
    settings.velocityViral * 2,
  ];

  function renderPreview(now) {
    const slot = document.getElementById("previewSlot");
    const empty = document.getElementById("previewEmpty");
    slot.replaceChildren();
    const built = B.build({ user: sampleUser, stat: sampleStat, tweet: tweetAt(levelSamples()[1], now), settings, now, compact: false });
    if (built) slot.append(built.wrap);
    empty.hidden = !!built;
    document.getElementById("skinLink").textContent = "主题:" + P.SKINS[settings.skin] + "  ›";
  }

  // 主题卡:一条模拟推文头(粉丝 + 热门流速 + 2 个质量标签),下面一行展示普通 / 升温 / 热门 / 爆款四档
  function renderSkins(now) {
    const box = document.getElementById("skins");
    box.replaceChildren();
    const samples = levelSamples();
    const rise = samples[2];
    for (const [key, name] of Object.entries(P.SKINS)) {
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
      title.append(B.el("b", "", name), B.el("small", "", SKIN_DESC[key] || ""));
      const mock = B.el("span", "skin-mock");
      mock.append(B.el("i", "skin-av"), B.el("b", "", "Snow"), B.el("span", "skin-at", "@snow"));
      if (head) mock.append(head.wrap);
      const lv = B.el("span", "skin-levels");
      lv.append(B.el("span", "skin-cap", "流速四档"), levels);
      body.append(title, mock, lv);
      label.append(input, body);
      box.append(label);
    }
  }

  function paint() {
    const now = Date.now();
    renderSkins(now);
    document.querySelectorAll('input[type="checkbox"][data-key]').forEach((el) => { el.checked = !!settings[el.dataset.key]; });
    document.querySelectorAll('input[type="radio"][data-key]').forEach((el) => { el.checked = String(settings[el.dataset.key]) === el.value; });
    document.querySelectorAll("input[data-num-radio]").forEach((el) => { el.checked = String(settings[el.dataset.numRadio]) === el.value; });
    document.querySelectorAll("input[data-tag]").forEach((el) => { el.checked = !!settings.tags[el.dataset.tag]; });
    document.querySelectorAll("[data-num]").forEach((el) => {
      if (document.activeElement !== el) el.value = String(settings[el.dataset.num]);
    });
    document.querySelectorAll("[data-depends]").forEach((el) => {
      const off = !settings[el.dataset.depends];
      el.classList.toggle("off", off);
      el.querySelectorAll("input, button, select").forEach((c) => { c.disabled = off; });
    });
    document.getElementById("thresholds").dataset.sxaSkin = settings.skin;
    renderPreview(now);
  }

  chrome.storage.local.get(KEY, (r) => {
    settings = P.mergeSettings(r && r[KEY]);
    paint();
  });

  document.addEventListener("change", (e) => {
    const el = e.target;
    if (el.name === "previewBg") {
      bgOverride = el.value;
      applyTheme();
      return;
    }
    if (!settings) return;
    if (el.dataset.num) {
      settings[el.dataset.num] = Number(el.value);
    } else if (el.dataset.numRadio) {
      settings[el.dataset.numRadio] = Number(el.value);
    } else if (el.type === "radio" && el.dataset.key) {
      settings[el.dataset.key] = el.dataset.key === "maxTags" ? Number(el.value) : el.value;
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
