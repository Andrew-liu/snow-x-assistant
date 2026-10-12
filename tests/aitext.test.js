const test = require("node:test");
const assert = require("node:assert/strict");
const A = require("../lib/aitext.js");
const P = require("../lib/parse.js");

const ZH_AI = "在当今快速发展的数字化时代，人工智能正在深刻地改变我们的生活方式。值得注意的是，AI 不仅仅是一种工具，更是推动社会进步的重要力量。\n\n首先，它为企业赋能，帮助实现降本增效；其次，它在教育领域发挥着重要作用；最后，它为个人提供了全新的可能。\n\n总而言之，拥抱 AI 至关重要。希望这篇内容对你有所帮助！";
const ZH_HUMAN = "今天下午去公司楼下那家面馆，排了二十分钟队，结果老板说牛肉卖完了，只能吃个素面。味道还行吧，就是有点咸。下次还是早点去，或者干脆换一家算了。";
const EN_AI = "In today's fast-paced digital landscape, it's important to note that AI is not just a tool, but a transformative force. Let's dive in.\n\nAI plays a crucial role in helping teams streamline workflows, foster collaboration, and unlock their full potential. It serves as a testament to human ingenuity.\n\nIn conclusion, embracing this paradigm shift is pivotal.";
const EN_HUMAN = "lol just spent two hours debugging a bug that turned out to be a typo in the env file. coffee is cold, cat is judging me, and the build still fails on CI for some other reason. going to bed";

test("中文 AI 腔文本得高分,日常中文接近 0", () => {
  const ai = A.detect(ZH_AI);
  assert.ok(ai.score >= A.STRONG, `score=${ai.score}`);
  assert.equal(ai.level, 2);
  assert.equal(ai.lang, "zh");
  const ids = ai.hits.map((h) => h.id);
  for (const id of ["zh.emphasis", "zh.summary", "zh.steps", "zh.closing"]) assert.ok(ids.includes(id), id);
  const human = A.detect(ZH_HUMAN);
  assert.ok(human.score < 30, `score=${human.score}`);
});

test("英文 AI 腔文本得高分,日常英文接近 0", () => {
  const ai = A.detect(EN_AI);
  assert.ok(ai.score >= A.STRONG, `score=${ai.score}`);
  assert.equal(ai.lang, "en");
  const vocab = ai.hits.find((h) => h.id === "en.vocab");
  assert.ok(vocab && /transformative|pivotal|paradigm/.test(vocab.sample));
  assert.ok(ai.hits.some((h) => h.id === "en.opener"));
  const human = A.detect(EN_HUMAN);
  assert.ok(human.score < 30, `score=${human.score}`);
});

test("排版套路:表情列表、引流腔、话题标签", () => {
  const r = A.detect("🚀 一文读懂 Agent 开发的底层逻辑\n\n✅ 第一点：搭建闭环\n✅ 第二点：找到抓手\n✅ 第三点：沉淀方法论\n\n干货满满，建议收藏！#AI #Agent #效率");
  const ids = r.hits.map((h) => h.id);
  assert.ok(ids.includes("x.emoji_list"));
  assert.ok(ids.includes("x.hashtags"));
  assert.ok(!ids.includes("zh.bait"), "引流腔不混进 AI 命中");
  assert.ok(r.bait.some((h) => h.id === "zh.bait"));
  assert.ok(r.score >= 50, `score=${r.score}`);
});

test("中文新句式:让步、刻意对比、伪金句、模糊权威、预告、站队", () => {
  const r = A.detect("Prompt 写得好当然重要。但真正拉开差距的，是你有没有自己的判断。一字之差，结果天壤之别。\n\n这意味着什么？意味着 AI 时代的竞争，重点不在于工具，而在于人。业内人士普遍认为，未来三年至少有三件事会彻底改变。\n\n让我印象最深的是，无论你是新手还是老手，都会被重新洗牌。从个人到团队，从产品到组织，一切都在重构。\n\n这不是终点，而是起点。未来已来。");
  assert.ok(r.score >= A.STRONG, `score=${r.score}`);
  const ids = r.hits.map((h) => h.id);
  for (const id of ["zh.concede", "zh.contrast", "zh.motto", "zh.weasel", "zh.preview", "zh.feeling", "zh.whoever", "zh.range", "zh.rhetoric", "zh.not_but"]) {
    assert.ok(ids.includes(id), id);
  }
});

