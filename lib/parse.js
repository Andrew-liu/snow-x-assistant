// 纯函数模块:设置合并、GraphQL 解析、质量标签、推文流速、页面路径判断。
// 内容脚本、弹窗和单元测试共用。X 改版时字段解析集中在这里修改。
(function (root) {
  "use strict";

  const num = (v) => (typeof v === "number" ? v : Number(v) || 0);

  const DEFAULTS = {
    // ---- 标签外观 ----
    skin: "heatbar",        // 标签主题,见 SKINS
    // ---- 推文流速(独立开关) ----
    showVelocity: true,     // 显示单条推文流速(浏览/小时)
    // ---- 账号标签 ----
    tagsEnabled: true,      // 账号标签总开关(粉丝数、比值、质量标签)
    showFollowers: true,    // 显示粉丝数
    showRatio: true,        // 显示关注/粉丝比
    tierColors: true,       // 粉丝量分级配色
    hoverCard: true,        // 悬停详情卡
    layout: "auto",         // 推文头部标签位置:auto / inline / below
    maxTags: 7,             // 最多显示几个质量标签(0 = 不显示,7 = 全部)
    velocityTrending: 1000, // 流速达到该值进入 🚀 第一档(升温)
    velocityHot: 5000,      // 流速达到该值进入 🚀 第二档(热门)
    velocityViral: 10000,   // 流速达到该值进入 🚀 第三档(爆款)
    // ---- AI 文本检测(独立开关) ----
    showAiText: false,      // 推文正文按中英文 AI 腔规则本地打分,在标签行显示 AI 概率
    tags: {
      relation: true,       // 互关 / 关注了你
      notFollowBack: true,  // 我关注了对方,对方未关注我
      bigV: true,
      farm: false,          // 疑似互粉号
      newAcct: false,
      oldAcct: false,
      engaged: true,        // 高互动
      lowActive: true,
    },
    // ---- 视频下载(独立开关) ----
    showDownload: true,     // 在带视频的推文操作栏加下载按钮
    // ---- 互关清理(独立功能) ----
    mutualEnabled: true,
    mutualDelayMs: 1500,    // 每次取关之间的基础间隔
    // ---- 通用 ----
    theme: "auto",          // 深浅色:auto(弹窗跟随系统,页面跟随 X)/ light / dark
    lang: "auto",           // 界面语言:auto(跟随 X 界面语言)/ zh / en
    // ---- 其它 ----
    debug: false,
  };

  const LAYOUTS = ["auto", "inline", "below"];
  const THEMES = ["auto", "light", "dark"];
  const LANG_PREFS = ["auto", "zh", "en"];
  // 标签主题:key -> 显示名
  const SKINS = {
    signal: "信号灯",
    shield: "徽章",
    sticker: "贴纸",
    terminal: "终端",
    heatbar: "热度条",
    neon: "霓虹",
    minimal: "原生文字",
    aurora: "极光",
  };

  function clampInt(v, min, max, fallback) {
    const n = Math.round(Number(v));
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  }

  // 只接受与默认值同类型的字段,丢弃未知字段和异常值
  function mergeSettings(saved) {
    const s = saved && typeof saved === "object" ? saved : {};
    const out = {};
    for (const k of Object.keys(DEFAULTS)) {
      if (k === "tags") continue;
      out[k] = s[k] !== undefined && typeof s[k] === typeof DEFAULTS[k] ? s[k] : DEFAULTS[k];
    }
    out.tags = Object.assign({}, DEFAULTS.tags);
    if (s.tags && typeof s.tags === "object") {
      for (const k of Object.keys(DEFAULTS.tags)) {
        if (typeof s.tags[k] === "boolean") out.tags[k] = s.tags[k];
      }
    }
    if (!LAYOUTS.includes(out.layout)) out.layout = DEFAULTS.layout;
    if (!THEMES.includes(out.theme)) out.theme = DEFAULTS.theme;
    if (!LANG_PREFS.includes(out.lang)) out.lang = DEFAULTS.lang;
    if (!Object.prototype.hasOwnProperty.call(SKINS, out.skin)) out.skin = DEFAULTS.skin;
    out.maxTags = clampInt(out.maxTags, 0, 7, DEFAULTS.maxTags);
    out.velocityTrending = clampInt(out.velocityTrending, 1, 1e9, DEFAULTS.velocityTrending);
    out.velocityHot = clampInt(out.velocityHot, 1, 1e9, DEFAULTS.velocityHot);
    out.velocityViral = clampInt(out.velocityViral, 1, 1e9, DEFAULTS.velocityViral);
    // 三档阈值需严格递增。存储里顺序乱了时只把冲突的高档往上抬,保留用户填的其它值
    if (out.velocityHot <= out.velocityTrending) out.velocityHot = out.velocityTrending + 1;
    if (out.velocityViral <= out.velocityHot) out.velocityViral = out.velocityHot + 1;
    out.mutualDelayMs = clampInt(out.mutualDelayMs, 800, 10000, DEFAULTS.mutualDelayMs);
    return out;
  }

  // 弹窗校验用:返回不合法的字段名列表,空数组表示三档可以保存
  function thresholdErrors(t, h, v) {
    const bad = [];
    const ok = (n) => Number.isInteger(n) && n >= 1 && n <= 1e9;
    if (!ok(t)) bad.push("velocityTrending");
    if (!ok(h) || (ok(t) && h <= t)) bad.push("velocityHot");
    if (!ok(v) || (ok(h) && v <= h)) bad.push("velocityViral");
    return bad;
  }

  // ---------- GraphQL 解析 ----------
  function readUser(u) {
    const legacy = u.legacy || {};
    const core = u.core || {};
    const handle = core.screen_name || legacy.screen_name;
    if (!handle) return null;
    const rc = u.relationship_counts || {};
    const followers = rc.followers ?? legacy.followers_count ?? u.followers_count;
    const following = rc.following ?? legacy.friends_count ?? u.friends_count;
    if (followers === undefined) return null;
    const rp = u.relationship_perspectives || {};
    const tc = u.tweet_counts || {};
    return {
      handle: String(handle).toLowerCase(),
      name: core.name || legacy.name || "",
      followers: num(followers),
      following: following == null ? null : num(following),
      tweets: tc.tweets ?? legacy.statuses_count ?? null,
      createdAt: core.created_at || legacy.created_at || null,
      followedBy: rp.followed_by === true || legacy.followed_by === true, // 对方关注了我
      iFollow: rp.following === true || legacy.following === true,        // 我关注了对方
    };
  }

  const TEXT_MAX = 4000;
  // 正文:长推在 note_tweet 里,普通推在 legacy.full_text;只留前 4000 字符给 AI 检测用
  function textOf(t, legacy) {
    const note = t.note_tweet && t.note_tweet.note_tweet_results && t.note_tweet.note_tweet_results.result;
    const s = (note && note.text) || legacy.full_text || "";
    return typeof s === "string" && s ? s.slice(0, TEXT_MAX) : null;
  }

  function readTweet(t, author) {
    const legacy = t.legacy || {};
    const id = t.rest_id || legacy.id_str;
    if (!id || legacy.favorite_count === undefined) return null;
    const hasViews = !!(t.views && t.views.count !== undefined);
    return {
      id: String(id),
      author,
      views: hasViews ? num(t.views.count) : 0,
      likes: num(legacy.favorite_count),
      retweets: num(legacy.retweet_count),
      replies: num(legacy.reply_count),
      quotes: num(legacy.quote_count),
      bookmarks: num(legacy.bookmark_count),
      createdAt: legacy.created_at || null,
      text: textOf(t, legacy),
      videos: videosFromMedia(legacy.extended_entities && legacy.extended_entities.media),
      quotedId: quotedIdOf(t, legacy),
    };
  }

  function quotedIdOf(t, legacy) {
    if (legacy.quoted_status_id_str) return String(legacy.quoted_status_id_str);
    let q = t.quoted_status_result && t.quoted_status_result.result;
    if (q && q.tweet) q = q.tweet;
    return q && q.rest_id ? String(q.rest_id) : null;
  }

  // ---------- 视频 ----------
  // 只接受 video.twimg.com 上的 https 直链,下载和展示前都要过这一关
  function isVideoUrl(url) {
    try {
      const u = new URL(String(url));
      return u.protocol === "https:" && u.hostname === "video.twimg.com";
    } catch (_) { return false; }
  }

  // 直链路径里带分辨率,例如 /vid/avc1/1280x720/xxx.mp4
  function sizeFromUrl(url) {
    const m = String(url).match(/\/(\d{2,5})x(\d{2,5})\//);
    return m ? { width: Number(m[1]), height: Number(m[2]) } : { width: 0, height: 0 };
  }

  // 只留 mp4(m3u8 是播放列表,存下来没法直接播),按码率从高到低,去重
  function mp4Variants(list) {
    const out = [];
    const seen = new Set();
    for (const v of Array.isArray(list) ? list : []) {
      if (!v || v.content_type !== "video/mp4") continue;
      const url = v.url || v.src;
      if (!isVideoUrl(url) || seen.has(url)) continue;
      seen.add(url);
      out.push(Object.assign({ url, bitrate: num(v.bitrate) }, sizeFromUrl(url)));
    }
    return out.sort((a, b) => b.bitrate - a.bitrate || b.height * b.width - a.height * a.width);
  }

  // GraphQL 的 extended_entities.media 和嵌入接口的 mediaDetails 结构相同
  function videosFromMedia(media) {
    const out = [];
    for (const m of Array.isArray(media) ? media : []) {
      if (!m || (m.type !== "video" && m.type !== "animated_gif")) continue;
      const vi = m.video_info || {};
      const variants = mp4Variants(vi.variants);
      if (!variants.length) continue;
      out.push({
        kind: m.type === "animated_gif" ? "gif" : "video",
        thumb: typeof m.media_url_https === "string" ? m.media_url_https : "",
        durationMs: num(vi.duration_millis) || null,
        variants,
      });
    }
    return out;
  }

  // 从粘贴的内容里取推文 ID:支持 x.com / twitter.com / 带参数的分享链接,或直接粘贴数字 ID
  function tweetIdFromInput(s) {
    const str = String(s || "").trim();
    if (/^\d{5,25}$/.test(str)) return str;
    const m = str.match(/\/status(?:es)?\/(\d{5,25})(?!\d)/);
    return m ? m[1] : null;
  }

  // X 官方嵌入组件请求 tweet-result 时附带的 token,由推文 ID 算出
  function syndicationToken(id) {
    return ((Number(id) / 1e15) * Math.PI).toString(36).replace(/(0+|\.)/g, "");
  }

  function syndicationUrl(id) {
    return `https://cdn.syndication.twimg.com/tweet-result?id=${encodeURIComponent(id)}&lang=en&token=${syndicationToken(id)}`;
  }

  // 嵌入接口的返回统一成 { id, author, text, videos, quoted };推文不可见时返回 null
  function fromSyndication(json, depth = 0) {
    if (!json || typeof json !== "object" || json.__typename === "TweetTombstone") return null;
    const id = json.id_str ? String(json.id_str) : "";
    if (!id) return null;
    const user = json.user || {};
    return {
      id,
      author: user.screen_name ? String(user.screen_name).toLowerCase() : "",
      text: typeof json.text === "string" ? json.text.slice(0, 280) : "",
      videos: videosFromMedia(json.mediaDetails),
      quoted: depth < 1 && json.quoted_tweet ? fromSyndication(json.quoted_tweet, depth + 1) : null,
    };
  }

  // 本条没有视频时退到引用推文
  function pickMedia(rec) {
    if (!rec) return null;
    if (rec.videos && rec.videos.length) return rec;
    if (rec.quoted && rec.quoted.videos && rec.quoted.videos.length) return rec.quoted;
    return null;
  }

  function qualityLabel(v, kind) {
    if (kind === "gif") return "GIF";
    const p = Math.min(v.width || 0, v.height || 0);
    if (p) return p + "p";
    return v.bitrate ? Math.round(v.bitrate / 1000) + "kbps" : "mp4";
  }

  function fmtBitrate(bps) {
    if (!bps) return "";
    return bps >= 1e6 ? (bps / 1e6).toFixed(1) + " Mbps" : Math.round(bps / 1000) + " kbps";
  }

  function fmtDuration(ms) {
    if (!ms) return "";
    const s = Math.round(ms / 1000);
    return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
  }

  const DL_DIR = "SnowX";

  // 文件名只留字母数字下划线横线点,统一放进下载目录下的 SnowX 文件夹
  function safeFileName(name) {
    const base = String(name || "").split("/").pop().replace(/[^\w.-]+/g, "_").replace(/^[._]+/, "").slice(0, 120);
    return DL_DIR + "/" + (/\.mp4$/i.test(base) ? base : (base || "video") + ".mp4");
  }

  function videoFileName(author, id, index, total, variant, kind) {
    const parts = [author || "x", id];
    if (total > 1) parts.push(String(index + 1));
    parts.push(qualityLabel(variant, kind));
    return safeFileName(parts.join("_") + ".mp4");
  }

  // 下载相关错误码 -> 文案 key
  const DL_ERRORS = { bad_id: "dl.err.badUrl", not_found: "dl.err.notFound", no_video: "dl.err.noVideo", timeout: "dl.err.timeout", bad_url: "dl.err.badUrl" };
  function dlErrorKey(code) { return DL_ERRORS[code] || "dl.err.net"; }

  // 返回 { users: [...], tweets: [...] }
  function extract(json) {
    const users = [];
    const tweets = [];
    const seen = new WeakSet();

    (function walk(node) {
      if (!node || typeof node !== "object" || seen.has(node)) return;
      seen.add(node);
      if (Array.isArray(node)) { node.forEach(walk); return; }

      if (node.__typename === "User") {
        const u = readUser(node);
        if (u) users.push(u);
      } else if (node.__typename === "Tweet" && node.core && node.core.user_results) {
        const au = node.core.user_results.result;
        const author = au && readUser(au);
        if (author) {
          const t = readTweet(node, author.handle);
          if (t) tweets.push(t);
        }
      }
      for (const k in node) walk(node[k]);
    })(json);

    return { users, tweets };
  }

  const interactionsOf = (t) => t.likes + t.retweets + t.replies + t.quotes;

  // ---------- 内存表 ----------
  // 有上限的 Map,按最近使用淘汰:get / set 都会把条目挪到最新,peek 只读不挪。
  class LruMap {
    constructor(max) { this.max = max; this.map = new Map(); }
    get size() { return this.map.size; }
    has(k) { return this.map.has(k); }
    peek(k) { return this.map.get(k); }
    get(k) {
      if (!this.map.has(k)) return undefined;
      const v = this.map.get(k);
      this.map.delete(k);
      this.map.set(k, v);
      return v;
    }
    set(k, v) {
      this.map.delete(k);
      this.map.set(k, v);
      while (this.map.size > this.max) this.map.delete(this.map.keys().next().value);
      return this;
    }
    delete(k) { return this.map.delete(k); }
    keys() { return this.map.keys(); }
  }

  // 作者互动统计:每条推文只算一份(同一条再次出现时用更新后的数字替换),
  // 每个作者只保留最近 perAuthor 条,作者按最近使用淘汰,淘汰时连同统计一起删,不会重复计数。
  function createAuthorStats(maxAuthors = 3000, perAuthor = 200) {
    const authors = new LruMap(maxAuthors);
    return {
      get size() { return authors.size; },
      add(t) {
        if (!t || !t.author || !t.id) return;
        let a = authors.get(t.author);
        if (!a) { a = { views: 0, interactions: 0, ids: new Map() }; authors.set(t.author, a); }
        const views = t.views || 0;
        const inter = interactionsOf(t) || 0;
        const old = a.ids.get(t.id);
        if (old) {
          if (views < old.views) return;
          a.views -= old.views;
          a.interactions -= old.interactions;
          a.ids.delete(t.id);
        }
        a.ids.set(t.id, { views, interactions: inter });
        a.views += views;
        a.interactions += inter;
        while (a.ids.size > perAuthor) {
          const [k, c] = a.ids.entries().next().value;
          a.ids.delete(k);
          a.views -= c.views;
          a.interactions -= c.interactions;
        }
      },
      get(author) { return author ? authors.get(author) || null : null; },
    };
  }

// ---------- 推文流速 ----------
  function velocityOf(t, now) {
    if (!t || !t.views || !t.createdAt) return null;
    const created = new Date(t.createdAt).getTime();
    if (!Number.isFinite(created)) return null;
    const hours = Math.max((now - created) / 3600e3, 0.1);
    return t.views / hours;
  }

  // 0 普通(无图标) / 1 升温 / 2 热门 / 3 爆款,后三档带 🚀
  function velocityLevel(v, cfg) {
    const c = cfg || DEFAULTS;
    if (v >= c.velocityViral) return 3;
    if (v >= (c.velocityHot ?? DEFAULTS.velocityHot)) return 2;
    if (v >= c.velocityTrending) return 1;
    return 0;
  }

  // 0-100 综合分:流速 40%、互动率 25%、转赞比 20%、藏赞比 15%
  function viralScore(t, now) {
    const v = velocityOf(t, now);
    if (v === null) return null;
    const vs = Math.min(v / 50000, 1) * 40;
    const er = t.views > 0 ? (t.likes + t.retweets + t.replies) / t.views : 0;
    const es = Math.min(er / 0.1, 1) * 25;
    const rt = t.likes > 0 ? t.retweets / t.likes : 0;
    const rs = Math.min(rt / 0.5, 1) * 20;
    const bm = t.likes > 0 ? t.bookmarks / t.likes : 0;
    const bs = Math.min(bm / 0.3, 1) * 15;
    return Math.min(100, Math.round(vs + es + rs + bs));
  }

  const ROCKET = "\u{1F680}";
  const LEVEL_NAMES = ["普通", "升温", "热门", "爆款"];

  function velocityTag(t, now, cfg) {
    const v = velocityOf(t, now);
    if (v === null) return null;
    const shown = Math.round(v);
    const level = velocityLevel(shown, cfg);
    const text = (level > 0 ? ROCKET + " " : "") + `${fmtVel(shown)}/h`;
    return { key: "velocity", text, cls: "v" + level, value: v, level };
  }

  // ---------- 账号质量 ----------
  const ratioOf = (u) => (u.following > 0 ? u.followers / u.following : u.followers);

  // 关注数 / 粉丝数,不代表实际互关人数占比。
  function followingRatioOf(u) {
    if (!Number.isFinite(u.followers) || !Number.isFinite(u.following) || u.followers < 0 || u.following < 0) return null;
    if (u.followers === 0) return u.following > 0 ? Infinity : null;
    return u.following / u.followers;
  }

  function fmtFollowingRatio(r) {
    if (r === null || Number.isNaN(r) || r < 0) return "—";
    if (r === Infinity) return "∞";
    const percent = r * 100;
    if (percent > 0 && percent < 0.01) return "<0.01%";
    return percent.toFixed(2).replace(/\.?0+$/, "") + "%";
  }

  function engagementOf(stat) {
    if (!stat || stat.views < 2000) return null;
    return stat.interactions / stat.views;
  }

// 质量标签。阈值是经验值,按展示优先级排序。
  function tags(user, stat, now, cfg) {
    const on = (cfg && cfg.tags) || DEFAULTS.tags;
    const out = [];
    const { followers, following } = user;
    const ratio = ratioOf(user);

    if (on.relation) {
      if (user.followedBy && user.iFollow) out.push({ key: "relation", tid: "mutual", text: "互关", cls: "rel" });
      else if (user.followedBy) out.push({ key: "relation", tid: "followsYou", text: "关注了你", cls: "rel" });
    }
    // 只标「我关注了对方但对方没关注我」。关系字段来自 X 已返回的数据;
    // 没关注的陌生人不标,否则几乎每条推文都会带上这个标签
    if (on.notFollowBack && user.iFollow && !user.followedBy)
      out.push({ key: "notFollowBack", text: "未回关", cls: "warn" });
    if (on.bigV && followers >= 10000 && ratio >= 10) out.push({ key: "bigV", text: "大V", cls: "hi" });
    if (on.farm && following >= 1000 && ratio > 0.8 && ratio < 1.25 && followers < 5000)
      out.push({ key: "farm", text: "疑似互粉号", cls: "warn" });

    const days = user.createdAt ? (now - new Date(user.createdAt).getTime()) / 86400000 : null;
    if (on.newAcct && days !== null && days >= 0 && days < 90) out.push({ key: "newAcct", text: "新号", cls: "warn" });

    const er = engagementOf(stat);
    if (er !== null) {
      if (on.engaged && er >= 0.03) out.push({ key: "engaged", text: "高互动", cls: "hi" });
      else if (on.lowActive && er < 0.001 && followers >= 5000)
        out.push({ key: "lowActive", text: "低活跃", cls: "warn" });
    }
    if (on.oldAcct && days !== null && days > 365 * 8) out.push({ key: "oldAcct", text: "老号", cls: "" });
    return out;
  }

  // 粉丝量分级 0..4,用于配色
  function tier(followers) {
    if (followers >= 1e6) return 4;
    if (followers >= 1e5) return 3;
    if (followers >= 1e4) return 2;
    if (followers >= 1e3) return 1;
    return 0;
  }

  // 1 万以内显示精确值,以上中文用"万"、"亿",英文用 K / M / B
  function fmt(n, lang) {
    if (n < 10000) return String(n);
    const cut = (v, d) => v.toFixed(d).replace(/\.?0+$/, "");
    if (lang === "en") {
      if (n < 1e6) return cut(n / 1e3, n < 1e5 ? 1 : 0) + "K";
      if (n < 1e9) return cut(n / 1e6, n < 1e7 ? 2 : 1) + "M";
      return cut(n / 1e9, 2) + "B";
    }
    if (n < 1e8) return cut(n / 1e4, n < 1e5 ? 2 : 1) + "万";
    return cut(n / 1e8, 2) + "亿";
  }

  function fmtRatio(r) {
    return r >= 100 ? String(Math.round(r)) : r >= 10 ? r.toFixed(0) : r.toFixed(1);
  }

  // 流速:1000 以下精确值,1k-9.9k 用 k(向下取整,避免 4999 显示成 5k 看起来像跨档),1 万起中文沿用万/亿,英文继续用 k
  function fmtVel(n, lang) {
    if (n < 1000) return String(n);
    if (n < 10000) return String(Math.floor(n / 100) / 10) + "k";
    if (lang === "en" && n < 1e6) return String(Math.floor(n / 1000)) + "k";
    return fmt(n, lang);
  }

  // ---------- 取关小时配额 ----------
  const HOURLY_UNFOLLOW_LIMIT = 50;
  const HOUR_MS = 3600e3;

  // log: 成功取关的时间戳数组。返回 { recent, used, left, resetInMs }
  // resetInMs = 再过多久至少空出 1 个名额(未用满时为 0)
  function unfollowQuota(log, now, limit = HOURLY_UNFOLLOW_LIMIT) {
    const recent = (Array.isArray(log) ? log : [])
      .filter((t) => Number.isFinite(t) && t <= now && now - t < HOUR_MS)
      .sort((a, b) => a - b);
    const used = recent.length;
    const left = Math.max(0, limit - used);
    const resetInMs = left > 0 ? 0 : recent[used - limit] + HOUR_MS - now;
    return { recent, used, left, resetInMs };
  }

// ---------- 页面路径(互关清理用) ----------
  const RESERVED = new Set(["home", "explore", "notifications", "messages", "compose", "search", "settings", "i", "jobs", "lists", "communities"]);

  function profilePathToHandle(pathname) {
    const m = String(pathname || "").match(/^\/@?([A-Za-z0-9_]{1,15})(?:\/|$)/);
    if (!m) return null;
    const h = m[1].toLowerCase();
    return RESERVED.has(h) ? null : h;
  }

  // 只认 /<handle>/following,不含 /followers、/verified_followers
  function followingPageHandle(pathname) {
    const m = String(pathname || "").match(/^\/([A-Za-z0-9_]{1,15})\/following\/?$/);
    if (!m) return null;
    const h = m[1].toLowerCase();
    return RESERVED.has(h) ? null : h;
  }

  const api = {
    DEFAULTS, SKINS, THEMES, LANG_PREFS, mergeSettings, thresholdErrors, extract, interactionsOf,
    velocityOf, velocityLevel, viralScore, velocityTag, ROCKET, LEVEL_NAMES,
    tags, tier, fmt, fmtVel, fmtRatio, ratioOf, followingRatioOf, fmtFollowingRatio, engagementOf,
    profilePathToHandle, followingPageHandle, HOURLY_UNFOLLOW_LIMIT, unfollowQuota,
    LruMap, createAuthorStats,
    isVideoUrl, mp4Variants, videosFromMedia, tweetIdFromInput, syndicationToken, syndicationUrl, fromSyndication,
    pickMedia, qualityLabel, fmtBitrate, fmtDuration, safeFileName, videoFileName, dlErrorKey,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.SnowXParse = api;
})(typeof window !== "undefined" ? window : globalThis);
