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

test("流速 = 浏览 / 小时,按 1k / 5k / 1w 分四档,后三档带火箭", () => {
  const cfg = P.mergeSettings();
  const t = { views: 50000, likes: 100, retweets: 20, replies: 10, quotes: 0, bookmarks: 30, createdAt: new Date(NOW - 5 * HOUR).toISOString() };
  assert.equal(Math.round(P.velocityOf(t, NOW)), 10000);
  assert.equal(P.velocityLevel(999, cfg), 0);
  assert.equal(P.velocityLevel(1000, cfg), 1);
  assert.equal(P.velocityLevel(4999, cfg), 1);
  assert.equal(P.velocityLevel(5000, cfg), 2);
  assert.equal(P.velocityLevel(9999, cfg), 2);
  assert.equal(P.velocityLevel(10000, cfg), 3);
  const tag = P.velocityTag(t, NOW, cfg);
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

test("爆款分在 0-100 之间", () => {
  const t = { views: 1e6, likes: 1e5, retweets: 1e5, replies: 1e5, quotes: 0, bookmarks: 1e5, createdAt: new Date(NOW - HOUR).toISOString() };
  assert.equal(P.viralScore(t, NOW), 100);
});

test("质量标签:互关、大V、疑似互粉号", () => {
  const big = { followers: 20000, following: 100, followedBy: true, iFollow: true, createdAt: null };
  assert.deepEqual(P.tags(big, null, NOW).map((t) => t.key), ["relation", "bigV"]);
  const farm = { followers: 1500, following: 1400, followedBy: false, iFollow: false, createdAt: null };
  assert.deepEqual(P.tags(farm, null, NOW).map((t) => t.key), ["farm"]);
});

test("mergeSettings 校正非法值并保留标签开关", () => {
  const s = P.mergeSettings({ layout: "x", maxTags: 99, velocityTrending: 5000, velocityViral: 100, mutualDelayMs: 10, tags: { bigV: false, junk: 1 }, showVelocity: "yes" });
  assert.equal(s.layout, "auto");
  assert.equal(s.maxTags, 7);
  assert.ok(s.velocityTrending < s.velocityHot && s.velocityHot < s.velocityViral);
  assert.deepEqual([s.velocityTrending, s.velocityHot, s.velocityViral], [1000, 5000, 10000]);
  const ok = P.mergeSettings({ velocityTrending: 2000, velocityHot: 6000, velocityViral: 20000 });
  assert.deepEqual([ok.velocityTrending, ok.velocityHot, ok.velocityViral], [2000, 6000, 20000]);
  assert.equal(s.mutualDelayMs, 800);
  assert.equal(s.tags.bigV, false);
  assert.equal(s.tags.junk, undefined);
  assert.equal(s.showVelocity, true);
  assert.equal(s.mutualEnabled, true);
});

test("mergeSettings 主题与流速独立开关", () => {
  assert.equal(P.mergeSettings().skin, "signal");
  assert.equal(P.mergeSettings({ skin: "shield" }).skin, "shield");
  assert.equal(P.mergeSettings({ skin: "candy" }).skin, "signal");
  assert.equal(P.mergeSettings({ skin: "__proto__" }).skin, "signal");
  assert.equal(P.mergeSettings({ skin: 3 }).skin, "signal");
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