test("英文新句式:伪洞见、冒号揭晓、否定排比、碎句、想象开头、夸大影响", () => {
  const r = A.detect("Here's the kicker: most teams get this wrong. Not a tool. Not a framework. A mindset.\n\nImagine a world where every engineer ships twice as fast. Experts agree this will fundamentally reshape how we build software. The best part: it's free.\n\nThat's it. That's the whole thing. Let that sink in.");
  assert.ok(r.score >= A.STRONG, `score=${r.score}`);
  const ids = r.hits.map((h) => h.id);
  for (const id of ["en.faux", "en.colon", "en.neglist", "en.fragment", "en.imagine", "en.weasel", "en.stakes"]) assert.ok(ids.includes(id), id);
});

test("引流腔只少量计分,不会单独把分数拉过阈值", () => {
  const zh = A.detect("姐妹们！这个面膜真的绝绝子，亲测有效，用了一周皮肤状态好太多了，建议收藏，99%的人不知道这个用法，一定要看到最后！");
  assert.ok(zh.bait.length && zh.hits.length === 0);
  assert.ok(zh.score < 30, `score=${zh.score}`);
  const en = A.detect("A thread 🧵👇 on how I grew to 50k followers in 6 months. Most people don't know this trick. Bookmark this and follow me for more growth tips every single week.");
  assert.ok(en.bait.some((h) => h.id === "en.bait"));
  assert.ok(en.score < 30, `score=${en.score}`);
});

test("引号、书名号里的内容不计分,但句式骨架仍能识别", () => {
  const r = A.detect("很多人吐槽 AI 写东西总爱用“值得注意的是”“综上所述”“赋能”“未来已来”这类词，我现在一看到“不是……而是……”就头疼，真的读不下去，宁愿看错别字多一点的人话。");
  assert.equal(r.hits.length, 0, r.hits.map((h) => h.id).join(","));
  assert.equal(r.score, 0);
  assert.equal(A.stripQuotes("「赋能」与《底层逻辑》"), "「□」与《□》");
  const s = A.stripQuotes("这不是“内卷”，而是“进化”。");
  assert.match(s, /不是“□”，而是“□”/);
});

test("“不是…而是…”偶尔一次按低分算,反复使用才按全额累加", () => {
  const once = A.detect("昨晚把 SQLite 换成了 DuckDB，导入 300 万行从 4 分钟降到 40 秒。不是 DuckDB 多神奇，而是我之前索引建错了。下周再测一下并发写入。");
  assert.equal(once.hits.find((h) => h.id === "zh.not_but").pts, 3);
  assert.ok(once.score < 20, `score=${once.score}`);
  const many = A.detect("这不是工具，而是伙伴。这不是选择，而是必然。成功不是运气，而是坚持。与其说是技术问题，不如说是认知问题。我们今天就聊聊这件事。");
  const nb = many.hits.find((h) => h.id === "zh.not_but");
  assert.ok(nb.n >= 3 && nb.pts === 12, `n=${nb.n} pts=${nb.pts}`);
});

test("短推里的排版规则打折,长文按全额", () => {
  const line = "1. 先读文档\n2. 再跑示例\n3. 最后改配置\n";
  const short = A.detect(line + "今天就这样，明天继续折腾这个项目吧，看看能不能跑通，跑不通就换个思路。");
  const long = A.detect(line + "今天就这样，明天继续折腾这个项目吧，看看能不能跑通。".repeat(6));
  const ps = short.hits.find((h) => h.id === "x.num_list").pts;
  const pl = long.hits.find((h) => h.id === "x.num_list").pts;
  assert.equal(pl, 5);
  assert.equal(ps, 3);
});

test("太短不打分;链接和 @ 不计入长度", () => {
  assert.equal(A.detect("AI 至关重要"), null);
  assert.equal(A.detect("@someone https://t.co/abcdefghij https://example.com/" + "a".repeat(80)), null);
  assert.equal(A.detect(""), null);
  assert.equal(A.detect(null), null);
  // 门槛 10:9 个字不打分,10 个字开始打分
  assert.equal(A.detect("一二三四五六七八九"), null);
  assert.ok(A.detect("一二三四五六七八九十"));
  assert.equal(A.detect("SuperGrok 只能用 grok 4.7 吧这玩意也笨笨的").score, 0);
});

