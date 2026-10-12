const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const I = require("../lib/i18n.js");
const P = require("../lib/parse.js");

test("中英文字典词条一一对应,占位符一致", () => {
  const zh = Object.keys(I.DICT.zh).sort();
  const en = Object.keys(I.DICT.en).sort();
  assert.deepEqual(en, zh);
  const holes = (s) => (s.match(/\{\w+\}/g) || []).sort().join(",");
  for (const k of zh) assert.equal(holes(I.DICT.en[k]), holes(I.DICT.zh[k]), k);
});

test("t 替换变量,缺词条回退中文再回退 key", () => {
  assert.equal(I.t("sec", { n: 3 }, "zh"), "3 秒");
  assert.equal(I.t("sec", { n: 3 }, "en"), "3 s");
  assert.equal(I.t("mc.loaded", null, "en"), "Loaded {b}");
  assert.equal(I.t("no.such.key", null, "en"), "no.such.key");
});

test("resolve:显式设置优先,自动时只有 zh 开头的语言标记显示中文", () => {
  assert.equal(I.resolve("en", "zh-CN"), "en");
  assert.equal(I.resolve("zh", "en-US"), "zh");
  assert.equal(I.resolve("auto", "zh-Hant"), "zh");
  assert.equal(I.resolve("auto", "ja"), "en");
  assert.equal(I.resolve("auto", ""), "en");
});

test("parts 把 {b} 换成节点,其余保持文本", () => {
  const node = { tag: "b" };
  assert.deepEqual(I.parts("mc.desc", null, [node], "zh"), ["将取消关注 ", node, " 个账号"]);
  assert.deepEqual(I.parts("mc.resOk", null, [node], "en"), ["Done! Unfollowed ", node]);
});

test("每条 AI 检测规则都有另一种语言的名字", () => {
  const src = fs.readFileSync(path.join(__dirname, "../lib/aitext.js"), "utf8");
  const ids = [...src.matchAll(/(?:rx\(|id: )"((?:zh|en|x)\.[a-z_]+)"/g)].map((m) => m[1]);
  assert.ok(ids.length > 40, `ids=${ids.length}`);
  for (const id of ids) {
    const need = id.startsWith("en.") ? "zh" : "en";
    assert.ok(I.RULES[need][id], `${need} 缺少 ${id}`);
  }
});

test("mergeSettings 校验外观和语言", () => {
  assert.equal(P.mergeSettings().theme, "auto");
  assert.equal(P.mergeSettings().lang, "auto");
  assert.equal(P.mergeSettings({ theme: "dark", lang: "en" }).theme, "dark");
  assert.equal(P.mergeSettings({ theme: "dark", lang: "en" }).lang, "en");
  assert.equal(P.mergeSettings({ theme: "sepia", lang: "fr" }).theme, "auto");
  assert.equal(P.mergeSettings({ theme: "sepia", lang: "fr" }).lang, "auto");
});

test("英文数字用 K / M / B,流速 1 万以上继续用 k", () => {
  assert.equal(P.fmt(9999, "en"), "9999");
  assert.equal(P.fmt(12345, "en"), "12.3K");
  assert.equal(P.fmt(123456, "en"), "123K");
  assert.equal(P.fmt(1234567, "en"), "1.23M");
  assert.equal(P.fmt(2.5e9, "en"), "2.5B");
  assert.equal(P.fmt(12345), "1.23万");
  assert.equal(P.fmtVel(4999, "en"), "4.9k");
  assert.equal(P.fmtVel(12345, "en"), "12k");
  assert.equal(P.fmtVel(12345), "1.23万");
});

test("质量标签带上用于翻译的 tid", () => {
  const now = Date.parse("2026-10-10T12:00:00Z");
  const base = { handle: "a", followers: 100, following: 100, createdAt: null };
  assert.equal(P.tags({ ...base, followedBy: true, iFollow: true }, null, now)[0].tid, "mutual");
  assert.equal(P.tags({ ...base, followedBy: true, iFollow: false }, null, now)[0].tid, "followsYou");
  for (const k of Object.keys(P.DEFAULTS.tags)) assert.ok(I.DICT.en["tag." + k], k);
});
