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
      syncLayout();
      applyDebug();
      flush();
    });
    if (C.storage) { try { C.storage.remove(LEGACY_HIST_KEY); } catch (_) {} }
    C.onSettingsChange((s) => {
      settings = s;
      settingsVer++;
      fullPass = true;
      if (!s.showDownload) document.querySelectorAll(".sxa-dl-wrap").forEach((b) => b.remove());
      else document.querySelectorAll(".sxa-dl").forEach((b) => { if (!b.dataset.state) b.title = T("dl.btn"); });
      syncLang();
      syncLayout();
      applyDebug();
      scheduleRender();
    });
  }

  // 语言写到 html[data-sxa-lang],shield 主题左侧的固定文字靠它切换
  function syncLang() {
    const l = C.applyLang(settings);
    if (document.documentElement.dataset.sxaLang !== l) document.documentElement.dataset.sxaLang = l;
  }

  // 「单独一行」靠 CSS 在推文头部预留空间,布局模式写到 html[data-sxa-layout];
  // 一个标签功能都没开时不预留
  function syncLayout() {
    const on = settings.tagsEnabled || settings.showVelocity || settings.showAiText;
    if (on) {
      if (document.documentElement.dataset.sxaLayout !== settings.layout)
        document.documentElement.dataset.sxaLayout = settings.layout;
    } else delete document.documentElement.dataset.sxaLayout;
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
      if (old && !t.videos.length && old.videos && old.videos.length) t.videos = old.videos;
      if (old && !t.quotedId && old.quotedId) t.quotedId = old.quotedId;
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
  const placed = new WeakMap(); // User-Name 元素 -> { badge, sig }

  function crowded(un, badge) {
    for (const n of un.querySelectorAll("*")) {
      if (n === badge || badge.contains(n)) continue;
      if (n.clientWidth > 0 && n.scrollWidth > n.clientWidth + 1) return true;
    }
    return false;
  }

  // 放不下时从末尾收起标签,至少留一个;只删标签内部元素,不改变推文高度
  function trim(un, badge) {
    while (badge.childElementCount > 1 && crowded(un, badge)) badge.lastElementChild.remove();
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
    placed.delete(un);
  }

  // 只做 DOM 写入;自动模式下需要量尺寸收起标签的返回给 render 统一处理
  function decorateTweet(un) {
    const article = un.closest('article[data-testid="tweet"]');
    const q = un.closest('div[role="link"]');
    const inQuote = !!(q && article && article.contains(q));
    const handle = handleOf(un);
    const id = tweetIdFor(un, article);
    if (!inQuote && article && article.querySelector(HEAD_SEL) === un) placeDownload(article, id);
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
    placed.set(un, { badge: built.wrap, sig });
    // 单独一行:CSS 已在头部预留一行,标签绝对定位进去;引用推文里的头部不预留,退回自动模式
    if (settings.layout === "below" && !inQuote) { built.wrap.classList.add("sxa-below"); return null; }
    if (settings.layout === "inline") return null;
    return { un, badge: built.wrap };
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
  const OWN_SEL = ".sxa-badge, #sxa-tip, #sxa-hud, .sxa-mc-bar, .sxa-dl-wrap";
  const VIDEO_SEL = '[data-testid="videoPlayer"], [data-testid="videoComponent"], video';
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
    // 视频播放器常晚于推文头部挂载:出现时让所在推文的头部重查一次下载按钮
    if (settings && settings.showDownload) {
      const v = el.matches(VIDEO_SEL) ? el : el.querySelector(VIDEO_SEL);
      const art = v && v.closest('article[data-testid="tweet"]');
      const head = art && art.querySelector(HEAD_SEL);
      if (head && !art.querySelector(".sxa-dl-wrap")) track(head);
    }
  }

  // ---------- 防跳动 ----------
  // X 在 React 提交时就给每条推文量好高度,早于 MutationObserver,所以插件不能改变推文高度:
  // 「单独一行」由 CSS 给推文头部固定预留 24px,标签绝对定位进去,X 量到的就是最终高度;
  // 「自动」和「跟在名字后」只把标签放在名字后(负外边距不占高度),太挤就从末尾收起标签;
  // 不再做滚动补偿。

  function render() {
    if (timer) { clearTimeout(timer); timer = null; }
    for (const n of added.splice(0)) discover(n);
    for (const el of tracked) if (!el.isConnected) untrack(el);
    if (!settings) return;
    syncTheme();
    if (!settings.tagsEnabled && !settings.showVelocity && !settings.showAiText && !settings.showDownload) {
      dirty.clear();
      fullPass = false;
      cleanup();
      updateHud();
      return;
    }
    const work = fullPass ? new Set([...visible, ...dirty]) : new Set(dirty);
    fullPass = false;
    dirty.clear();
    if (!work.size) { updateHud(); return; }

    // 先统一写入 DOM,再统一测量收起放不下的标签:每轮布局计算次数固定,且都不改变推文高度
    const checks = [];
    for (const el of work) {
      if (!el.isConnected) continue;
      if (el.matches(CELL_SEL)) decorateCell(el);
      else { const c = decorateTweet(el); if (c) checks.push(c); }
    }
    for (const c of checks) trim(c.un, c.badge);
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
    // 新挂载的推文 / 用户行立即处理:这个回调在 X 测量高度之前执行,同步写入让 X 量到最终高度
    for (const n of added.splice(0)) discover(n);
    if (dirty.size) render();
  }).observe(document.documentElement, { childList: true, subtree: true });

  // 浏览数不变时流速也会随时间下降;每分钟检查一次视口附近的推文,显示值变了才重建
  setInterval(() => {
    if (!settings || !settings.showVelocity || document.hidden) return;
    fullPass = true;
    scheduleRender();
  }, 60e3);

  // ---------- 视频下载 ----------
  // 优先用 GraphQL 里已缓存的视频直链;没有时让后台请求 X 公开嵌入接口。下载交给后台调用 chrome.downloads。
  function mediaRecord(id) {
    const t = id ? tweets.peek(id) : null;
    if (!t) return null;
    const q = t.quotedId ? tweets.peek(t.quotedId) : null;
    const rec = {
      id: t.id, author: t.author || "", text: (t.text || "").slice(0, 280), videos: t.videos || [],
      quoted: q ? { id: q.id, author: q.author || "", text: (q.text || "").slice(0, 280), videos: q.videos || [], quoted: null } : null,
    };
    return P.pickMedia(rec) ? rec : null;
  }

  function send(msg) {
    return new Promise((ok, fail) => {
      try {
        chrome.runtime.sendMessage(msg, (r) => {
          const err = chrome.runtime.lastError;
          if (err) fail(new Error(err.message || "failed"));
          else ok(r);
        });
      } catch (e) { fail(e); } // 扩展被刷新后旧页面的上下文会失效
    });
  }

  const SVG_NS = "http://www.w3.org/2000/svg";
  function dlIcon() {
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", "M11 3h2v9.59l3.3-3.3 1.4 1.42L12 16.4l-5.7-5.7 1.4-1.42 3.3 3.3V3zM4 15h2v4h12v-4h2v6H4v-6z");
    svg.append(path);
    return svg;
  }

  function setDlState(btn, state, title) {
    clearTimeout(btn.__sxaTimer);
    if (state) btn.dataset.state = state; else delete btn.dataset.state;
    btn.title = title || T("dl.btn");
    btn.setAttribute("aria-label", btn.title);
    if (state === "done" || state === "err") btn.__sxaTimer = setTimeout(() => setDlState(btn, null), 3500);
  }

  function dlErrorText(code) {
    return T(P.dlErrorKey(code), { e: code });
  }

  async function runDownload(btn, id) {
    if (btn.dataset.state === "busy") return;
    setDlState(btn, "busy", T("dl.btnBusy"));
    try {
      let rec = mediaRecord(id);
      if (!rec) {
        const r = await send({ type: "sxa-resolve", id });
        if (!r || !r.ok) throw new Error((r && r.error) || "failed");
        rec = r.rec;
      }
      const m = P.pickMedia(rec);
      if (!m) throw new Error("no_video");
      const labels = [];
      for (let i = 0; i < m.videos.length; i++) {
        const v = m.videos[i];
        const best = v.variants[0];
        const r = await send({ type: "sxa-download", url: best.url, filename: P.videoFileName(m.author, m.id, i, m.videos.length, best, v.kind) });
        if (!r || !r.ok) throw new Error((r && r.error) || "failed");
        labels.push(P.qualityLabel(best, v.kind));
      }
      setDlState(btn, "done", T("dl.btnDone") + " · " + labels.join(" / "));
    } catch (e) {
      setDlState(btn, "err", dlErrorText(e && e.message));
    }
  }

  function makeDlButton(id) {
    const wrap = E("div", "sxa-dl-wrap");
    wrap.dataset.sxaTweet = id;
    const btn = E("button", "sxa-dl");
    btn.type = "button";
    btn.title = T("dl.btn");
    btn.setAttribute("aria-label", btn.title);
    btn.append(dlIcon());
    // 不让点击冒泡给 X,否则会打开推文详情
    C.stopEvents(wrap, ["mousedown", "mouseup", "pointerdown", "pointerup", "touchstart", "touchend"]);
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      runDownload(btn, id);
    });
    wrap.append(btn);
    return wrap;
  }

  // 本条推文自己的操作栏(跳过引用推文),取最后一个带回复按钮的 group
  function actionBarOf(article) {
    let bar = null;
    for (const g of article.querySelectorAll('[role="group"]')) {
      if (g.closest('article[data-testid="tweet"]') !== article) continue;
      if (!g.querySelector('[data-testid="reply"]')) continue;
      bar = g;
    }
    return bar;
  }

  const hasVideoDom = (article) => !!article.querySelector(VIDEO_SEL);

  function placeDownload(article, id) {
    const old = article.querySelector(".sxa-dl-wrap");
    const want = settings.showDownload && id && (mediaRecord(id) || hasVideoDom(article));
    if (!want) { if (old) old.remove(); return; }
    if (old && old.dataset.sxaTweet === id) return;
    if (old) old.remove();
    const bar = actionBarOf(article);
    if (bar) bar.append(makeDlButton(id));
  }

  // 弹窗粘贴链接后先问页面缓存
  if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((msg, sender, reply) => {
      if (!msg || msg.type !== "sxa-media" || sender.id !== chrome.runtime.id) return;
      reply(mediaRecord(String(msg.id || "")));
    });
  }

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
      const rel = u.followedBy && u.iFollow ? T("tag.mutual") : u.followedBy ? T("tag.followsYou") : u.iFollow ? T("tip.following") + " · " + T("tag.notFollowBack") : "";
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
