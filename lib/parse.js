// 纯函数模块:设置合并、GraphQL 解析、质量标签、推文流速、页面路径判断。
// 内容脚本、弹窗和单元测试共用。X 改版时字段解析集中在这里修改。
(function (root) {
  "use strict";

  const num = (v) => (typeof v === "number" ? v : Number(v) || 0);

  const DEFAULTS = {
    // ---- 标签外观 ----
    skin: "signal",         // 标签主题,见 SKINS
    // ---- 推文流速(独立开关) ----
    showVelocity: true,     // 显示单条推文流速(浏览/小时)
    // ---- 账号标签 ----
    tagsEnabled: true,      // 账号标签总开关(粉丝数、比值、质量标签)
    showFollowers: true,    // 显示粉丝数
    showRatio: false,       // 显示粉丝/关注比
    tierColors: true,       // 粉丝量分级配色
    hoverCard: true,        // 悬停详情卡
    layout: "auto",         // 推文头部标签位置:auto / inline / below
    maxTags: 3,             // 最多显示几个质量标签(0 = 不显示质量标签)
    velocityTrending: 1000, // 流速达到该值标为上升
    velocityViral: 10000,   // 流速达到该值标为爆款
    tags: {
      relation: true,       // 互关 / 关注了你
      bigV: true,
      farm: true,           // 疑似互粉号
      newAcct: true,
      oldAcct: true,
      engaged: true,        // 高互动
      lowActive: true,
    },
    // ---- 互关清理(独立功能) ----
    mutualEnabled: true,
    mutualDelayMs: 1500,    // 每次取关之间的基础间隔
    // ---- 其它 ----
    debug: false,
  };

  const LAYOUTS = ["auto", "inline", "below"];
  // 标签主题:key -> 显示名
  const SKINS = {
    signal: "信号灯",
    neon: "霓虹",
    candy: "糖果",
    minimal: "原生文字",
    terminal: "终端",
    aurora: "极光渐变",
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
    if (!Object.prototype.hasOwnProperty.call(SKINS, out.skin)) out.skin = DEFAULTS.skin;
    out.maxTags = clampInt(out.maxTags, 0, 7, DEFAULTS.maxTags);
    out.velocityTrending = clampInt(out.velocityTrending, 1, 1e9, DEFAULTS.velocityTrending);
    out.velocityViral = clampInt(out.velocityViral, 1, 1e9, DEFAULTS.velocityViral);
    if (out.velocityViral <= out.velocityTrending) {
      out.velocityViral = Math.max(out.velocityTrending + 1, DEFAULTS.velocityViral);
    }
    out.mutualDelayMs = clampInt(out.mutualDelayMs, 800, 10000, DEFAULTS.mutualDelayMs);
    return out;
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
      following: num(following),
      tweets: tc.tweets ?? legacy.statuses_count ?? null,
      createdAt: core.created_at || legacy.created_at || null,
      followedBy: rp.followed_by === true || legacy.followed_by === true, // 对方关注了我
      iFollow: rp.following === true || legacy.following === true,        // 我关注了对方
    };
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
    };
  }

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

// ---------- 推文流速 ----------
  function velocityOf(t, now) {
    if (!t || !t.views || !t.createdAt) return null;
    const created = new Date(t.createdAt).getTime();
    if (!Number.isFinite(created)) return null;
    const hours = Math.max((now - created) / 3600e3, 0.1);
    return t.views / hours;
  }

  // 0 普通 / 1 上升 / 2 爆款
  function velocityLevel(v, cfg) {
    const c = cfg || DEFAULTS;
    if (v >= c.velocityViral) return 2;
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

  const VELOCITY_ICONS = ["\u{1F331}", "\u{1F680}", "\u{1F525}"];

  function velocityTag(t, now, cfg) {
    const v = velocityOf(t, now);
    if (v === null) return null;
    const shown = Math.round(v);
    const level = velocityLevel(shown, cfg);
    return { key: "velocity", text: `${VELOCITY_ICONS[level]} ${fmt(shown)}/h`, cls: "v" + level, value: v, level };
  }

  // ---------- 账号质量 ----------
  const ratioOf = (u) => (u.following > 0 ? u.followers / u.following : u.followers);

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
      if (user.followedBy && user.iFollow) out.push({ key: "relation", text: "互关", cls: "rel" });
      else if (user.followedBy) out.push({ key: "relation", text: "关注了你", cls: "rel" });
    }
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

  // 1 万以内显示精确值,以上用"万"、"亿"
  function fmt(n) {
    if (n < 10000) return String(n);
    if (n < 1e8) return (n / 1e4).toFixed(n < 1e5 ? 2 : 1).replace(/\.?0+$/, "") + "万";
    return (n / 1e8).toFixed(2).replace(/\.?0+$/, "") + "亿";
  }

  function fmtRatio(r) {
    return r >= 100 ? String(Math.round(r)) : r >= 10 ? r.toFixed(0) : r.toFixed(1);
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
    DEFAULTS, SKINS, mergeSettings, extract, interactionsOf,
    velocityOf, velocityLevel, viralScore, velocityTag,
    tags, tier, fmt, fmtRatio, ratioOf, engagementOf,
    profilePathToHandle, followingPageHandle,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.SnowXParse = api;
})(typeof window !== "undefined" ? window : globalThis);
