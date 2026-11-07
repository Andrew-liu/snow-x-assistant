const test = require("node:test");
const assert = require("node:assert/strict");
const P = require("../lib/parse.js");

const HOUR = 3600e3;
const NOW = Date.parse("2026-10-10T12:00:00Z");

function user(handle, extra = {}) {
  return {
    __typename: "User",
    core: { screen_name: handle, name: handle.toUpperCase(), created_at: "Mon Jan 01 00:00:00 +0000 2015" },
    legacy: { followers_count: 12000, friends_count: 300, statuses_count: 5000 },
    relationship_perspectives: { followed_by: true, following: true },
    ...extra,
  };
}

function tweet(id, author, views, createdAt) {
  return {
    __typename: "Tweet",
    rest_id: id,
    core: { user_results: { result: author } },
    views: { count: String(views), state: "EnabledWithCount" },
    legacy: { favorite_count: 100, retweet_count: 20, reply_count: 10, quote_count: 5, bookmark_count: 30, created_at: createdAt },
  };
}

test("extract 从嵌套 GraphQL 里取出用户和推文", () => {
  const a = user("Alice");
  const json = { data: { home: { instructions: [{ entries: [
    { content: { itemContent: { tweet_results: { result: { __typename: "TweetWithVisibilityResults", tweet: tweet("111", a, 50000, new Date(NOW - 5 * HOUR).toUTCString()) } } } } },
  ] }] } } };
  const { users, tweets } = P.extract(json);
  assert.equal(users[0].handle, "alice");
  assert.equal(users[0].followers, 12000);
  assert.equal(users[0].followedBy, true);
  assert.equal(tweets.length, 1);
  assert.equal(tweets[0].id, "111");
  assert.equal(tweets[0].author, "alice");
  assert.equal(tweets[0].views, 50000);
  assert.equal(tweets[0].bookmarks, 30);
});

test("流速:2h 内用平均速度,超过 2h 按 8h 半衰期衰减模型算此刻瞬时流速,有前次观测用实际差分", () => {
  const cfg = P.mergeSettings();
  // 2 小时内:20000 浏览 / 2h = 10000/h
  const fresh = { views: 20000, likes: 100, retweets: 20, replies: 10, quotes: 0, bookmarks: 30, createdAt: new Date(NOW - 2 * HOUR).toISOString() };
  assert.equal(Math.round(P.velocityOf(fresh, NOW)), 10000);
  // 5 小时老帖:50000 浏览按 8h 半衰期衰减,此刻瞬时流速低于全程平均 10000(约 7990/h)
  const aging = { views: 50000, likes: 100, retweets: 20, replies: 10, quotes: 0, bookmarks: 30, createdAt: new Date(NOW - 5 * HOUR).toISOString() };
  assert.equal(Math.round(P.velocityOf(aging, NOW)), 7990);
  // 有间隔 >= 2 分钟的前次观测时,用两次观测的实际增量差分:(53000 - 50000) / 0.5h = 6000/h
  const withObs = { ...aging, views: 53000, prevObs: { views: 50000, at: NOW - 0.5 * HOUR } };
  assert.equal(Math.round(P.velocityOf(withObs, NOW)), 6000);
  assert.equal(P.velocityLevel(999, cfg), 0);
  assert.equal(P.velocityLevel(1000, cfg), 1);
  assert.equal(P.velocityLevel(4999, cfg), 1);
  assert.equal(P.velocityLevel(5000, cfg), 2);
  assert.equal(P.velocityLevel(9999, cfg), 2);
  assert.equal(P.velocityLevel(10000, cfg), 3);
  const tag = P.velocityTag(fresh, NOW, cfg);
  assert.equal(tag.cls, "v3");
  assert.equal(tag.text, "\u{1F680} 1万/h");
  const calm = P.velocityTag({ views: 500, createdAt: new Date(NOW - HOUR).toISOString() }, NOW, cfg);
  assert.equal(calm.level, 0);
  assert.ok(!calm.text.includes("\u{1F680}"));
});

