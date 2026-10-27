// 多语言:中文 / English 两套文案。内容脚本、弹窗和单元测试共用。
// 文案里的 {name} 由 t(key, vars) 替换;缺词条时回退中文,再回退 key 本身。
(function (root) {
  "use strict";

  const LANGS = ["zh", "en"];

  const zh = {
    // ---- 弹窗:框架 ----
    "tab.tags": "标签", "tab.skin": "主题", "tab.dl": "下载", "tab.mutual": "互关清理", "tab.general": "通用",
    "local": "本地运行", "local.title": "标签只读取 X 页面已加载的数据;视频下载在页面没有缓存时会请求 X 公开的嵌入接口",
    "foot.follow": "关注作者",
    // ---- 视频下载 ----
    "dl.toggle": "时间线下载按钮", "dl.toggle.desc": "带视频的推文操作栏多一个下载按钮,点一下下载最高清晰度",
    "dl.paste": "粘贴推文链接", "dl.ph": "https://x.com/用户名/status/…", "dl.go": "解析",
    "dl.loading": "正在解析…", "dl.fromCache": "来自页面缓存", "dl.fromApi": "来自 X 公开嵌入接口",
    "dl.quoted": "视频来自引用推文", "dl.video": "视频 {n}", "dl.gif": "GIF {n}",
    "dl.started": "已开始下载 {q},保存在下载目录的 SnowX 文件夹", "dl.failed": "下载失败:{e}",
    "dl.err.badUrl": "没认出推文链接,请粘贴形如 x.com/用户名/status/数字 的链接",
    "dl.err.notFound": "推文不存在、已删除、受保护,或需要登录才能查看",
    "dl.err.noVideo": "这条推文里没有视频或 GIF",
    "dl.err.timeout": "请求超时,请稍后再试",
    "dl.err.net": "请求失败,请稍后再试({e})",
    "dl.btn": "下载视频", "dl.btnBusy": "正在获取视频…", "dl.btnDone": "已开始下载",
    "dl.legal": "仅限个人保存与学习使用。视频版权归原作者所有,请遵守 X 服务条款和当地法律,不要转载或用于商业用途。",
    "dl.note": "只保存 mp4 直链。部分视频 720p 以上只有分段流,这里最高给到可直接下载的清晰度。",
    // ---- 弹窗:标签页 ----
    "preview.aria": "标签预览", "preview.empty": "流速、AI 检测和账号标签都已关闭", "skin.link": "主题:{name}  ›",
    "vel.title": "推文流速", "vel.desc": "浏览量 ÷ 发布小时数,独立于账号标签",
    "thr.label": "档位阈值", "thr.unit": "浏览/小时",
    "thr.a1": "升温阈值", "thr.a2": "热门阈值", "thr.a3": "爆款阈值",
    "thr.err": "三档需为正整数,且 升温 < 热门 < 爆款,改好后自动保存",
    "ai.title": "AI 文本检测", "ai.desc": "按中文、英文两套 AI 写作套路在本地打分,在标签行显示 AI 概率",
    "acct.title": "账号标签", "acct.desc": "粉丝数、关注/粉丝比、质量标签",
    "acct.followers": "粉丝数", "acct.ratio": "关注/粉丝比", "acct.ratio.desc": "关注数 ÷ 粉丝数，非实际互关率",
    "acct.tier": "粉丝量级圆点", "acct.quality": "质量标签", "acct.max": "每条最多显示",
    "max.0": "不显示", "max.all": "全部",
    "hover": "悬停详情卡", "layout": "推文里的位置",
    "layout.auto": "自动", "layout.inline": "跟在名字后", "layout.below": "单独一行", "debug": "调试信息条",
    // ---- 弹窗:主题页 ----
    "skin.bg": "预览背景", "bg.light": "浅色", "bg.dark": "深色", "skin.aria": "标签主题",
    "skin.note": "主题同时作用于推文流速、账号标签和悬停详情卡。预览背景只影响此弹窗。",
    "skin.inuse": "使用中", "skin.capVel": "流速四档", "skin.capAi": "AI 检测",
    "skin.signal": "信号灯", "skin.shield": "徽章", "skin.sticker": "贴纸", "skin.terminal": "终端",
    "skin.heatbar": "热度条", "skin.neon": "霓虹", "skin.minimal": "原生文字", "skin.aurora": "极光",
    "skind.signal": "实心彩色胶囊,档位越高越亮",
    "skind.shield": "GitHub 徽章式,左边是名称,右边是数值",
    "skind.sticker": "粗黑描边加硬投影,微微歪斜的贴纸",
    "skind.terminal": "整条命令行,等宽字体竖线分隔",
    "skind.heatbar": "流速画成 5 格热度条,其余是纯文字",
    "skind.neon": "发光描边,在深色背景上最显眼",
    "skind.minimal": "不加框,只给文字上色,最贴近 X 原生",
    "skind.aurora": "渐变填充,爆款带呼吸光晕",
    // ---- 弹窗:互关清理页 ----
    "m.title": "互关清理", "m.desc": "在你的“正在关注”页批量取关未回关的人",
    "m.delay": "每次取关间隔", "m.delay.desc": "会再叠加随机抖动", "sec": "{n} 秒",
    "m.steps": "使用方法",
    "m.step1a": "打开 ", "m.step1code": "x.com/你的用户名/following", "m.step1b": ",工具栏出现在“正在关注”标签栏下方。",
    "m.step2": "默认只列出没回关你的人,勾选或“全选”后点“取消关注所选”。",
    "m.step3": "确认后按间隔逐个取关,可随时停止。每小时最多 50 人,到量自动暂停。",
    "m.note": "取关通过点击 X 页面自带按钮完成,不调用 X 接口。间隔越长越不容易被限流。",
    // ---- 弹窗:通用页 ----
    "g.theme": "外观", "g.theme.desc": "弹窗、页面标签、悬停卡和互关工具栏一起切换。自动时弹窗跟随系统,页面里跟随 X 背景",
    "theme.auto": "自动", "theme.light": "浅色", "theme.dark": "深色",
    "g.lang": "语言", "g.lang.desc": "自动时跟随 X 的界面语言,非中文一律显示英文", "lang.auto": "自动",
    "g.about": "作者与项目", "g.x": "作者的 X 账号", "g.gh": "GitHub 仓库",
    "g.follow": "关注", "g.star": "点 Star",
    "g.ask": "觉得好用的话,去 GitHub 点个 Star 支持一下,也欢迎提 Issue 反馈问题",
    // ---- 页面标签 ----
    "lv.0": "普通", "lv.1": "升温", "lv.2": "热门", "lv.3": "爆款",
    "ai.lv.0": "不明显", "ai.lv.1": "疑似 AI", "ai.lv.2": "很像 AI",
    "b.vel": "流速 {n} 浏览/小时 · {lv}",
    "b.ai": "AI 概率 {s}% · {lv}", "b.aiShort": "AI 概率:正文太短,不判断",
    "b.followers": "{n} 粉丝", "b.fUnit": "粉",
    "b.ratio": "关注数 ÷ 粉丝数（非实际互关率）", "b.rUnit": "关/粉",
    "sep": "、",
    "tag.mutual": "互关", "tag.followsYou": "关注了你", "tag.bigV": "大V", "tag.engaged": "高互动",
    "tag.farm": "疑似互粉号", "tag.newAcct": "新号", "tag.lowActive": "低活跃", "tag.oldAcct": "老号",
    "tag.relation": "互关",
    "tag.notFollowBack": "未回关",
    // ---- 悬停卡 ----
    "tip.following": "已关注",
    "tip.followers": "粉丝", "tip.followingN": "关注", "tip.ratio": "关/粉比",
    "tip.er": "互动率", "tip.lowSample": "样本不足", "tip.tweets": "推文", "tip.joined": "注册于",
    "tip.ageYM": "{y} 年 {m} 个月", "tip.ageY": "{y} 年", "tip.ageM": "{m} 个月",
    "tip.vph": "浏览/小时", "tip.viral": "爆款分",
    "tip.views": "浏览", "tip.likes": "赞", "tip.rts": "转", "tip.replies": "评", "tip.bms": "藏",
    "tip.posted": "{t} 发布", "tip.fromDom": "取自页面数字",
    "tip.ai": "AI 概率 · {lang}", "tip.zh": "中文", "tip.en": "英文",
    "tip.aiNone": "没有命中常见的 AI 写作套路",
    "tip.aiBait": "另有引流写法(营销号也常用,只少量计分)",
    "tip.aiNote": "本地规则打分,只看写法不看内容,引号内的话不计,仅供参考",
    // ---- 互关清理工具栏 ----
    "mc.title": "互关清理", "mc.select": "选择 @{h}",
    "mc.confirmTitle": "确认取消关注", "mc.cancel": "取消", "mc.confirm": "确认取消关注",
    "mc.loaded": "列表 {b} 人", "mc.sel": "已选 {b} 人", "mc.oneway": "未回关 {b} 人",
    "mc.quota": "本小时 {b} / {limit}", "mc.done": "已取关 {b} 人",
    "mc.onlyOneway": "仅未回关", "mc.all": "全部", "mc.selAll": "全选未回关", "mc.clear": "清除选择",
    "mc.go": "取消关注所选", "mc.goN": "取消关注所选 ({n})",
    "mc.full": "本小时已满 {limit} 人 · {m} 分钟后可继续",
    "mc.warn": "⚠️ 每小时最多取关 {limit} 人,到量自动暂停,降低账号限制风险",
    "mc.progress": "正在取消关注…", "mc.progressH": "正在取消关注 @{h}", "mc.stop": "停止", "mc.dismiss": "知道了",
    "mc.hint": "向下滚动加载更多关注,只处理已加载的账号", "mc.left": "还有 {n} 人待处理",
    "mc.desc": "将取消关注 {b} 个账号",
    "mc.noteOver": "本小时还可取关 {left} 人,到量自动暂停,其余稍后继续 · 每个间隔约 {sec} 秒 · 此操作不可撤销",
    "mc.note": "每个间隔约 {sec} 秒,可随时停止 · 此操作不可撤销",
    "mc.resOk": "完成!成功取消关注 {b} 人", "mc.resFail": ",失败 {b} 人",
    "mc.resMissing": ",{n} 人已滚出列表,滚回去可重试", "mc.resStopped": ",已手动停止",
    "mc.resPaused": ",已达每小时 {limit} 人上限自动暂停,约 {m} 分钟后可继续",
  };

  const en = {
    "tab.tags": "Tags", "tab.skin": "Styles", "tab.dl": "Video", "tab.mutual": "Unfollow", "tab.general": "General",
    "local": "Local only", "local.title": "Tags only read data the X page has already loaded; video download calls X's public embed endpoint when the page has no cached data",
    "foot.follow": "Follow the author",
    "dl.toggle": "Timeline download button", "dl.toggle.desc": "Adds a download button to the action bar of tweets with video. One click saves the best quality",
    "dl.paste": "Paste a tweet link", "dl.ph": "https://x.com/user/status/…", "dl.go": "Fetch",
    "dl.loading": "Fetching…", "dl.fromCache": "From page cache", "dl.fromApi": "From X's public embed endpoint",
    "dl.quoted": "Video is from the quoted tweet", "dl.video": "Video {n}", "dl.gif": "GIF {n}",
    "dl.started": "Downloading {q} to the SnowX folder in your downloads", "dl.failed": "Download failed: {e}",
    "dl.err.badUrl": "That doesn't look like a tweet link. Paste something like x.com/user/status/123",
    "dl.err.notFound": "The tweet doesn't exist, was deleted, is protected, or requires login",
    "dl.err.noVideo": "This tweet has no video or GIF",
    "dl.err.timeout": "Request timed out, please try again",
    "dl.err.net": "Request failed, please try again ({e})",
    "dl.btn": "Download video", "dl.btnBusy": "Fetching video…", "dl.btnDone": "Download started",
    "dl.legal": "For personal saving and study only. Videos belong to their creators. Follow X's Terms of Service and local laws, and do not repost or use them commercially.",
    "dl.note": "Only direct mp4 files are saved. Some videos above 720p exist only as segmented streams, so the best directly downloadable quality is offered.",
    "preview.aria": "Tag preview", "preview.empty": "Velocity, AI check and account tags are all off", "skin.link": "Style: {name}  ›",
    "vel.title": "Tweet velocity", "vel.desc": "Views ÷ hours since posting, separate from account tags",
    "thr.label": "Tier thresholds", "thr.unit": "views/hour",
    "thr.a1": "Warming threshold", "thr.a2": "Hot threshold", "thr.a3": "Viral threshold",
    "thr.err": "Use positive integers with Warming < Hot < Viral. Saved automatically once valid",
    "ai.title": "AI text check", "ai.desc": "Scores tweets locally against Chinese and English AI writing patterns and shows the AI likelihood in the tag row",
    "acct.title": "Account tags", "acct.desc": "Followers, following ratio, quality tags",
    "acct.followers": "Followers", "acct.ratio": "Following ratio", "acct.ratio.desc": "Following ÷ followers, not the real mutual rate",
    "acct.tier": "Follower tier dot", "acct.quality": "Quality tags", "acct.max": "Max per tweet",
    "max.0": "None", "max.all": "All",
    "hover": "Hover card", "layout": "Placement in tweets",
    "layout.auto": "Auto", "layout.inline": "After name", "layout.below": "Own line", "debug": "Debug bar",
    "skin.bg": "Preview background", "bg.light": "Light", "bg.dark": "Dark", "skin.aria": "Tag style",
    "skin.note": "The style applies to velocity, account tags and the hover card. Preview background only affects this popup.",
    "skin.inuse": "In use", "skin.capVel": "Velocity", "skin.capAi": "AI check",
    "skin.signal": "Signal", "skin.shield": "Shield", "skin.sticker": "Sticker", "skin.terminal": "Terminal",
    "skin.heatbar": "Heat bar", "skin.neon": "Neon", "skin.minimal": "Plain text", "skin.aurora": "Aurora",
    "skind.signal": "Solid color pills, brighter at higher tiers",
    "skind.shield": "GitHub-badge look, label on the left, value on the right",
    "skind.sticker": "Bold outline, hard shadow, slightly tilted",
    "skind.terminal": "One command line, monospace with pipe separators",
    "skind.heatbar": "Velocity as a 5-cell heat bar, the rest plain text",
    "skind.neon": "Glowing outline, stands out on dark backgrounds",
    "skind.minimal": "No boxes, colored text only, closest to native X",
    "skind.aurora": "Gradient fill, viral tweets pulse",
    "m.title": "Unfollow cleanup", "m.desc": "Bulk-unfollow people who don't follow you back, on your Following page",
    "m.delay": "Delay between unfollows", "m.delay.desc": "Plus a small random jitter", "sec": "{n} s",
    "m.steps": "How to use",
    "m.step1a": "Open ", "m.step1code": "x.com/your_handle/following", "m.step1b": ". The toolbar appears under the Following tab bar.",
    "m.step2": "Only non-mutual accounts are listed by default. Tick them or use “Select all”, then click “Unfollow selected”.",
    "m.step3": "After confirming, accounts are unfollowed one by one and you can stop anytime. Max 50 per hour, then it pauses.",
    "m.note": "Unfollowing clicks X's own buttons and never calls the X API. Longer delays are less likely to hit rate limits.",
    "g.theme": "Appearance", "g.theme.desc": "Applies to the popup, page tags, hover cards and the unfollow toolbar. Auto follows the system in the popup and X's background on the page",
    "theme.auto": "Auto", "theme.light": "Light", "theme.dark": "Dark",
    "g.lang": "Language", "g.lang.desc": "Auto follows X's interface language; anything other than Chinese shows English", "lang.auto": "Auto",
    "g.about": "Author & project", "g.x": "Author on X", "g.gh": "GitHub repository",
    "g.follow": "Follow", "g.star": "Star",
    "g.ask": "If you find it useful, a star on GitHub helps a lot. Issues and feedback are welcome too",
    "lv.0": "Normal", "lv.1": "Warming", "lv.2": "Hot", "lv.3": "Viral",
    "ai.lv.0": "Unlikely", "ai.lv.1": "Possibly AI", "ai.lv.2": "Likely AI",
    "b.vel": "Velocity {n} views/hour · {lv}",
    "b.ai": "AI likelihood {s}% · {lv}", "b.aiShort": "AI likelihood: too short to judge",
    "b.followers": "{n} followers", "b.fUnit": "fans",
    "b.ratio": "Following ÷ followers (not the real mutual rate)", "b.rUnit": "F/F",
    "sep": ", ",
    "tag.mutual": "Mutual", "tag.followsYou": "Follows you", "tag.bigV": "Big V", "tag.engaged": "Engaging",
    "tag.farm": "Follow farm?", "tag.newAcct": "New", "tag.lowActive": "Low engage", "tag.oldAcct": "Veteran",
    "tag.relation": "Mutual",
    "tag.notFollowBack": "No follow-back",
    "tip.following": "Following",
    "tip.followers": "Followers", "tip.followingN": "Following", "tip.ratio": "F/F ratio",
    "tip.er": "Engagement", "tip.lowSample": "Not enough data", "tip.tweets": "Posts", "tip.joined": "Joined",
    "tip.ageYM": "{y}y {m}m", "tip.ageY": "{y}y", "tip.ageM": "{m}m",
    "tip.vph": "views/hour", "tip.viral": "Viral score",
    "tip.views": "Views", "tip.likes": "Likes", "tip.rts": "RTs", "tip.replies": "Replies", "tip.bms": "Saves",
    "tip.posted": "Posted {t}", "tip.fromDom": "From on-page counts",
    "tip.ai": "AI likelihood · {lang}", "tip.zh": "Chinese", "tip.en": "English",
    "tip.aiNone": "No common AI writing patterns found",
    "tip.aiBait": "Engagement-bait phrasing (common in marketing too, lightly weighted)",
    "tip.aiNote": "Local rule-based score of writing style, not content. Quoted text is ignored. For reference only",
    "mc.title": "Unfollow cleanup", "mc.select": "Select @{h}",
    "mc.confirmTitle": "Confirm unfollow", "mc.cancel": "Cancel", "mc.confirm": "Unfollow",
    "mc.loaded": "Loaded {b}", "mc.sel": "Selected {b}", "mc.oneway": "Not following back {b}",
    "mc.quota": "This hour {b} / {limit}", "mc.done": "Unfollowed {b}",
    "mc.onlyOneway": "Not following back", "mc.all": "All", "mc.selAll": "Select all non-mutual", "mc.clear": "Clear",
    "mc.go": "Unfollow selected", "mc.goN": "Unfollow selected ({n})",
    "mc.full": "Hourly limit of {limit} reached · resume in {m} min",
    "mc.warn": "⚠️ Max {limit} unfollows per hour, then it pauses to lower the risk of account limits",
    "mc.progress": "Unfollowing…", "mc.progressH": "Unfollowing @{h}", "mc.stop": "Stop", "mc.dismiss": "Got it",
    "mc.hint": "Scroll down to load more. Only loaded accounts are processed", "mc.left": "{n} left to process",
    "mc.desc": "Unfollow {b} accounts",
    "mc.noteOver": "{left} left this hour, then it pauses and you can continue later · about {sec}s apart · cannot be undone",
    "mc.note": "About {sec}s apart, stop anytime · cannot be undone",
    "mc.resOk": "Done! Unfollowed {b}", "mc.resFail": ", failed {b}",
    "mc.resMissing": ", {n} scrolled out of the list, scroll back to retry", "mc.resStopped": ", stopped manually",
    "mc.resPaused": ", paused at the hourly limit of {limit}, resume in about {m} min",
  };

  // AI 检测规则名:规则本身按语言写成中文或英文,这里补齐另一种语言
  const RULES = {
    zh: {
      "en.assistant": "助手腔泄露", "en.emphasis": "强调套话", "en.opener": "宏大开场", "en.testament": "“见证/作为…”",
      "en.role": "“起关键作用”", "en.not_but": "不只是…而是…", "en.hook": "钩子短语", "en.summary": "总结套话",
      "en.cliche": "营销套话", "en.whether": "无论你是…还是…", "en.faux": "伪洞见", "en.colon": "冒号揭晓",
      "en.neglist": "否定排比", "en.fragment": "戏剧化碎句", "en.imagine": "想象开头", "en.weasel": "模糊权威",
      "en.stakes": "夸大影响", "en.bait": "引流腔", "en.vocab": "AI 高频词",
      "en.praise": "万能夸夸回复", "en.ask": "结尾求互动",
    },
    en: {
      "zh.ai_self": "AI self-reference", "zh.emphasis": "Emphasis filler", "zh.summary": "Summary filler",
      "zh.opener": "Grand opener", "zh.guide": "Guiding phrase", "zh.closing": "Help-desk closing",
      "zh.steps": "First / next / finally", "zh.not_but": "Not X but Y", "zh.transition": "Stacked transitions",
      "zh.hollow": "Hollow praise", "zh.promo": "Hype wording", "zh.jargon": "Corporate jargon",
      "zh.deep": "“In-depth” filler", "zh.concede": "False concession", "zh.contrast": "Forced contrast",
      "zh.motto": "Slogan ending", "zh.therefore": "“Clearly, …”", "zh.inflate": "Inflated significance",
      "zh.weasel": "Vague authority", "zh.preview": "Preview transition", "zh.feeling": "Emotion teaser",
      "zh.rhetoric": "Self Q&A", "zh.we": "Reader alignment", "zh.whoever": "Whether…or…",
      "zh.range": "False range", "zh.verb": "Empty verbs", "zh.bait": "Engagement bait",
      "zh.not_only": "Not only X, but Y", "zh.praise": "Generic praise reply", "zh.ask": "Engagement question",
      "zh.echo": "Agreeable opener", "zh.outlook": "Outlook ending", "zh.trend": "Trend cliché",
      "zh.essence": "“Essentially / behind it”", "zh.keypoint": "“The key is…”", "zh.balance": "Both-sides hedging",
      "zh.vocab": "Formal buzzwords", "zh.punct": "Formal punctuation",
      "x.bold": "Markdown bold", "x.dash": "Many dashes", "x.emoji_list": "Emoji list",
      "x.num_list": "Numbered list", "x.heading": "Subheadings", "x.hashtags": "Hashtag stacking",
      "en.vocab": "AI buzzwords",
    },
  };

  const DICT = { zh, en };
  let cur = "zh";

  // pref: 设置里的 auto / zh / en;hint: 页面或浏览器的语言标记(如 X 的 <html lang>)
  function resolve(pref, hint) {
    if (LANGS.includes(pref)) return pref;
    return /^zh\b/i.test(String(hint || "")) ? "zh" : "en";
  }

  function setLang(l) { cur = LANGS.includes(l) ? l : "zh"; return cur; }
  function lang() { return cur; }

  function t(key, vars, l) {
    const d = DICT[l || cur] || zh;
    let s = d[key] ?? zh[key] ?? key;
    if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? String(vars[k]) : m));
    return s;
  }

  function ruleLabel(id, fallback, l) {
    const m = RULES[l || cur];
    return (m && m[id]) || fallback;
  }

  // 把含 {b} 占位符的文案拆成 [文本, 节点, 文本...],给 replaceChildren 用;节点按顺序填入
  function parts(key, vars, nodes, l) {
    const out = [];
    const segs = t(key, vars, l).split("{b}");
    segs.forEach((s, i) => {
      if (s) out.push(s);
      if (i < segs.length - 1 && nodes[i]) out.push(nodes[i]);
    });
    return out;
  }

  const api = { LANGS, DICT, RULES, resolve, setLang, lang, t, ruleLabel, parts };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.SnowXI18n = api;
})(typeof window !== "undefined" ? window : globalThis);
