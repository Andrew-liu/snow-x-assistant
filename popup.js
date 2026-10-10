(() => {
  "use strict";
  const P = window.SnowXParse;
  const B = window.SnowXBadge;
  const KEY = "sxa_settings";
  const TAB_KEY = "sxa_popup_tab";
  const HOUR = 3600e3;
  let settings = null;

  // 跟随系统深浅色,复用 content.css 里的同一套变量
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const applyTheme = () => { document.documentElement.dataset.sxaTheme = media.matches ? "dark" : "light"; };
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
  document.querySelector(".tabs").addEventListener("click", (e) => {
    const b = e.target.closest("[data-tab]");
    if (b) showTab(b.dataset.tab);
  });
  document.querySelector(".tabs").addEventListener("keydown", (e) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    const tabs = Array.from(document.querySelectorAll(".tabs [data-tab]"));
    const i = tabs.indexOf(document.activeElement);
    if (i < 0) return;
    const next = tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
    next.focus();
    showTab(next.dataset.tab);
  });
  let saved = null;
  try { saved = localStorage.getItem(TAB_KEY); } catch (_) {}
  showTab(saved === "mutual" ? "mutual" : "tags");

  // ---------- 示例数据 ----------
  const sampleUser = { handle: "snow", followers: 123456, following: 820, tweets: 4321, followedBy: true, iFollow: true, createdAt: "Mon Jan 05 00:00:00 +0000 2015" };
  const sampleStat = { views: 200000, interactions: 9000 };
  const tweetAt = (perHour, now) => ({
    id: "s" + perHour, views: Math.round(perHour * 4), likes: 800, retweets: 120, replies: 60, quotes: 4, bookmarks: 90,
    createdAt: new Date(now - 4 * HOUR).toISOString(),
  });

  function renderPreview(now) {
    const slot = document.getElementById("previewSlot");
    const empty = document.getElementById("previewEmpty");
    slot.replaceChildren();
    const built = B.build({ user: sampleUser, stat: sampleStat, tweet: tweetAt(5750, now), settings, now, compact: false });
    if (built) slot.append(built.wrap);
    empty.hidden = !!built;
  }

  // 主题卡片:每张卡用该主题渲染 粉丝 + 1 个质量标签 + 上升 + 爆款,能直接比较流速的亮度
  function renderSkins(now) {
    const box = document.getElementById("skins");
    box.replaceChildren();
    const midRise = Math.round((settings.velocityTrending + settings.velocityViral) / 2);
    for (const [key, name] of Object.entries(P.SKINS)) {
      const s = Object.assign({}, settings, { skin: key, tagsEnabled: true, showFollowers: true, showRatio: false, maxTags: 1, showVelocity: false });
      const acct = B.build({ user: sampleUser, stat: sampleStat, settings: s, now, compact: false });
      const vel = Object.assign({}, s, { tagsEnabled: false, showVelocity: true });
      const wrap = acct ? acct.wrap : B.el("span", "sxa-badge");
      wrap.dataset.sxaSkin = key;
      for (const per of [midRise, settings.velocityViral * 2]) {
        const v = B.build({ tweet: tweetAt(per, now), settings: vel, now });
        if (v) wrap.append(...v.wrap.children);
      }

      const label = B.el("label", "skin");
      const input = document.createElement("input");
      input.type = "radio";
      input.name = "skin";
      input.value = key;
      input.dataset.key = "skin";
      const body = B.el("span", "skin-body");
      body.append(B.el("span", "skin-name", name), wrap);
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
    document.getElementById("mutualDot").hidden = !settings.mutualEnabled;
    renderPreview(now);
  }

  chrome.storage.local.get(KEY, (r) => {
    settings = P.mergeSettings(r && r[KEY]);
    paint();
  });

  document.addEventListener("change", (e) => {
    const el = e.target;
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
    settings = P.mergeSettings(settings); // 校正阈值、主题等取值
    paint();
    if (focusSkin) {
      const cur = document.querySelector(`#skins input[value="${settings.skin}"]`);
      if (cur) cur.focus();
    }
    save();
  });
})();