test("刚发的推文按至少 0.1 小时算,无浏览量不出流速", () => {
  assert.equal(P.velocityOf({ views: 100, createdAt: new Date(NOW).toISOString() }, NOW), 1000);
  assert.equal(P.velocityOf({ views: 0, createdAt: new Date(NOW).toISOString() }, NOW), null);
  assert.equal(P.velocityOf({ views: 10, createdAt: "bad" }, NOW), null);
});

test("爆款分与 X 推荐指标:加权互动率(回复/引用权重高于点赞)、预计 24h 浏览与破圈系数", () => {
  const t = { views: 1e6, likes: 1e5, retweets: 1e5, replies: 1e5, quotes: 0, bookmarks: 1e5, createdAt: new Date(NOW - HOUR).toISOString() };
  assert.equal(P.viralScore(t, NOW), 100);
  assert.equal(P.viralScore(t, NOW, 5000), 100);
  // 同样 100 次互动,100 条回复(权重 5)比 100 个赞(权重 0.66)的加权互动率和爆款分高得多
  const base = { views: 10000, likes: 0, retweets: 0, replies: 0, quotes: 0, bookmarks: 0, createdAt: new Date(NOW - 2 * HOUR).toISOString() };
  const onlyLikes = { ...base, likes: 100 };
  const onlyReplies = { ...base, replies: 100 };
  assert.ok(P.weightedEngagementOf(onlyReplies) > P.weightedEngagementOf(onlyLikes) * 7);
  assert.ok(P.viralScore(onlyReplies, NOW, 2000) > P.viralScore(onlyLikes, NOW, 2000));
  // 破圈系数:同样浏览与互动,小号(1000 粉)比大号(50 万粉)破圈分更高
  assert.ok(P.viralScore(onlyReplies, NOW, 1000) > P.viralScore(onlyReplies, NOW, 500000));
  // 预计 24h 浏览:2 小时的新帖高于当前浏览,满 24 小时等于当前浏览
  assert.ok(P.projectedViews24h(base, NOW) > base.views);
  assert.equal(P.projectedViews24h({ ...base, createdAt: new Date(NOW - 30 * HOUR).toISOString() }, NOW), base.views);
});

test("质量标签:互关、大V、疑似互粉号", () => {
  const big = { followers: 20000, following: 100, followedBy: true, iFollow: true, createdAt: null };
  assert.deepEqual(P.tags(big, null, NOW).map((t) => t.key), ["relation", "bigV"]);
  const farm = { followers: 1500, following: 1400, followedBy: false, iFollow: false, createdAt: null };
  assert.deepEqual(P.tags(farm, null, NOW).map((t) => t.key), []); // 疑似互粉号默认关闭
  const on = { tags: Object.assign({}, P.DEFAULTS.tags, { farm: true }) };
  assert.deepEqual(P.tags(farm, null, NOW, on).map((t) => t.key), ["farm"]);
});

test("默认设置:热度条、AI 检测关、关粉比开、标签显示全部、互粉号/新号/老号关", () => {
  const d = P.mergeSettings();
  assert.equal(d.skin, "heatbar");
  assert.equal(d.showAiText, false);
  assert.equal(d.showRatio, true);
  assert.equal(d.maxTags, 7);
  assert.deepEqual([d.tags.farm, d.tags.newAcct, d.tags.oldAcct], [false, false, false]);
  // 用户已保存的选择不受默认值改动影响
  const kept = P.mergeSettings({ skin: "signal", showAiText: true, maxTags: 3, tags: { oldAcct: true } });
  assert.deepEqual([kept.skin, kept.showAiText, kept.maxTags, kept.tags.oldAcct], ["signal", true, 3, true]);
});