test("中文 AI 短回复腔调能识别,口语吐槽不误报", () => {
  const ai = [
    "这个观点很有意思！确实，数字人直播的门槛正在不断降低，未来可能会有更多普通人参与其中。",
    "很有意思的分享！这背后反映的其实是AI工具正在重塑内容创作的方式，值得持续关注。",
    "这个思路很棒！不过在实际落地的过程中，可能还需要考虑成本和稳定性的问题。",
  ];
  for (const t of ai) assert.ok(A.detect(t).score >= 50, t + " → " + A.detect(t).score);
  const human = [
    "15G显存真能边聊边不崩？我本地TTS一多就红显存，这哥们属于是把显卡榨干了。",
    "关键是我那破网连都连不上，说啥都白搭",
    "确实贵，我上个月光token就烧了两百多刀",
  ];
  for (const t of human) assert.ok(A.detect(t).score < 40, t + " → " + A.detect(t).score);
  // 书面化高频词只命中 1 个不计分
  assert.equal(A.detect("这次更新显著快了很多，我那台老电脑也能跑").hits.some((h) => h.id === "zh.vocab"), false);
});

test("同一规则重复命中有上限,分数不超过 100", () => {
  const r = A.detect(("值得注意的是，综上所述，赋能闭环抓手。").repeat(40));
  assert.ok(r.score <= 100);
  const emph = r.hits.find((h) => h.id === "zh.emphasis");
  assert.equal(emph.pts, 9 * 2); // 最多按 2 倍计
});

test("readTweet 读取正文,长推优先 note_tweet;AI 设置有校验", () => {
  const author = { __typename: "User", core: { screen_name: "a" }, legacy: { followers_count: 1, friends_count: 1 } };
  const base = { __typename: "Tweet", rest_id: "1", core: { user_results: { result: author } }, legacy: { favorite_count: 0, full_text: "short" } };
  assert.equal(P.extract(base).tweets[0].text, "short");
  const long = Object.assign({}, base, { note_tweet: { note_tweet_results: { result: { text: "完整长文" } } } });
  assert.equal(P.extract(long).tweets[0].text, "完整长文");
  assert.equal(P.mergeSettings({}).showAiText, true);
  assert.equal("aiMinScore" in P.mergeSettings({ aiMinScore: 70 }), false); // 阈值已取消,旧存储里的字段直接丢弃
});

test("推文长度的 AI 腔能过默认阈值 50,正常推文不过", () => {
  const ai = [
    "说得太好了！这确实是一个值得深思的问题。在AI快速发展的今天，我们更需要保持独立思考的能力。期待更多这样有深度的分享！",
    "OpenAI 刚刚发布了 GPT-6，这不仅仅是一次升级，更是一场范式革命。\n\n核心亮点：\n1. 推理能力大幅提升\n2. 多模态全面打通\n3. 成本降低 80%\n\n总的来说，AI 的下一个时代已经到来。你怎么看？",
    "Great point! This is a fascinating perspective on the evolving landscape of AI. It's crucial that we continue to foster meaningful conversations around these important topics.",
    "AI agents are fundamentally reshaping how we work.\n\nHere's the thing: it's not just about automation. It's about augmentation.\n\nLet that sink in.",
  ];
  for (const t of ai) assert.ok(A.detect(t).score >= 50, `${A.detect(t).score}: ${t.slice(0, 20)}`);
  const human = [
    "周末把家里的 NAS 换成了 4 盘位，迁移数据花了一整天。踩的坑：旧盘有两块坏道，rsync 跑到一半报错，只好分目录慢慢拷。现在跑着 Jellyfin 和照片备份，功耗比之前低了十几瓦。",
    "我觉得这次发布会最大的问题不是价格，而是续航。宣传说一整天，实际重度用半天就没电了，评测里也基本都这么说。",
    "Honestly the new iPhone camera is fine but I don't see why anyone would upgrade from last year's model. Battery is about the same and the price went up.",
  ];
  for (const t of human) { const r = A.detect(t); assert.ok(!r || r.score < 30, `${r && r.score}: ${t.slice(0, 20)}`); }
});
