// 统一标签:账号粉丝数 + 质量标签 + 单条推文流速,渲染在推文头部和用户列表里。
(() => {
  "use strict";
  const P = window.SnowXParse;
  const C = window.SnowXCommon;
  const I = window.SnowXI18n;
  const T = (k, v) => I.t(k, v);
  const LEGACY_HIST_KEY = "sxa_hist"; // 0.2.x 的粉丝记录,功能已移除,启动时清掉
  const SOURCE = "snow-x-assistant";
  const MAX_BODY = 30 * 1024 * 1024;
  const USERS_MAX = 5000;
  const TWEETS_MAX = 5000;
  const AUTHORS_MAX = 3000;
  const TWEETS_PER_AUTHOR = 200;

  // 都按最近使用淘汰:屏幕上正在用的条目每次渲染都会被读到,不会被挤掉
  const users = new P.LruMap(USERS_MAX);      // handle -> user
  const tweets = new P.LruMap(TWEETS_MAX);    // tweetId -> tweet(取浏览数最大的一次)
  const stats = P.createAuthorStats(AUTHORS_MAX, TWEETS_PER_AUTHOR); // 作者互动统计
  const AI = window.SnowXAiText;
  const aiCache = new P.LruMap(TWEETS_MAX);   // tweetId -> { key, res },正文不变就不重算
  let settings = null;
  let settingsVer = 0;
  let msgCount = 0;
  const pending = [];
  // 渲染状态(提前声明,数据包和设置回调都会用到)
  let fullPass = false;   // 下一次渲染处理视口附近的全部元素
  let timer = null;

  // 供 following.js 读取 GraphQL 里的关注关系
  window.__sxaUsers = users;

  // ---------- 设置 ----------
  function init() {
    added.push(document.documentElement); // 脚本晚于页面注入时,补扫一次已有节点
    C.loadSettings((s) => {
      settings = s;
      syncLang();
      applyDebug();
      flush();
    });
    if (C.storage) { try { C.storage.remove(LEGACY_HIST_KEY); } catch (_) {} }
    C.onSettingsChange((s) => {
      settings = s;
      settingsVer++;
      fullPass = true;
      syncLang();
      applyDebug();
      scheduleRender();
    });
  }

  // 语言写到 html[data-sxa-lang],shield 主题左侧的固定文字靠它切换
  function syncLang() {
    const l = C.applyLang(settings);
    if (document.documentElement.dataset.sxaLang !== l) document.documentElement.dataset.sxaLang = l;
  }

  function flush() {
    while (pending.length) handleMessage(pending.shift());
    fullPass = true;
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
      const old = users.peek(u.handle);
      // 有的接口不带关系字段,别把已知的关注关系覆盖成 false
      if (old) { u.followedBy = u.followedBy || old.followedBy; u.iFollow = u.iFollow || old.iFollow; }
      users.set(u.handle, u);
    }
    for (const t of ts) {
      const old = tweets.peek(t.id);
      if (old && !t.text && old.text) t.text = old.text; // 有的接口不带正文,保留之前拿到的
      if (!old || t.views >= old.views) tweets.set(t.id, t);
      else tweets.get(t.id);
      stats.add(t);
    }
    if (us.length || ts.length) fullPass = true;
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

  // GraphQL 没有正文时读页面上已渲染的正文(只取本条,跳过引用推文);表情图片取 alt
  function domText(article, un) {
    if (!article || article.querySelector('[data-testid="User-Name"]') !== un) return null;
    for (const n of article.querySelectorAll('[data-testid="tweetText"]')) {
      if (n.closest('article[data-testid="tweet"]') !== article) continue;
      const quote = n.closest('div[role="link"]');
      if (quote && article.contains(quote)) continue;
      let s = "";
      const walker = document.createTreeWalker(n, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
      for (let cur = walker.nextNode(); cur; cur = walker.nextNode()) {
        if (cur.nodeType === 3) s += cur.nodeValue;
        else if (cur.tagName === "IMG") s += cur.getAttribute("alt") || "";
        else if (cur.tagName === "BR") s += "\n";
      }
      s = s.trim();
      return s ? s.slice(0, 4000) : null;
    }
    return null;
  }

  const AI_SHORT = Object.freeze({ short: true });

  function aiFor(id, text) {
    if (!AI || !id || !text) return null;
    const key = text.length + ":" + text.slice(0, 48);
    const hit = aiCache.get(id);
    if (hit && hit.key === key) return hit.res || AI_SHORT;
    const res = AI.detect(text);
    aiCache.set(id, { key, res });
    return res || AI_SHORT;
  }

  // ---------- 标签构建 ----------
  function buildBadge(handle, tweet, compact, ai, tweetId) {
    const u = handle ? users.get(handle) : null;
    const built = window.SnowXBadge.build({
      user: u, stat: handle ? stats.get(handle) : null, tweet, ai, settings, now: Date.now(), compact,
    });
    if (!built) return null;
    const wrap = built.wrap;
    if (handle) wrap.dataset.sxaHandle = handle;
    const tid = tweet ? tweet.id : tweetId;
    if (tid) wrap.dataset.sxaTweet = tid;
    // 不让悬停事件冒泡给 X,避免触发 X 自带的资料悬浮卡
    C.stopEvents(wrap, ["mouseover", "mouseout", "pointerover", "pointerout", "mousemove", "pointermove"]);
    wrap.addEventListener("mouseenter", () => showTip(wrap));
    wrap.addEventListener("mouseleave", hideTip);
    return built;
  }

  function sigOf(handle, tweet, compact, ai) {
    const u = handle ? users.get(handle) : null;
    const s = handle ? stats.get(handle) : null;
    const vt = tweet && settings.showVelocity ? P.velocityTag(tweet, Date.now(), settings) : null;
    return [
      u ? u.followers : "-", s ? s.views : 0, u ? u.followedBy : "", u ? u.iFollow : "",
      tweet ? tweet.id : "", tweet ? tweet.views : "", vt ? vt.text : "", ai ? (ai.short ? "s" : ai.score) : "", settingsVer, compact ? 1 : 0,
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

  function moveBelow(row, badge) {
    const line = document.createElement("div");
    line.className = "sxa-line";
    line.append(badge);
    row.after(line);
    return line;
  }

  // 被替换的标签如果正挂着悬停卡,一起收起,免得卡片悬空
  function dropBadge(b) {
    if (tipFor === b) hideTip();
    b.remove();
  }

  function removePlaced(un) {
    const rec = placed.get(un);
    if (!rec) return;
    dropBadge(rec.badge);
    if (rec.line) rec.line.remove();
    placed.delete(un);
  }

  // 只做 DOM 写入;需要量尺寸的(自动换行 / 放到下一行)返回给 render 统一处理
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
    let ai = null;
    if (settings.showAiText && id) ai = aiFor(id, (tweet && tweet.text) || domText(article, un));
    const hasAi = !!ai;
    if (!hasUser && !hasVel && !hasAi) { removePlaced(un); return null; }

    const sig = sigOf(handle, tweet, false, ai);
    const rec = placed.get(un);
    if (rec && rec.badge.isConnected && rec.sig === sig) return null;
    removePlaced(un);

    const built = buildBadge(handle, tweet, false, ai, id);
    if (!built) return null;
    un.append(built.wrap);
    placed.set(un, { badge: built.wrap, line: null, sig });
    return settings.layout === "inline" ? null : { un, badge: built.wrap, layout: settings.layout, id };
  }

  // ----- 关注 / 粉丝列表里的用户行 -----
  function decorateCell(cell) {
    if (!settings.tagsEnabled) { cell.querySelectorAll(".sxa-badge").forEach(dropBadge); return; }
    const handle = handleOf(cell);
    if (!handle || !users.has(handle)) return;
    const compact = !!cell.closest('[data-testid="sidebarColumn"]');
    const sig = sigOf(handle, null, compact);
    const old = cell.querySelector(".sxa-badge");
    if (old && old.dataset.sxaHandle === handle && old.dataset.sxaSig === sig) return;
    if (old) dropBadge(old);
    const nameBlock = cell.querySelector('[dir="ltr"]')?.closest("div");
    const anchor = nameBlock && nameBlock.parentElement;
    if (!anchor) return;
    const built = buildBadge(handle, null, compact);
    if (!built) return;
    built.wrap.dataset.sxaSig = sig;
    anchor.append(built.wrap);
  }

  function cleanup() {
    document.querySelectorAll(".sxa-line").forEach((l) => l.remove());
    document.querySelectorAll(".sxa-badge").forEach((b) => b.remove());
    hideTip();
  }

  // X 有浅色 / 暗蓝 / 纯黑三种背景,自动时按 body 背景亮度同步到 html[data-sxa-theme];设置里强制了就用设置
  function syncTheme() {
    const dark = C.themeIsDark(settings);
    if (dark === null) return;
    const theme = dark ? "dark" : "light";
    if (document.documentElement.dataset.sxaTheme !== theme) document.documentElement.dataset.sxaTheme = theme;
  }

  // ---------- 增量渲染 ----------
  // 1. MutationObserver 只收集新增节点,从中找出推文头部 / 用户行;
  // 2. IntersectionObserver 维护"视口附近"的元素,只处理这些,屏幕外的等滚到附近再画;
  // 3. 新数据、设置变化、每分钟刷新时只重扫视口附近的元素,不再全页 querySelectorAll。
  const HEAD_SEL = '[data-testid="User-Name"]';
  const CELL_SEL = '[data-testid="UserCell"]';
  const TARGET_SEL = `${HEAD_SEL}, ${CELL_SEL}`;
  const OWN_SEL = ".sxa-badge, .sxa-line, #sxa-tip, #sxa-hud, .sxa-mc-bar";
  const added = [];            // 待检查的新增节点
  const tracked = new Set();   // 已交给 IntersectionObserver 的元素
  const visible = new Set();   // 视口上下 800px 内的元素
  const dirty = new Set();     // 下次渲染需要处理的元素

  const io = new IntersectionObserver((entries) => {
    for (const en of entries) {
      if (en.isIntersecting) { visible.add(en.target); dirty.add(en.target); }
      else visible.delete(en.target);
    }
    scheduleRender();
  }, { rootMargin: "800px 0px" });

  function track(el) {
    if (el.matches(HEAD_SEL) && !el.closest('article[data-testid="tweet"]')) return;
    if (!tracked.has(el)) { tracked.add(el); io.observe(el); dirty.add(el); return; }
    if (visible.has(el)) dirty.add(el); // 已在视口附近的元素内容变了,重新检查
  }

  function untrack(el) {
    io.unobserve(el);
    tracked.delete(el);
    visible.delete(el);
  }

  function discover(node) {
    const el = node.nodeType === 1 ? node : node.parentElement;
    if (!el || !el.isConnected || el.closest(OWN_SEL)) return;
    const up = el.closest(TARGET_SEL);
    if (up) track(up);
    for (const n of el.querySelectorAll(TARGET_SEL)) track(n);
  }

  // ---------- 防跳动 ----------
  // X 的时间线是虚拟列表:每条推文按缓存的高度绝对定位。插件让视口上方的推文变高 / 变矮时,
  // 下面正在看的内容会被整体推开,看起来就是页面乱跳。这里做三件事:
  // 1. 新挂载的推文在 MutationObserver 回调里同步加标签,赶在 X 测量高度之前,X 量到的就是最终高度;
  // 2. 推文一旦被放到"单独一行",之后重建标签时沿用,不在一行 / 两行之间来回切换;
  // 3. 其它时候(数据晚到、设置变化、每分钟刷新)改了视口上方元素的高度,就按视口顶部那条推文的位置把滚动补回去。
  const belowIds = new Set();  // 已放到下一行的推文 id
  let belowLayout = null;
  let settleRO = null;
  let settleJob = null;
  const BOX_SEL = '[data-testid="cellInnerDiv"]';
  const boxOf = (el) => el.closest(BOX_SEL) || el.closest('article[data-testid="tweet"]') || el;

  // 视口顶部的参照物:露出 30px 以上、位置最靠上的推文或用户行。只露出一条边的不算,
  // 否则它自己变高时会把下面真正在看的内容推开
  function topAnchor() {
    let best = null, bestTop = Infinity;
    for (const n of document.querySelectorAll('article[data-testid="tweet"], ' + CELL_SEL)) {
      const r = n.getBoundingClientRect();
      if (!r.height || r.bottom <= 30 || r.top >= window.innerHeight) continue;
      if (r.top < bestTop) { best = n; bestTop = r.top; }
    }
    return best ? { el: best, top: bestTop } : null;
  }

  // 写入前调用:记下视口上方将被修改的元素高度。没有这种元素时返回 null,省掉后续测量
  function measureAbove(work) {
    if (window.scrollY <= 0) return null;
    const anchor = topAnchor();
    if (!anchor) return null;
    const boxes = new Map();
    for (const el of work) {
      if (!el.isConnected) continue;
      const box = boxOf(el);
      if (boxes.has(box) || box.contains(anchor.el)) continue;
      const r = box.getBoundingClientRect();
      if (r.bottom <= anchor.top + 1) boxes.set(box, r.height);
    }
    return boxes.size ? { anchor, boxes } : null;
  }

  // 写入后调用:算出上方元素一共变了多少高度,然后在接下来几帧里盯住参照物,把它被推开的距离滚回去。
  // 只补偿方向一致、且不超过插件自己造成的变化量的偏移,X 自己已经补偿过时偏移为 0,不会重复补。
  function settleAfter(m) {
    if (!m) return;
    let expected = 0;
    for (const [box, h] of m.boxes) if (box.isConnected) expected += box.getBoundingClientRect().height - h;
    if (Math.abs(expected) < 0.5) return;
    const prev = settleJob;
    const job = { el: m.anchor.el, top0: m.anchor.top, y0: window.scrollY, corr: 0, left: expected + (prev ? prev.left : 0), frames: 0 };
    settleJob = job;
    if (!settleRO) settleRO = new ResizeObserver(() => { if (settleJob) settleStep(settleJob, false); });
    settleRO.disconnect();
    for (const box of m.boxes.keys()) if (box.isConnected) settleRO.observe(box);
    settleStep(job, true);
  }

  function settleStep(job, schedule) {
    if (settleJob !== job) return;
    if (!job.el.isConnected) { settleJob = null; return; }
    const top = job.el.getBoundingClientRect().top;
    const want = job.top0 - (window.scrollY - job.corr - job.y0);
    const drift = top - want;
    if (Math.abs(drift) >= 1 && Math.sign(drift) === Math.sign(job.left) && Math.abs(drift) <= Math.abs(job.left) + 2) {
      window.scrollBy(0, drift);
      job.corr += drift;
      job.left -= drift;
    }
    if (Math.abs(job.left) < 1) { settleJob = null; if (settleRO) settleRO.disconnect(); return; }
    if (!schedule) return;
    if (++job.frames > 12) { settleJob = null; if (settleRO) settleRO.disconnect(); return; }
    requestAnimationFrame(() => settleStep(job, true));
  }

  function render() {
    if (timer) { clearTimeout(timer); timer = null; }
    for (const n of added.splice(0)) discover(n);
    for (const el of tracked) if (!el.isConnected) untrack(el);
    if (!settings) return;
    syncTheme();
    if (!settings.tagsEnabled && !settings.showVelocity && !settings.showAiText) {
      dirty.clear();
      fullPass = false;
      cleanup();
      updateHud();
      return;
    }
    if (belowLayout !== settings.layout) { belowIds.clear(); belowLayout = settings.layout; }
    const work = fullPass ? new Set([...visible, ...dirty]) : new Set(dirty);
    fullPass = false;
    dirty.clear();
    if (!work.size) { updateHud(); return; }

    // 先量一次上方高度,再统一写入,再统一测量,最后统一挪位置:每轮布局计算次数固定
    const above = measureAbove(work);
    const checks = [];
    for (const el of work) {
      if (!el.isConnected) continue;
      if (el.matches(CELL_SEL)) decorateCell(el);
      else { const c = decorateTweet(el); if (c) checks.push(c); }
    }
    const moves = [];
    for (const c of checks) {
      const sticky = c.id && belowIds.has(c.id);
      if (c.layout === "auto" && !sticky && !crowded(c.un, c.badge)) continue;
      const row = headerRow(c.un);
      if (row) moves.push([c, row]);
    }
    for (const [c, row] of moves) {
      const rec = placed.get(c.un);
      const line = moveBelow(row, c.badge);
      if (rec && rec.badge === c.badge) rec.line = line;
      if (c.id) belowIds.add(c.id);
    }
    if (belowIds.size > TWEETS_MAX) belowIds.clear();
    settleAfter(above);
    updateHud();
  }

  function scheduleRender() {
    if (timer) return;
    timer = setTimeout(render, 150);
  }

  new MutationObserver((muts) => {
    let any = false;
    for (const m of muts) {
      for (const n of m.addedNodes) {
        // 自己插入的标签 / 悬停卡 / 工具栏不触发重绘,避免自激
        if (n.nodeType === 1 && n.matches(OWN_SEL)) continue;
        added.push(n);
        any = true;
      }
    }
    if (!any) return;
    if (!settings) { scheduleRender(); return; }
    // 新挂载的推文 / 用户行立即处理:这个回调在浏览器排版、X 测量高度之前执行,标签不会造成二次跳动
    const before = dirty.size;
    for (const n of added.splice(0)) discover(n);
    if (dirty.size > before) render();
  }).observe(document.documentElement, { childList: true, subtree: true });

  // 浏览数不变时流速也会随时间下降;每分钟检查一次视口附近的推文,显示值变了才重建
  setInterval(() => {
    if (!settings || !settings.showVelocity || document.hidden) return;
    fullPass = true;
    scheduleRender();
  }, 60e3);

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
    const text = `SXA 数据包:${msgCount} 用户:${users.size} 推文:${tweets.size} 作者:${stats.size} 视口:${visible.size} 已显示:${shown}`;
    if (hud.textContent !== text) hud.textContent = text;
  }

  // ---------- 悬停详情卡(安全 DOM 构建,不用 innerHTML) ----------
  let tip = null;
  let tipFor = null; // 当前悬停卡对应的标签

  function accountAge(createdAt, now) {
    const d = new Date(createdAt);
    if (isNaN(d)) return "";
    const months = Math.floor((now - d.getTime()) / (30.44 * 86400e3));
    const y = Math.floor(months / 12), m = months % 12;
    const span = y > 0 ? T(m ? "tip.ageYM" : "tip.ageY", { y, m }) : T("tip.ageM", { m });
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
      const rel = u.followedBy && u.iFollow ? T("tag.mutual") : u.followedBy ? T("tag.followsYou") : u.iFollow ? T("tip.following") : "";
      if (rel) head.append(E("span", "sxa-pill", rel));
      box.append(head);

      const L = I.lang();
      const grid = E("div", "sxa-stats");
      grid.append(
        stat(T("tip.followers"), P.fmt(u.followers, L)),
        stat(T("tip.followingN"), u.following === null ? "—" : P.fmt(u.following, L)),
        stat(T("tip.ratio"), P.fmtFollowingRatio(P.followingRatioOf(u))),
      );
      box.append(grid);

      const list = E("div", "sxa-kvs");
      const er = P.engagementOf(stats.get(handle));
      list.append(er === null ? kv(T("tip.er"), T("tip.lowSample"), "dim") : kv(T("tip.er"), `${(er * 100).toFixed(2)}%`));
      if (u.tweets !== null && u.tweets !== undefined) list.append(kv(T("tip.tweets"), Number(u.tweets).toLocaleString()));
      if (u.createdAt) list.append(kv(T("tip.joined"), accountAge(u.createdAt, now)));
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
      num.append(E("b", "sxa-n", shown.toLocaleString()), E("span", null, T("tip.vph")));
      read.append(num, E("span", "sxa-pill lv", window.SnowXBadge.levelName(lv)));
      sec.append(read);

      const score = P.viralScore(t, now);
      const bar = E("div", "sxa-score");
      const track = E("i", "sxa-track");
      const fill = E("i");
      fill.style.width = (100 - score) + "%";
      track.append(fill);
      bar.append(E("span", null, T("tip.viral")), track, E("b", "sxa-n", String(score)));
      sec.append(bar);

      const L = I.lang();
      const nums = E("div", "sxa-stats five");
      nums.append(
        stat(T("tip.views"), P.fmt(t.views, L)), stat(T("tip.likes"), P.fmt(t.likes, L)), stat(T("tip.rts"), P.fmt(t.retweets, L)),
        stat(T("tip.replies"), P.fmt(t.replies, L)), stat(T("tip.bms"), P.fmt(t.bookmarks, L)),
      );
      sec.append(nums);

      const foot = [t.createdAt ? T("tip.posted", { t: fmtTime(t.createdAt) }) : "", t.fromDom ? T("tip.fromDom") : ""].filter(Boolean).join(" · ");
      if (foot) sec.append(E("div", "sxa-foot", foot));
      box.append(sec);
    }

    const air = tweetId && settings.showAiText ? aiCache.peek(tweetId) : null;
    if (air && air.res) box.append(aiSection(air.res));
  }

  // AI 检测明细:总分、档位、命中最多的 4 条规则和命中片段
  function aiSection(r) {
    const sec = E("div", "sxa-tw sxa-ai-sec");
    sec.dataset.ai = String(r.level);
    const head = E("div", "sxa-ai-head");
    const num = E("div", "sxa-read-n");
    num.append(E("b", "sxa-n", r.score + "%"), E("span", null, T("tip.ai", { lang: T(r.lang === "zh" ? "tip.zh" : "tip.en") })));
    head.append(num, E("span", "sxa-pill ai", window.SnowXBadge.aiLevelName(r.level)));
    sec.append(head);
    const row = (h) => {
      const el = E("div", "sxa-ai-hit");
      el.append(E("span", null, I.ruleLabel(h.id, h.label) + (h.n > 1 ? ` ×${h.n}` : "")), E("q", null, h.sample || ""));
      return el;
    };
    if (r.hits.length) {
      const list = E("div", "sxa-ai-hits");
      for (const h of r.hits.slice(0, 4)) list.append(row(h));
      sec.append(list);
    } else {
      sec.append(E("div", "sxa-foot", T("tip.aiNone")));
    }
    const bait = r.bait || [];
    if (bait.length) {
      sec.append(E("div", "sxa-foot", T("tip.aiBait")));
      const list = E("div", "sxa-ai-hits");
      for (const h of bait.slice(0, 2)) list.append(row(h));
      sec.append(list);
    }
    sec.append(E("div", "sxa-foot", T("tip.aiNote")));
    return sec;
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
    tipFor = badge;
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
  function hideTip() { tipFor = null; if (tip) { tip.style.display = "none"; tip.classList.remove("in"); } }

  window.addEventListener("scroll", hideTip, { passive: true });

  init();
})();