test("mergeSettings 校正非法值并保留标签开关", () => {
  const s = P.mergeSettings({ layout: "x", maxTags: 99, velocityTrending: 5000, velocityViral: 100, mutualDelayMs: 10, tags: { bigV: false, junk: 1 }, showVelocity: "yes" });
  assert.equal(s.layout, "auto");
  assert.equal(s.maxTags, 7);
  assert.ok(s.velocityTrending < s.velocityHot && s.velocityHot < s.velocityViral);
  // 乱序时只抬高冲突的高档,保留用户填的升温值
  assert.deepEqual([s.velocityTrending, s.velocityHot, s.velocityViral], [5000, 5001, 5002]);
  const keep = P.mergeSettings({ velocityTrending: 6000, velocityHot: 5000, velocityViral: 20000 });
  assert.deepEqual([keep.velocityTrending, keep.velocityHot, keep.velocityViral], [6000, 6001, 20000]);
  const ok = P.mergeSettings({ velocityTrending: 2000, velocityHot: 6000, velocityViral: 20000 });
  assert.deepEqual([ok.velocityTrending, ok.velocityHot, ok.velocityViral], [2000, 6000, 20000]);
  assert.equal(s.mutualDelayMs, 800);
  assert.equal(s.tags.bigV, false);
  assert.equal(s.tags.junk, undefined);
  assert.equal(s.showVelocity, true);
  assert.equal(s.mutualEnabled, true);
});

test("mergeSettings 主题与流速独立开关", () => {
  assert.equal(P.mergeSettings().skin, "heatbar");
  assert.equal(P.mergeSettings({ skin: "shield" }).skin, "shield");
  assert.equal(P.mergeSettings({ skin: "candy" }).skin, "heatbar");
  assert.equal(P.mergeSettings({ skin: "__proto__" }).skin, "heatbar");
  assert.equal(P.mergeSettings({ skin: 3 }).skin, "heatbar");
  const s = P.mergeSettings({ tagsEnabled: false, showVelocity: true });
  assert.equal(s.tagsEnabled, false);
  assert.equal(s.showVelocity, true);
});

test("following 页路径识别", () => {
  assert.equal(P.followingPageHandle("/Snow_123/following"), "snow_123");
  assert.equal(P.followingPageHandle("/snow/followers"), null);
  assert.equal(P.followingPageHandle("/snow/verified_followers"), null);
  assert.equal(P.followingPageHandle("/i/following"), null);
  assert.equal(P.profilePathToHandle("/Snow"), "snow");
  assert.equal(P.profilePathToHandle("/home"), null);
});

test("关/粉比使用关注数除以粉丝数,质量标签继续使用原口径", () => {
  const u = { followers: 20000, following: 100 };
  assert.equal(P.followingRatioOf(u), 0.005);
  assert.equal(P.fmtFollowingRatio(P.followingRatioOf(u)), "0.5%");
  assert.equal(P.ratioOf(u), 200);
  assert.equal(P.fmtFollowingRatio(P.followingRatioOf({ followers: 100, following: 250 })), "250%");
  assert.equal(P.fmtFollowingRatio(P.followingRatioOf({ followers: 100, following: 0 })), "0%");
  assert.equal(P.fmtFollowingRatio(P.followingRatioOf({ followers: 0, following: 1 })), "∞");
  assert.equal(P.fmtFollowingRatio(P.followingRatioOf({ followers: 0, following: 0 })), "—");
  for (const following of [null, undefined, -1, NaN, Infinity]) {
    assert.equal(P.followingRatioOf({ followers: 100, following }), null);
  }
  assert.equal(P.fmtFollowingRatio(0.000001), "<0.01%");
  const missing = P.extract(user("Missing", { legacy: { followers_count: 100 } })).users[0];
  assert.equal(missing.following, null);
  assert.equal(P.followingRatioOf(missing), null);
});

test("fmt 用万/亿", () => {
  assert.equal(P.fmt(9999), "9999");
  assert.equal(P.fmt(12345), "1.23万");
  assert.equal(P.fmt(250000000), "2.5亿");
});

test("thresholdErrors 只标出不合法的那一项", () => {
  assert.deepEqual(P.thresholdErrors(1000, 5000, 10000), []);
  assert.deepEqual(P.thresholdErrors(6000, 5000, 10000), ["velocityHot"]);
  assert.deepEqual(P.thresholdErrors(1000, 5000, 5000), ["velocityViral"]);
  assert.deepEqual(P.thresholdErrors(0, 5000, 10000), ["velocityTrending"]);
  assert.deepEqual(P.thresholdErrors(1000, NaN, 10000), ["velocityHot"]);
  assert.deepEqual(P.thresholdErrors(1.5, 5000, 10000), ["velocityTrending"]);
});

