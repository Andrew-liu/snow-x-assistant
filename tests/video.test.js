const test = require("node:test");
const assert = require("node:assert/strict");
const P = require("../lib/parse.js");
const I = require("../lib/i18n.js");

const V = (bitrate, w, h, ext = "mp4") => ({
  bitrate, content_type: ext === "mp4" ? "video/mp4" : "application/x-mpegURL",
  url: `https://video.twimg.com/ext_tw_video/1/pu/vid/avc1/${w}x${h}/a.${ext}?tag=12`,
});

const media = (type, variants) => ({
  type, media_url_https: "https://pbs.twimg.com/ext_tw_video_thumb/1/pu/img/a.jpg",
  video_info: { duration_millis: 65000, variants },
});

test("tweetIdFromInput 识别各种推文链接和纯数字 ID", () => {
  assert.equal(P.tweetIdFromInput("https://x.com/snow/status/1911851074211766272"), "1911851074211766272");
  assert.equal(P.tweetIdFromInput("  https://twitter.com/a_b/status/123456789?s=20&t=xx "), "123456789");
  assert.equal(P.tweetIdFromInput("https://x.com/i/web/status/1234567890/video/1"), "1234567890");
  assert.equal(P.tweetIdFromInput("https://mobile.twitter.com/a/statuses/1234567"), "1234567");
  assert.equal(P.tweetIdFromInput("1911851074211766272"), "1911851074211766272");
  assert.equal(P.tweetIdFromInput("https://x.com/snow"), null);
  assert.equal(P.tweetIdFromInput(""), null);
  assert.equal(P.tweetIdFromInput("abc"), null);
});

test("isVideoUrl 只放行 video.twimg.com 的 https 直链", () => {
  assert.ok(P.isVideoUrl("https://video.twimg.com/a.mp4"));
  assert.ok(!P.isVideoUrl("http://video.twimg.com/a.mp4"));
  assert.ok(!P.isVideoUrl("https://video.twimg.com.evil.com/a.mp4"));
  assert.ok(!P.isVideoUrl("https://evil.com/video.twimg.com/a.mp4"));
  assert.ok(!P.isVideoUrl("javascript:alert(1)"));
  assert.ok(!P.isVideoUrl(null));
});

test("mp4Variants 去掉 m3u8 和非法地址,按码率从高到低,带分辨率", () => {
  const list = [V(832000, 640, 360), V(0, 0, 0, "m3u8"), V(2176000, 1280, 720), V(256000, 480, 270),
    { content_type: "video/mp4", bitrate: 999, url: "https://evil.com/x.mp4" }, V(2176000, 1280, 720)];
  const out = P.mp4Variants(list);
  assert.deepEqual(out.map((v) => v.bitrate), [2176000, 832000, 256000]);
  assert.equal(out[0].height, 720);
  assert.equal(P.qualityLabel(out[0], "video"), "720p");
  assert.equal(P.qualityLabel(out[2], "video"), "270p");
  assert.deepEqual(P.mp4Variants(null), []);
});

test("videosFromMedia 只收视频和 GIF,图片忽略", () => {
  const out = P.videosFromMedia([
    { type: "photo", media_url_https: "https://pbs.twimg.com/media/a.jpg" },
    media("video", [V(832000, 640, 360), V(2176000, 1280, 720)]),
    media("animated_gif", [{ bitrate: 0, content_type: "video/mp4", url: "https://video.twimg.com/tweet_video/a.mp4" }]),
    media("video", [V(0, 0, 0, "m3u8")]),
  ]);
  assert.equal(out.length, 2);
  assert.equal(out[0].kind, "video");
  assert.equal(out[0].durationMs, 65000);
  assert.equal(out[0].variants[0].height, 720);
  assert.equal(out[1].kind, "gif");
  assert.equal(P.qualityLabel(out[1].variants[0], "gif"), "GIF");
});

test("extract 从 GraphQL 推文里带出视频和引用推文 ID", () => {
  const author = { __typename: "User", core: { screen_name: "Snow" }, legacy: { followers_count: 10, friends_count: 1 } };
  const tw = {
    __typename: "Tweet", rest_id: "111", core: { user_results: { result: author } },
    legacy: {
      favorite_count: 1, retweet_count: 0, reply_count: 0, quote_count: 0, bookmark_count: 0,
      created_at: "Mon Jan 05 00:00:00 +0000 2026", quoted_status_id_str: "222",
      extended_entities: { media: [media("video", [V(2176000, 1280, 720)])] },
    },
  };
  const { tweets } = P.extract({ data: { tweet: tw } });
  assert.equal(tweets[0].videos.length, 1);
  assert.equal(tweets[0].quotedId, "222");
});

test("syndicationToken 与官方嵌入组件算法一致,且不含 0 和小数点", () => {
  const id = "1911851074211766272";
  const expect = ((Number(id) / 1e15) * Math.PI).toString(36).replace(/(0+|\.)/g, "");
  assert.equal(P.syndicationToken(id), expect);
  assert.ok(!/[0.]/.test(P.syndicationToken(id)));
  assert.match(P.syndicationUrl(id), /^https:\/\/cdn\.syndication\.twimg\.com\/tweet-result\?id=1911851074211766272&lang=en&token=\w+$/);
});

test("fromSyndication 统一结构,本条无视频时 pickMedia 退到引用推文", () => {
  const json = {
    __typename: "Tweet", id_str: "111", text: "hi", user: { screen_name: "Snow" }, mediaDetails: [],
    quoted_tweet: { id_str: "222", text: "q", user: { screen_name: "Other" }, mediaDetails: [media("video", [V(832000, 640, 360)])] },
  };
  const rec = P.fromSyndication(json);
  assert.equal(rec.author, "snow");
  assert.equal(rec.videos.length, 0);
  const m = P.pickMedia(rec);
  assert.equal(m.id, "222");
  assert.equal(m.author, "other");
  assert.equal(P.fromSyndication({ __typename: "TweetTombstone" }), null);
  assert.equal(P.fromSyndication(null), null);
  assert.equal(P.pickMedia({ videos: [], quoted: null }), null);
});

test("文件名统一放进 SnowX 目录,去掉路径和非法字符", () => {
  const v = { width: 1280, height: 720, bitrate: 2176000 };
  assert.equal(P.videoFileName("snow", "111", 0, 1, v, "video"), "SnowX/snow_111_720p.mp4");
  assert.equal(P.videoFileName("snow", "111", 1, 2, v, "video"), "SnowX/snow_111_2_720p.mp4");
  assert.equal(P.safeFileName("../../etc/passwd"), "SnowX/passwd.mp4");
  assert.equal(P.safeFileName("a b<c>.mp4"), "SnowX/a_b_c_.mp4");
  assert.equal(P.safeFileName(""), "SnowX/video.mp4");
});

test("下载相关格式化与错误文案", () => {
  assert.equal(P.fmtDuration(65000), "1:05");
  assert.equal(P.fmtDuration(0), "");
  assert.equal(P.fmtBitrate(2176000), "2.2 Mbps");
  assert.equal(P.fmtBitrate(832000), "832 kbps");
  for (const code of ["bad_id", "not_found", "no_video", "timeout", "http_500", "network"]) {
    assert.ok(I.DICT.zh[P.dlErrorKey(code)], code);
    assert.ok(I.DICT.en[P.dlErrorKey(code)], code);
  }
});

test("showDownload 默认开启,可关闭", () => {
  assert.equal(P.mergeSettings().showDownload, true);
  assert.equal(P.mergeSettings({ showDownload: false }).showDownload, false);
  assert.equal(P.mergeSettings({ showDownload: "no" }).showDownload, true);
});
