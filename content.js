// 统一标签:账号粉丝数 + 质量标签 + 单条推文流速,渲染在推文头部和用户列表里。
(() => {
  "use strict";
  const P = window.SnowXParse;
  const SETTINGS_KEY = "sxa_settings";
  const LEGACY_HIST_KEY = "sxa_hist"; // 0.2.x 的粉丝记录,功能已移除,启动时清掉
  const SOURCE = "snow-x-assistant";
  const MAX_BODY = 30 * 1024 * 1024;
  const TWEETS_MAX = 5000;

  const users = new Map();      // handle -> user
  const tweets = new Map();     // tweetId -> tweet(取最新一次看到的数据)
  const statSeen = new Set();   // 已计入作者互动统计的推文
  const stats = new Map();      // handle -> { views, interactions }
  let settings = null;
  let settingsVer = 0;
  let msgCount = 0;
  const pending = [];

  // 供 following.js 读取 GraphQL 里的关注关系
  window.__sxaUsers = users;

  const storage = (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) || null;

  // ---------- 设置 ----------
  function init() {
    if (!storage) { settings = P.mergeSettings(); flush(); return; }
    storage.get(SETTINGS_KEY, (res) => {
      settings = P.mergeSettings(res && res[SETTINGS_KEY]);
      applyDebug();
      flush();
    });
    try { storage.remove(LEGACY_HIST_KEY); } catch (_) {}
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local" || !changes[SETTINGS_KEY]) return;
      settings = P.mergeSettings(changes[SETTINGS_KEY].newValue);
      settingsVer++;
      applyDebug();
      scheduleRender();
    });
  }

  function flush() {
    while (pending.length) handleMessage(pending.shift());
    scheduleRender();
  }

  // ---------- 数据包 ----------
  window.addEventListener("message", (e) => {
    if (e.source !== window || !e.data || e.data.source !== SOURCE) return;
    const body = e.data.body;
    if (typeof body !== "string" || body.length > MAX_BODY) return;
    msgCount++;
    if (!settings) { pending.push(body); return; }
    handleMessage(body);
    scheduleRender();
  });

  function handleMessage(body) {
    let json;
    try { json = JSON.parse(body); } catch (_) { return; }
    const { users: us, tweets: ts } = P.extract(json);
    for (const u of us) {
      const old = users.get(u.handle);
      // 有的接口不带关系字段,别把已知的关注关系覆盖成 false
      if (old) { u.followedBy = u.followedBy || old.followedBy; u.iFollow = u.iFollow || old.iFollow; }
      users.set(u.handle, u);
    }
    for (const t of ts) {
      const old = tweets.get(t.id);
      if (!old || t.views >= old.views) tweets.set(t.id, t);
      if (!statSeen.has(t.id)) {
        statSeen.add(t.id);
        const s = stats.get(t.author) || { views: 0, interactions: 0 };
        s.views += t.views;
        s.interactions += P.interactionsOf(t);
        stats.set(t.author, s);
      }
    }
    if (tweets.size > TWEETS_MAX) {
      const drop = tweets.size - TWEETS_MAX;
      let i = 0;
      for (const k of tweets.keys()) { if (i++ >= drop) break; tweets.delete(k); }
    }
  }

  // ---------- DOM 辅助 ----------
  function handleOf(container) {
    for (const a of container.querySelectorAll('a[role="link"][href^="/"]')) {
      const m = a.getAttribute("href").match(/^\/([A-Za-z0-9_]{1,15})$/);
      if (m && a.textContent.trim().startsWith("@")) return m[1].toLowerCase();
    }
    return null;
  }

  const statusIdOf = (a) => {
    const m = a && (a.getAttribute("href") || "").match(/\/status\/(\d+)/);
    return m ? m[1] : null;
  };

  // 找 User-Name 对应的推文 ID:时间戳链接一般在头部;详情页主推文的时间在底部
  function tweetIdFor(un, article) {
    const t = un.querySelector('a[href*="/status/"] time');
    if (t) return statusIdOf(t.closest("a"));
    if (!article) return null;
    const first = article.querySelector('[data-testid="User-Name"]');
    if (first !== un) return null;
    for (const time of article.querySelectorAll('a[href*="/status/"] time')) {
      if (time.closest('article[data-testid="tweet"]') !== article) continue;
      if (time.closest('div[role="link"]')) continue; // 引用推文
      return statusIdOf(time.closest("a"));
    }
    return null;
  }

  const countIn = (el) => {
    const m = String((el && el.getAttribute("aria-label")) || "").match(/\d[\d,.\s\u00a0\u202f]*/);
    return m ? Number.parseInt(m[0].replace(/\D/g, ""), 10) || 0 : 0;
  };

  // GraphQL 没拿到时从页面已渲染的数字兜底(纯读 DOM,不发请求)
  function domTweet(article, id, author) {
    if (!article) return null;
    const own = (sel) => Array.from(article.querySelectorAll(sel)).find((n) => n.closest('article[data-testid="tweet"]') === article);
    const analytics = own(`a[href*="/status/${id}/analytics"]`);
    const time = own(`a[href*="/status/${id}"] time`) || own("time[datetime]");
    if (!analytics || !time) return null;
    const t = {
      id, author: author || "",
      views: countIn(analytics),
      likes: countIn(own('button[data-testid="like"], button[data-testid="unlike"]')),
      retweets: countIn(own('button[data-testid="retweet"], button[data-testid="unretweet"]')),
      replies: countIn(own('button[data-testid="reply"]')),
      quotes: 0,
      bookmarks: countIn(own('button[data-testid="bookmark"], button[data-testid="removeBookmark"]')),
      createdAt: time.getAttribute("datetime"),
      fromDom: true,
    };
    return t.views ? t : null;
  }

  // ---------- 标签构建 ----------
  function buildBadge(handle, tweet, compact) {
    const u = handle ? users.get(handle) : null;
    const built = window.SnowXBadge.build({
      user: u, stat: handle ? stats.get(handle) : null, tweet, settings, now: Date.now(), compact,
    });
    if (!built) return null;
    const wrap = built.wrap;
    if (handle) wrap.dataset.sxaHandle = handle;
    if (tweet) wrap.dataset.sxaTweet = tweet.id;
    // 不让悬停事件冒泡给 X,避免触发 X 自带的资料悬浮卡
    for (const ev of ["mouseover", "mouseout", "pointerover", "pointerout", "mousemove", "pointermove"]) {
      wrap.addEventListener(ev, (e) => e.stopPropagation());
    }
    wrap.addEventListener("mouseenter", () => showTip(wrap));
    wrap.addEventListener("mouseleave", hideTip);
    return built;
  }

  function sigOf(handle, tweet, compact) {
    const u = handle ? users.get(handle) : null;
    const s = handle ? stats.get(handle) : null;
    return [
      u ? u.followers : "-", s ? s.views : 0, u ? u.followedBy : "", u ? u.iFollow : "",
      tweet ? tweet.id : "", tweet ? tweet.views : "", settingsVer, compact ? 1 : 0,
    ].join("|");
  }

  // ----- 推文头部 -----
  const placed = new WeakMap(); // User-Name 元素 -> { badge, line, sig }

  function headerRow(un) {
    const row = un.parentElement && un.parentElement.parentElement && un.parentElement.parentElement.parentElement;
    const host = row && row.parentElement;
    if (!row || !host) return null;
    const rs = getComputedStyle(row), hs = getComputedStyle(host);
    return rs.display === "flex" && rs.flexDirection === "row" && hs.flexDirection === "column" ? row : null;
  }

  function crowded(un, badge) {
    for (const n of un.querySelectorAll("*")) {
      if (n === badge || badge.contains(n)) continue;
      if (n.clientWidth > 0 && n.scrollWidth > n.clientWidth + 1) return true;
    }
    return false;
  }

  function placeBelow(un, badge) {
    const row = headerRow(un);
    if (!row) return null;
    const line = document.createElement("div");
    line.className = "sxa-line";
    line.append(badge);
    row.after(line);
    return line;
  }

  function removePlaced(un) {
    const rec = placed.get(un);
    if (!rec) return;
    rec.badge.remove();
    if (rec.line) rec.line.remove();
    placed.delete(un);
  }

  function decorateTweet(un) {
    const article = un.closest('article[data-testid="tweet"]');
    const handle = handleOf(un);
    const id = tweetIdFor(un, article);
    let tweet = id ? tweets.get(id) : null;
    if (!tweet && id && settings.showVelocity) {
      tweet = domTweet(article, id, handle);
      if (tweet) tweets.set(id, tweet);
    }
    const hasUser = settings.tagsEnabled && handle && users.has(handle);
    const hasVel = settings.showVelocity && tweet;
    if (!hasUser && !hasVel) { removePlaced(un); return; }

    const sig = sigOf(handle, tweet, false);
    const rec = placed.get(un);
    if (rec && rec.badge.isConnected && rec.sig === sig) return;
    removePlaced(un);

    const built = buildBadge(handle, tweet, false);
    if (!built) return;
    let line = null;
    if (settings.layout === "below") {
      line = placeBelow(un, built.wrap);
      if (!line) un.append(built.wrap);
    } else {
      un.append(built.wrap);
      if (settings.layout === "auto" && crowded(un, built.wrap)) line = placeBelow(un, built.wrap);
    }
    placed.set(un, { badge: built.wrap, line, sig });
  }

  // ----- 关注 / 粉丝列表里的用户行 -----
  function decorateCell(cell, anchor) {
    const handle = handleOf(cell);
    if (!settings.tagsEnabled) { cell.querySelectorAll(".sxa-badge").forEach((b) => b.remove()); return; }
    if (!handle || !users.has(handle)) return;
    const compact = !!cell.closest('[data-testid="sidebarColumn"]');
    const sig = sigOf(handle, null, compact);
    const old = cell.querySelector(".sxa-badge");
    if (old && old.dataset.sxaHandle === handle && old.dataset.sxaSig === sig) return;
    if (old) old.remove();
    const built = buildBadge(handle, null, compact);
    if (!built) return;
    built.wrap.dataset.sxaSig = sig;
    if (anchor) anchor.append(built.wrap);
  }

  function cleanup() {
    document.querySelectorAll(".sxa-line").forEach((l) => l.remove());
    document.querySelectorAll(".sxa-badge").forEach((b) => b.remove());
    hideTip();
  }

  // X 有浅色 / 暗蓝 / 纯黑三种背景,按 body 背景亮度同步到 html[data-sxa-theme]
  function syncTheme() {
    if (!document.body) return;
    const m = getComputedStyle(document.body).backgroundColor.match(/\d+/g);
    if (!m) return;
    const theme = (+m[0] * 299 + +m[1] * 587 + +m[2] * 114) / 1000 < 128 ? "dark" : "light";
    if (document.documentElement.dataset.sxaTheme !== theme) document.documentElement.dataset.sxaTheme = theme;
  }

  function render() {
    if (!settings) return;
    syncTheme();
    if (!settings.tagsEnabled && !settings.showVelocity) { cleanup(); updateHud(); return; }
    document.querySelectorAll('article[data-testid="tweet"] [data-testid="User-Name"]').forEach(decorateTweet);
    document.querySelectorAll('[data-testid="UserCell"]').forEach((cell) => {
      const nameBlock = cell.querySelector('[dir="ltr"]')?.closest("div");
      decorateCell(cell, nameBlock && nameBlock.parentElement);
    });
    updateHud();
  }

  let timer = null;
  function scheduleRender() {
    if (timer) return;
    timer = setTimeout(() => { timer = null; render(); }, 150);
  }

  new MutationObserver((muts) => {
    // 只由我们自己的节点变化引起的回调不重绘,避免自激
    for (const m of muts) {
      const t = m.target;
      if (t.nodeType === 1 && (t.closest(".sxa-badge, #sxa-tip, #sxa-hud, .sxa-mc-bar"))) continue;
      scheduleRender();
      return;
    }
  }).observe(document.documentElement, { childList: true, subtree: true });

  // ---------- 调试条 ----------
  let hud = null;
  function applyDebug() {
    if (settings.debug && !hud) {
      hud = document.createElement("div");
      hud.id = "sxa-hud";
      document.documentElement.append(hud);
    } else if (!settings.debug && hud) {
      hud.remove();
      hud = null;
    }
    updateHud();
  }
  function updateHud() {
    if (!hud) return;
    const shown = document.querySelectorAll(".sxa-badge").length;
    const text = `SXA 数据包:${msgCount} 用户:${users.size} 推文:${tweets.size} 已显示:${shown}`;
    if (hud.textContent !== text) hud.textContent = text;
  }

  // ---------- 悬停详情卡(安全 DOM 构建,不用 innerHTML) ----------
  let tip = null;

  function accountAge(createdAt, now) {
    const d = new Date(createdAt);
    if (isNaN(d)) return "";
    const months = Math.floor((now - d.getTime()) / (30.44 * 86400e3));
    const y = Math.floor(months / 12), m = months % 12;
    const span = y > 0 ? `${y} 年${m ? ` ${m} 个月` : ""}` : `${m} 个月`;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")} · ${span}`;
  }

  function fmtTime(s) {
    const d = new Date(s);
    if (isNaN(d)) return "";
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  const E = (tag, cls, text) => window.SnowXBadge.el(tag, cls, text);

  function stat(label, value, cls) {
    const c = E("div", "sxa-st" + (cls ? " " + cls : ""));
    c.append(E("b", "sxa-n", value), E("span", null, label));
    return c;
  }

  function kv(label, value, cls) {
    const r = E("div", "sxa-kv");
    r.append(E("span", null, label), E("b", cls || null, value));
    return r;
  }

  function fillTip(box, handle, tweetId) {
    box.replaceChildren();
    const now = Date.now();
    const u = handle && settings.tagsEnabled ? users.get(handle) : null;
    if (u) {
      const head = E("div", "sxa-tip-head");
      const who = E("div", "sxa-who");
      who.append(E("b", null, u.name || handle), E("span", null, "@" + handle));
      head.append(who);
      const rel = u.followedBy && u.iFollow ? "互关" : u.followedBy ? "关注了你" : u.iFollow ? "已关注" : "";
      if (rel) head.append(E("span", "sxa-pill", rel));
      box.append(head);

      const grid = E("div", "sxa-stats");
      grid.append(
        stat("粉丝", P.fmt(u.followers)),
        stat("关注", P.fmt(u.following)),
        stat("粉/关比", P.fmtRatio(P.ratioOf(u))),
      );
      box.append(grid);

      const list = E("div", "sxa-kvs");
      const er = P.engagementOf(stats.get(handle));
      list.append(er === null ? kv("互动率", "样本不足", "dim") : kv("互动率", `${(er * 100).toFixed(2)}%`));
      if (u.tweets !== null && u.tweets !== undefined) list.append(kv("推文", Number(u.tweets).toLocaleString()));
      if (u.createdAt) list.append(kv("注册于", accountAge(u.createdAt, now)));
      box.append(list);
    }

    const t = tweetId ? tweets.get(tweetId) : null;
    const v = t && settings.showVelocity ? P.velocityOf(t, now) : null;
    if (t && v !== null) {
      const sec = E("div", "sxa-tw");
      const shown = Math.round(v);
      const lv = P.velocityLevel(shown, settings);
      const read = E("div", "sxa-read");
      read.dataset.lv = String(lv);
      const num = E("div", "sxa-read-n");
      const ic = window.SnowXBadge.icon(lv, true);
      if (ic) num.append(ic);
      num.append(E("b", "sxa-n", shown.toLocaleString()), E("span", null, "浏览/小时"));
      read.append(num, E("span", "sxa-pill lv", window.SnowXBadge.LEVEL_NAMES[lv]));
      sec.append(read);

      const score = P.viralScore(t, now);
      const bar = E("div", "sxa-score");
      const track = E("i", "sxa-track");
      const fill = E("i");
      fill.style.width = (100 - score) + "%";
      track.append(fill);
      bar.append(E("span", null, "爆款分"), track, E("b", "sxa-n", String(score)));
      sec.append(bar);

      const nums = E("div", "sxa-stats five");
      nums.append(
        stat("浏览", P.fmt(t.views)), stat("赞", P.fmt(t.likes)), stat("转", P.fmt(t.retweets)),
        stat("评", P.fmt(t.replies)), stat("藏", P.fmt(t.bookmarks)),
      );
      sec.append(nums);

      const foot = [t.createdAt ? fmtTime(t.createdAt) + " 发布" : "", t.fromDom ? "取自页面数字" : ""].filter(Boolean).join(" · ");
      if (foot) sec.append(E("div", "sxa-foot", foot));
      box.append(sec);
    }
  }

  function showTip(badge) {
    if (!settings || !settings.hoverCard) return;
    if (!tip) {
      tip = document.createElement("div");
      tip.id = "sxa-tip";
      document.documentElement.append(tip);
    }
    tip.dataset.sxaSkin = settings.skin;
    fillTip(tip, badge.dataset.sxaHandle, badge.dataset.sxaTweet);
    if (!tip.childElementCount) return;
    syncTheme();
    tip.style.display = "block";
    const r = badge.getBoundingClientRect();
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    const left = Math.min(Math.max(8, r.left), window.innerWidth - tw - 8);
    let top = r.bottom + 8;
    if (top + th > window.innerHeight - 8) top = Math.max(8, r.top - th - 8);
    tip.style.left = left + "px";
    tip.style.top = top + "px";
    tip.classList.remove("in");
    void tip.offsetWidth;
    tip.classList.add("in");
  }
  function hideTip() { if (tip) { tip.style.display = "none"; tip.classList.remove("in"); } }

  window.addEventListener("scroll", hideTip, { passive: true });

  init();
})();