test("fmtVel 四档默认显示为 500 / 1k / 5k / 1万", () => {
  assert.deepEqual([500, 1000, 5000, 10000].map(P.fmtVel), ["500", "1k", "5k", "1万"]);
  assert.equal(P.fmtVel(2350), "2.3k");
  assert.equal(P.fmtVel(4999), "4.9k");
  assert.equal(P.fmtVel(9999), "9.9k");
  assert.equal(P.fmtVel(123456), "12.3万");
});

test("取关小时额度:满 50 人暂停,最早一条过期后恢复 1 个名额", () => {
  const log = Array.from({ length: 50 }, (_, i) => NOW - 50 * 60e3 + i * 60e3); // 50 分钟前起每分钟 1 个
  const q = P.unfollowQuota(log, NOW);
  assert.equal(q.used, 50);
  assert.equal(q.left, 0);
  assert.equal(q.resetInMs, 10 * 60e3);
  assert.equal(P.unfollowQuota(log, NOW + 10 * 60e3).left, 1);
  const mixed = P.unfollowQuota([NOW - 2 * HOUR, NOW - 1000, "x", NOW + 5000], NOW);
  assert.equal(mixed.used, 1);
  assert.equal(mixed.left, 49);
  assert.equal(mixed.resetInMs, 0);
  assert.equal(P.unfollowQuota(null, NOW).left, 50);
});

test("LruMap:超出上限淘汰最久未用的,get 会刷新顺序,peek 不会", () => {
  const m = new P.LruMap(3);
  m.set("a", 1).set("b", 2).set("c", 3);
  m.get("a");          // a 变成最新
  m.peek("b");         // 只读,不改变顺序
  m.set("d", 4);       // 淘汰最久未用的 b
  assert.deepEqual([...m.keys()], ["c", "a", "d"]);
  m.set("c", 30);      // 覆盖已有键也算使用
  m.set("e", 5);
  assert.deepEqual([...m.keys()], ["d", "c", "e"]);
  assert.equal(m.size, 3);
  assert.equal(m.get("zz"), undefined);
});

test("作者统计:同一推文不重复累加,数字变大时替换,旧数据不回退", () => {
  const s = P.createAuthorStats(10, 200);
  const t = { id: "1", author: "alice", views: 1000, likes: 10, retweets: 5, replies: 3, quotes: 2 };
  s.add(t);
  s.add(t);
  assert.deepEqual([s.get("alice").views, s.get("alice").interactions], [1000, 20]);
  s.add({ ...t, views: 3000, likes: 40 });
  assert.deepEqual([s.get("alice").views, s.get("alice").interactions], [3000, 50]);
  s.add({ ...t, views: 500, likes: 0 });
  assert.equal(s.get("alice").views, 3000);
  assert.equal(s.get("nobody"), null);
});

test("作者统计:每作者只留最近 N 条,作者超限整体淘汰且不残留计数", () => {
  const s = P.createAuthorStats(2, 3);
  const tw = (id, author, views) => ({ id, author, views, likes: 1, retweets: 0, replies: 0, quotes: 0 });
  for (let i = 1; i <= 5; i++) s.add(tw(String(i), "bob", i * 100));
  assert.equal(s.get("bob").views, 300 + 400 + 500);
  assert.equal(s.get("bob").interactions, 3);
  s.add(tw("x", "carol", 100));
  s.get("bob");                    // bob 刚被用到
  s.add(tw("y", "dave", 100));     // 淘汰最久未用的 carol
  assert.equal(s.get("carol"), null);
  assert.equal(s.size, 2);
  s.add(tw("x", "carol", 100));    // 被淘汰后再出现,从零开始计,不会翻倍
  assert.equal(s.get("carol").views, 100);
});

test("内容方向:从简介与刷到过的推文累计判断,忽略链接/@账号名/转推,支持自定义词典与兜底方向", () => {
  // readUser 提取简介
  const u = P.extract(user("coder", { profile_bio: { description: "Full-stack developer, Vibe Coding with Cursor" } })).users[0];
  assert.equal(u.bio, "Full-stack developer, Vibe Coding with Cursor");

  // 简介命中 1 个词即够分(3 分)
  const fromBio = P.pickDomains(u.bio, {}, "");
  assert.equal(fromBio[0].key, "code");
  assert.equal(fromBio[0].name, "AI编程");

  // 简介无线索时,靠刷到过的推文累计(3 条命中的推文 = 3 分)
  assert.deepEqual(P.pickDomains("今天天气不错", { agent: 2 }, ""), []);
  const fromTweets = P.pickDomains("今天天气不错", { agent: 3 }, "");
  assert.equal(fromTweets[0].key, "agent");
  assert.equal(fromTweets[0].name, "智能体");

  // 转推不计入作者方向,@账号名和链接里的词不误判
  assert.deepEqual(P.tweetDomains("RT @someone: Cursor and Claude Code are great", ""), []);
  assert.deepEqual(P.tweetDomains("Check out @t3dotcodes https://github.com/foo/bar", ""), []);
  assert.ok(P.tweetDomains("在用 Cursor 写独立开发项目", "").includes("code"));

  // 兜底方向(AI工具/成长/泛 AI)只在没有具体方向时才返回
  const fallbackOnly = P.pickDomains("分享好用工具和效率工具教程", {}, "");
  assert.equal(fallbackOnly[0].key, "tools");
  const withSpecific = P.pickDomains("分享好用工具和效率工具教程,主业做 Midjourney 插画设计", {}, "");
  assert.equal(withSpecific[0].key, "design");
  assert.ok(!withSpecific.some((d) => d.key === "tools"));

  // 自定义词典优先于内置方向
  const custom = "电商=直播,带货,选品\n出海=跨境";
  const pickedCustom = P.pickDomains("做抖音直播带货和选品", {}, custom);
  assert.equal(pickedCustom[0].key, "custom0");
  assert.equal(pickedCustom[0].name, "电商");

  // tags 按优先级把内容方向排在关系标签后、大V前,且受 tags.domain 开关控制
  const big = { followers: 20000, following: 100, followedBy: true, iFollow: true, createdAt: null };
  const tList = P.tags(big, null, NOW, P.mergeSettings(), { domain: fromBio[0] });
  assert.deepEqual(tList.map((t) => t.key), ["relation", "domain", "bigV"]);
  assert.equal(tList[1].dom, "code");
  assert.equal(tList[1].cls, "dom");
  const offCfg = P.mergeSettings({ tags: { domain: false } });
  assert.deepEqual(P.tags(big, null, NOW, offCfg, { domain: fromBio[0] }).map((t) => t.key), ["relation", "bigV"]);
});

test("高级搜索筛选:buildSearchQuery 组装各分组过滤规则与时间冲突提示", () => {
  assert.equal(P.mergeSettings().showSearchFilter, true);
  assert.equal(P.mergeSettings({ showSearchFilter: false }).showSearchFilter, false);

  const r1 = P.buildSearchQuery({
    keywords: "AI agent",
    exactPhrase: "claude code",
    orTerms: "cursor，windsurf, devin",
    exclude: "giveaway, air drop",
    hashtag: "#buildinpublic",
    url: "github.com",
    lang: "zh",
    from: "@xueyu1125",
    to: "elonmusk",
    filterVerified: "on",
    filterFollows: "on",
    near: "San Francisco",
    within: { value: 15, unit: "km" },
    since: "2026-01-01",
    until: "2026-10-01",
    minFaves: 100,
    minRetweets: 20,
    minReplies: 5,
    radioMedia: "videos",
    filterLinks: "on",
    filterQuote: "on",
    filterReplies: "on",
  });
  assert.equal(
    r1.query,
    'AI agent "claude code" (cursor OR windsurf OR devin) -giveaway -"air drop" #buildinpublic from:xueyu1125 to:elonmusk filter:verified filter:follows since:2026-01-01 until:2026-10-01 min_faves:100 min_retweets:20 min_replies:5 filter:videos filter:links filter:quote -filter:replies lang:zh near:"San Francisco" within:15km url:github.com',
  );
  assert.deepEqual(r1.warnings, []);

  // within_time 优先于 since/until 并返回冲突提示
  const r2 = P.buildSearchQuery({
    keywords: "llm",
    withinTime: { value: 7, unit: "d" },
    since: "2026-01-01",
  });
  assert.equal(r2.query, "llm within_time:7d");
  assert.deepEqual(r2.warnings, ["sf.conflictTime"]);
});
