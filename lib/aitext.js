// AI 文本检测:纯本地规则打分,不发任何请求。
// 中文规则和英文规则同时跑,各自只会命中对应语言的写法;另有一组与语言无关的排版规则。
// 分数 0-100,越高越像套路化的 AI 文本。这是启发式判断,不是概率,只用于提示。
(function (root) {
  "use strict";

  const MAX_LEN = 4000;   // 只看前 4000 字符
  const MIN_SIZE = 10;    // 有效长度(汉字数 + 英文词数 × 2)不足时不打分,太短判断不了
  const SHORT = 140;      // 有效长度低于此值算短推,排版规则打折
  const STRONG = 75;      // 达到即"很像 AI"
  const CURVE = 20;       // 分数曲线基准:原始分 20 约对应 63 分。0.6.x 用 32,真实推文几乎到不了 50
  const LEVEL_NAMES = ["不明显", "疑似 AI", "很像 AI"];

  function levelOf(score) {
    if (score >= STRONG) return 2;
    if (score >= 40) return 1;
    return 0;
  }

  // ---------- 规则 ----------
  // 正则规则:{ id, label, lang, re, w, first?, kind? }。
  // 命中 n 次的得分 = w × (1 + min(n-1, 2) × 0.5);设了 first 的规则只命中 1 次时按 first 计,
  // 用于"偶尔用一次是正常修辞,反复用才是套路"的句式。
  // kind = "bait" 表示引流腔:营销号也常这么写,不一定是 AI,单独列出并只按 BAIT_RATE 计入总分。
  const rx = (id, label, lang, re, w, opt) => Object.assign({ id, label, lang, re, w, kind: "ai" }, opt);
  const BAIT_RATE = 0.4;

  const ZH_RULES = [
    rx("zh.ai_self", "AI 自述", "zh", /作为(?:一个|一名)?(?:AI|人工智能|语言模型|AI助手)|我是(?:一个)?(?:AI|人工智能)(?:助手|模型)/gi, 30),
    rx("zh.emphasis", "强调套话", "zh", /值得注意的是|需要指出的是|值得一提的是|不可忽视的是|需要强调的是|毋庸置疑/g, 9),
    rx("zh.summary", "总结套话", "zh", /综上所述|总而言之|总的来说|简而言之|一言以蔽之|归根结底|总结一下/g, 8),
    rx("zh.opener", "宏大开场", "zh", /在当今[^。！？\n]{0,12}(?:时代|世界|社会|背景下)|在这个[^。！？\n]{0,10}(?:时代|世界)|在[^。！？\n，,]{1,14}的今天|随着[^。！？\n]{1,16}的(?:快速|飞速|不断|持续|蓬勃|迅猛)发展/g, 11),
    rx("zh.guide", "引导语", "zh", /让我们(?:一起)?(?:来)?(?:看看|探讨|深入|了解|拭目以待|一探究竟)|一起来看看|下面(?:我们)?(?:就)?(?:来|将)(?:详细|简单)?(?:介绍|分析|聊聊|探讨|拆解)/g, 7),
    rx("zh.closing", "客服式结尾", "zh", /希望(?:这篇|本文|以上|这些|这条|这份)?[^。！？\n]{0,8}(?:对你|对大家|能帮到|有所帮助|有帮助|有所启发)/g, 10),
    rx("zh.steps", "首先/其次/最后", "zh", /首先[\s\S]{1,300}?其次[\s\S]{1,300}?(?:最后|再次|此外)/g, 10),
    rx("zh.not_but", "不是…而是…", "zh", /不是[^。！？\n]{1,16}?[，,]\s*而是|与其说[^。！？\n]{1,20}?[，,]?\s*不如说|(?:重点|关键|问题|核心|答案)不在(?:于)?[^。！？\n]{1,16}?[，,]\s*而在|这不是[^。！？\n]{1,12}?的问题[，,]\s*(?:而)?是/g, 6, { first: 3 }),
    rx("zh.not_only", "不仅仅是…更是…", "zh", /不仅仅?是[^。！？\n]{1,20}?[，,]?\s*更是/g, 7),
    rx("zh.praise", "万能夸夸回复", "zh", /说得(?:太|真|非常)(?:好|对|到位)了?|(?:非常|很|极)有见地|值得(?:深思|思考|我们深思)|发人深省|受益匪浅|很有启发|深有同感|一针见血|期待[^。！？\n]{0,10}?(?:更多|后续)[^。！？\n]{0,10}?(?:分享|内容|输出)|感谢(?:您的|你的)?分享/g, 7),
    rx("zh.ask", "结尾求互动", "zh", /(?:你|您|大家|你们)(?:怎么看|觉得呢|有什么看法|是怎么想的|有什么想法)[？?]?\s*$|欢迎(?:在)?评论区(?:留言|交流|讨论|分享)/g, 4),
    rx("zh.transition", "过渡词堆叠", "zh", /不仅如此|更重要的是|与此同时|除此之外|另一方面|此外/g, 4),
    rx("zh.hollow", "空泛评价", "zh", /发挥着?(?:重要|关键|至关重要|不可替代)的?作用|扮演着?(?:重要|关键|不可或缺)的?角色|不容忽视的(?:力量|作用)|提供了?(?:新的)?(?:思路|视角|可能)/g, 7),
    rx("zh.promo", "夸张修饰", "zh", /至关重要|不可或缺|举足轻重|重中之重|里程碑式?|划时代|革命性|颠覆性|前所未有|无与伦比|彰显|诠释了?|独特魅力|深度剖析|全方位|多维度|一站式|无缝衔接/g, 5),
    rx("zh.jargon", "互联网黑话", "zh", /赋能|抓手|闭环|底层逻辑|颗粒度|方法论|护城河|降本增效|全链路|生态位|心智模型|打通壁垒|凝聚共识|压实责任|形成合力|组合拳|破圈|新范式|范式转移|拥抱变化/g, 5),
    rx("zh.deep", "“深入/深刻”", "zh", /深入探讨|深入了解|深入浅出|深刻地?(?:改变|影响|理解|认识)/g, 4),
    rx("zh.concede", "虚假让步", "zh", /(?:当然|固然|诚然|确实)[^。！？\n]{0,20}?(?:重要|有用|没错|有道理|值得肯定)[^。！？\n]{0,4}?[。，,；;]\s*(?:但|然而|不过|问题是|可是)|(?:这没有错|这没错|无可厚非)[。，,]\s*(?:但|问题是|关键是|可是)|不可否认[^。！？\n]{0,30}?[，,]\s*(?:但|然而|不过)/g, 7),
    rx("zh.contrast", "刻意对比", "zh", /一字之差|差(?:了)?一个字|听起来像(?:是)?一回事|看似(?:相同|一样|相似|简单)[^。！？\n]{0,12}?(?:实则|其实|实际上)|天壤之别|云泥之别/g, 7),
    rx("zh.motto", "伪金句收尾", "zh", /不是终点[，,]\s*而是(?:新的)?起点|未来已来|未来可期|愿我们(?:都|一起|共同)?|让我们(?:共同|一起)(?:期待|见证|拥抱|迎接|努力)|(?:唯有|只有)[^。！？\n]{1,12}?[，,]\s*方能|行稳致远|(?:新|下一个)[^。！？\n]{0,6}?时代(?:已经|正在)?(?:到来|来临)/g, 9),
    rx("zh.therefore", "“由此可见”", "zh", /由此可见|由此(?:可以)?看出|这充分(?:说明|体现|证明|表明)|不难(?:发现|看出)|不言而喻|显而易见/g, 5),
    rx("zh.inflate", "意义拔高", "zh", /标志着[^。！？\n]{0,16}?(?:进入|迈入|开启|到来|新阶段|新时代|转折)|(?:开启|翻开|谱写)了?[^。！？\n]{0,8}?新(?:的)?(?:篇章|纪元|征程)|全新纪元|历史性(?:时刻|突破|一刻)/g, 7),
    rx("zh.weasel", "模糊权威", "zh", /业界普遍认为|业内(?:人士)?(?:普遍)?(?:指出|认为|表示)|(?:很多|许多|不少)?专家(?:普遍|一致)?认为|有研究(?:表明|显示|指出)|研究表明|众所周知/g, 6),
    rx("zh.preview", "预告式过渡", "zh", /(?:至少|主要)有[两三四五六七八九十几]+(?:件事|个(?:方面|关键|要点|原因|启示|变化|层面|维度))|有以下[两三四五六七八九十几]+(?:点|个)|(?:接下来|下面)(?:我们)?(?:从|分)[两三四五几]+个(?:方面|角度|维度)|这里有几个关键/g, 6),
    rx("zh.feeling", "情绪预告", "zh", /(?:让我|令我|给我)印象最深(?:刻)?的是|最让人(?:意外|惊讶|震撼|感慨)的是|最大的(?:感受|感触|收获)是/g, 6),
    rx("zh.rhetoric", "自问自答", "zh", /这意味着什么[？?]|为什么(?:说)?(?:这|这一点)(?:很|如此|非常)?重要[？?]|那么问题来了|答案(?:很简单|是肯定的)|原因(?:其实)?很简单/g, 5),
    rx("zh.we", "拉读者站队", "zh", /我们不得不承认|我们都知道|我们必须(?:认识到|承认)|作为[^。！？\n，,]{1,8}?(?:人|者)[，,]\s*我们/g, 6),
    rx("zh.whoever", "无论…都…", "zh", /无论(?:你|您)?是[^。！？\n]{1,20}?还是[^。！？\n]{1,20}?[，,]?\s*(?:都|均)/g, 6),
    rx("zh.range", "假范围", "zh", /从[^。！？\n，,、]{1,10}?到[^。！？\n，,、]{1,10}?[，,、]\s*(?:再)?从[^。！？\n，,、]{1,10}?到/g, 6),
    rx("zh.verb", "空动词", "zh", /(?:助力|打造|构建|推动|赋能)[^。！？\n，,]{0,6}?(?:高质量)?(?:发展|转型|升级|增长|突破)/g, 4),
    // ---- X 上 AI 回复机器人的短回复腔调:附和开头 + 趋势/本质/关键 + 两面平衡 + 展望收尾 ----
    rx("zh.echo", "附和式开头", "zh", /^\s*(?:这个(?:观点|思路|想法|角度|分享)(?:很|非常|太|真)?(?:有意思|棒|好|独到|新颖|有启发)|很有意思的(?:观点|分享|角度|思路|话题|对比)|(?:完全|非常|十分)同意(?:你的|您的)?(?:看法|观点)?|同意你的(?:看法|观点)|确实如此|的确如此|说得没错|好问题|这是一个(?:很|非常)?(?:好|有意思|有趣|值得思考|值得关注)的(?:问题|观点|话题|趋势)|很(?:实用|有用|有价值|棒)的(?:分享|工具|推荐|总结|内容|思路))[^，,。！!\n]{0,4}[，,。！!～~]/g, 7),
    rx("zh.outlook", "展望式收尾", "zh", /未来(?:可能|或许|也许|有望|将会?|会)[^。！？\n]{2,24}|值得(?:持续|长期|进一步)?(?:关注|期待)|拭目以待|(?:还有|仍有|存在)(?:很大的?|一定的?|不少)?(?:提升|进步|改进|优化|成长)(?:的)?空间|(?:很|非常|极|挺)有潜力|潜力巨大|前景(?:广阔|可期|光明)|任重道远|期待看到更多/g, 6),
    rx("zh.trend", "趋势套话", "zh", /随着[^。！？\n]{0,10}的不断(?:进步|发展|成熟|迭代|完善)|技术的(?:进步|发展)(?:让|使|使得)|门槛(?:正在|不断|越来越)[^。！？\n]{0,4}降低|越来越难以(?:分辨|区分|辨别)|(?:正在|不断)(?:重塑|颠覆|倒逼|改变着)|越来越接近(?:真人|人类)/g, 6),
    rx("zh.essence", "“本质上/背后反映”", "zh", /本质上(?:是|就是|来说|讲)?|说到底|归根到底|从某种(?:程度|意义)上(?:说|讲|来说)?|(?:某种|一定)程度上|(?:这)?背后(?:反映|折射|体现)(?:的)?(?:其实)?(?:是|出|了)|背后的(?:商业)?逻辑|折射出/g, 5),
    rx("zh.keypoint", "“关键在于”", "zh", /(?:关键|核心|重点|难点)(?:还是|其实)?在于|真正的?(?:壁垒|门槛|护城河|关键|核心|难点|价值|稀缺)[^。！？\n]{0,4}?(?:从来)?(?:是|在于|不是)|才是(?:真正的?)?(?:关键|核心|王道|根本)|这一点(?:非常|很|至关)?(?:关键|重要)/g, 6),
    rx("zh.balance", "两面平衡", "zh", /各有(?:千秋|优劣|利弊|所长)|见仁见智|因人而异|(?:具体|最终)(?:还是|还得)?(?:要)?(?:取决于|看)|有利有弊|需要(?:理性|辩证|客观)(?:地)?看待|在实际(?:落地|应用|使用)(?:的过程)?中|可能还需要考虑/g, 6),
    rx("zh.bait", "引流腔", "zh", /干货满满|建议收藏|赶紧收藏|速速收藏|先码住|码住|深度好文|一文(?:读懂|看懂|搞懂|讲透)|保姆级|99%的人(?:都)?不知道|一定要看到最后|看到最后|亲测有效|绝绝子|谁懂啊|姐妹们|家人们|我不允许你还不知道|转发给(?:你|身边)?(?:需要|有需要)的(?:人|朋友)/g, 6, { kind: "bait" }),
  ];

  const EN_RULES = [
    rx("en.assistant", "Assistant leak", "en", /\bas an ai\b|\bas a (?:large )?language model\b|\bi hope this helps\b|\bgreat question\b|\bfeel free to (?:ask|reach out)\b/gi, 20),
    rx("en.emphasis", "Emphasis filler", "en", /\bit(?:'|’)?s (?:important|worth|crucial|essential) (?:to note|noting|to remember|mentioning|to understand)\b|\bit is worth noting\b/gi, 10),
    rx("en.opener", "Grand opener", "en", /\bin today(?:'|’)?s (?:[a-z-]+ ){0,2}(?:world|landscape|age|era|society)\b|\bin the (?:realm|world|landscape) of\b|\bin a world where\b/gi, 10),
    rx("en.testament", "Testament / serves as", "en", /\b(?:serves|stands) as an? (?:testament|reminder|beacon|cornerstone|catalyst)\b|\ba testament to\b/gi, 10),
    rx("en.role", "Plays a crucial role", "en", /\bplays? an? (?:crucial|pivotal|vital|key|significant|critical) role\b/gi, 8),
    rx("en.not_but", "Not just X, but Y", "en", /\bnot (?:just|only|merely) [^.!?\n]{1,40}?,? but\b|\bit(?:'|’)?s not (?:just|only) about\b/gi, 7, { first: 4 }),
    rx("en.hook", "Hook phrase", "en", /\blet(?:'|’)?s (?:dive|delve|explore|unpack|break (?:it|this) down)\b|\bdeep dive\b|\bbuckle up\b|\bhere(?:'|’)?s (?:the thing|why|what you need to know|how)\b/gi, 7),
    rx("en.summary", "Summary filler", "en", /\bin (?:conclusion|summary)\b|\bto sum (?:it )?up\b|\bkey takeaways?\b|\bthe bottom line\b/gi, 8),
    rx("en.cliche", "Promo cliché", "en", /\bunlock (?:the |your )?(?:full )?potential\b|\btake (?:it|your [a-z]+) to the next level\b|\bnavigate the complexities\b|\bever-changing landscape\b|\bgame[- ]changer\b/gi, 9),
    rx("en.whether", "Whether you're X or Y", "en", /\bwhether you(?:'|’)?re an? [^.!?\n]{1,30}? or\b/gi, 6),
    rx("en.praise", "Generic praise reply", "en", /\bgreat (?:point|insight|perspective|thread|post)s?\b|\bfascinating (?:perspective|insight|read|take)\b|\bthanks for sharing\b|\bwell said\b|\bcouldn(?:'|’)?t agree more\b|\bthis is (?:so |really )?(?:insightful|spot on|thought-provoking)\b|\bmeaningful (?:conversations?|discussions?|dialogue)\b|\bevolving landscape\b/gi, 8),
    rx("en.ask", "Engagement question", "en", /\b(?:what do you think|what are your thoughts|thoughts)\s*\?\s*$|\bdrop (?:your thoughts|a comment) below\b/gi, 4),
    rx("en.faux", "Faux insight", "en", /\bwhat nobody (?:tells you|talks about)\b|\bthe part (?:everyone|most people) miss(?:es)?\b|\bhere(?:'|’)?s the kicker\b|\blet me be (?:clear|honest)\b|\bhere(?:'|’)?s what most people (?:miss|get wrong)\b/gi, 8),
    rx("en.colon", "Colon reveal", "en", /\bthe (?:best|worst|real|crazy|wild|scary) part\s*[:：]|\bthe (?:catch|twist|secret|kicker)\s*[:：]/gi, 6),
    rx("en.neglist", "Not X. Not Y. Z.", "en", /\bnot an? [^.!?\n]{1,25}?\.\s*not an? [^.!?\n]{1,25}?\.\s*(?:an?|it(?:'|’)?s) \w/gi, 8),
    rx("en.fragment", "Dramatic fragment", "en", /\bthat(?:'|’)?s it\.\s*that(?:'|’)?s (?:the whole|all)\b|\blet that sink in\b|\bread that again\b/gi, 7),
    rx("en.imagine", "Imagine / think of it as", "en", /\bimagine a (?:world|future) where\b|\bthink of it (?:as|like)\b/gi, 7),
    rx("en.weasel", "Vague attribution", "en", /\bexperts (?:agree|say|believe)\b|\bstudies (?:show|suggest|have shown)\b|\bresearch shows\b|\bmany (?:experts|people) believe\b/gi, 6),
    rx("en.stakes", "Stakes inflation", "en", /\bfundamentally (?:reshape|change|transform)s?\b|\bdefine the next (?:era|decade|generation)\b|\bchanges? everything\b|\bthe future (?:isn(?:'|’)?t coming|is (?:already )?here)\b/gi, 8),
    rx("en.bait", "Engagement bait", "en", /\bthread\s*🧵|🧵\s*(?:👇|⬇️)|\bbookmark (?:this|it)\b|\byou won(?:'|’)?t believe\b|\bmost people (?:don(?:'|’)?t|won(?:'|’)?t) know\b|\bfollow (?:me )?for more\b|\brt if\b|\bsave this (?:post|thread)\b/gi, 6, { kind: "bait" }),
  ];

  // 英文 AI 高频词:每个词单独计分,合并成一条命中
  const EN_WORDS = [
    ["delve", 14], ["tapestry", 16], ["testament", 8], ["pivotal", 9], ["realm", 7], ["multifaceted", 10],
    ["intricate", 6], ["seamless", 7], ["leverage", 6], ["harness", 5], ["elevate", 6], ["myriad", 8],
    ["plethora", 8], ["meticulous", 8], ["paradigm", 6], ["holistic", 6], ["groundbreaking", 8],
    ["transformative", 7], ["unleash", 7], ["embark", 8], ["foster", 5], ["synergy", 8], ["bolster", 6],
    ["underscore", 7], ["showcase", 6], ["navigate", 4], ["vibrant", 6], ["resonate", 6], ["captivating", 7],
    ["invaluable", 5], ["landscape", 5], ["robust", 4], ["crucial", 3], ["nuanced", 5], ["empower", 6],
    ["streamline", 5], ["ever-evolving", 9], ["cutting-edge", 6], ["furthermore", 5], ["moreover", 5],
    ["additionally", 4],
  ];

  // 中文书面化高频词:AI 回复爱用、真人随手回复少用。单个词很常见,至少命中 2 个不同的词才计分
  const ZH_WORDS = [
    ["显著", 3], ["进一步", 3], ["有效提升", 3], ["日益", 3], ["愈发", 3], ["不容小觑", 4], ["不可小觑", 4],
    ["抢占先机", 4], ["长期价值", 3], ["实际应用", 3], ["应用场景", 3], ["使用场景", 2], ["表现力", 2],
    ["节省不少时间", 3], ["面临更大的挑战", 4], ["挑战与机遇", 4], ["机遇与挑战", 4], ["整个行业", 3],
    ["行业来说", 3], ["对于刚入门", 3], ["更加全面", 3], ["更全面", 2], ["更稳定", 2], ["明显提升", 3],
    ["不断进步", 2], ["持续关注", 3], ["深远影响", 4], ["全新的", 2], ["效率革命", 3], ["表面的", 2],
  ];
  const ZH_WORD_MIN = 2;

  // 口语信号:真人随手回复的标志。命中时整体分数打七折,减少把吐槽、玩梗当成 AI 的情况
  const ZH_CASUAL = /笑死|卧槽|我草|草了|艹|特么|tmd|啥|咋|俺|贼[好快难贵]|哥们|属于是|白搭|烦死|劝退|离谱|绷不住|蚌埠住|整活|hhh|233|呜呜|emm|你说是吧|吧[。！？!?]?\s*$|啊[。！？!?]?\s*$|呢[？?]?\s*$|哈哈哈|[?？]{2,}/i;

  // 书面标点:短回复写成两句以上、句句完整标点并以句号/叹号收尾,在 X 的随手回复里不常见
  function formalPunct(text, cjk) {
    const t = text.trim();
    if (cjk < 20) return false;
    const stops = (t.match(/[。！]/g) || []).length;
    const commas = (t.match(/[，、；]/g) || []).length;
    return /[。！]$/.test(t) && stops >= 2 && commas >= 1;
  }

  function wordForms(w) {
    if (w.includes("-")) return [w];
    const forms = new Set([w, w + "s", w + "ly"]);
    if (w.endsWith("e")) { forms.add(w + "d"); forms.add(w.slice(0, -1) + "ing"); }
    else { forms.add(w + "ed"); forms.add(w + "ing"); }
    if (/[^aeiou]y$/.test(w)) forms.add(w.slice(0, -1) + "ies");
    return [...forms];
  }
  const EN_WORD_RES = EN_WORDS.map(([w, pts]) => ({
    word: w, pts,
    re: new RegExp("\\b(?:" + wordForms(w).sort((a, b) => b.length - a.length).join("|").replace(/-/g, "[-\\s]?") + ")\\b", "gi"),
  }));

  // 排版规则(与语言无关):{ id, label, w, min, count(text, lines) -> { n, sample } }
  const EMOJI_LINE = /^\s*\p{Extended_Pictographic}/u;
  const LIST_LINE = /^\s*(?:\d{1,2}[.、)）]|[①②③④⑤⑥⑦⑧⑨⑩]|第[一二三四五六七八九十]+[，,、：:点步])/;
  const LAYOUT_RULES = [
    { id: "x.bold", label: "Markdown 加粗", w: 8, min: 1,
      count: (t) => { const m = t.match(/\*\*[^*\n]{1,40}\*\*/g) || []; return { n: m.length, sample: m[0] }; } },
    { id: "x.dash", label: "破折号偏多", w: 6, min: 2,
      count: (t) => { const m = t.match(/——|—/g) || []; return { n: m.length, sample: "—" }; } },
    { id: "x.emoji_list", label: "表情符号列表", w: 8, min: 3,
      count: (t, lines) => { const l = lines.filter((s) => EMOJI_LINE.test(s)); return { n: l.length, sample: l[0] }; } },
    { id: "x.num_list", label: "编号列表", w: 5, min: 3,
      count: (t, lines) => { const l = lines.filter((s) => LIST_LINE.test(s)); return { n: l.length, sample: l[0] }; } },
    { id: "x.heading", label: "小标题", w: 5, min: 2,
      count: (t, lines) => {
        const l = lines.filter((s) => /^\s*【[^】]{1,20}】/.test(s) || (/[:：]\s*$/.test(s) && s.trim().length <= 20));
        return { n: l.length, sample: l[0] };
      } },
    { id: "x.hashtags", label: "话题标签堆叠", w: 4, min: 3,
      count: (t) => { const m = t.match(/#[\p{L}\p{N}_]+/gu) || []; return { n: m.length, sample: m.slice(0, 3).join(" ") }; } },
  ];

  // ---------- 工具 ----------
  function clean(raw) {
    return String(raw || "")
      .slice(0, MAX_LEN)
      .replace(/\r/g, "")
      .replace(/https?:\/\/\S+/g, " ")
      .replace(/(^|[\s(（])@[A-Za-z0-9_]{1,15}/g, "$1");
  }

  // 引号、书名号里的内容多半是在引用或点评别人的话(比如吐槽"值得注意的是"这种写法),不算作者自己的写法。
  // 只把引号里的内容换成占位符,引号本身保留,"不是“A”,而是“B”"这类句式仍然能被识别。
  const QUOTE_RES = [/“[^“”\n]{1,120}”/g, /「[^「」\n]{1,120}」/g, /『[^『』\n]{1,120}』/g, /《[^《》\n]{1,60}》/g, /"[^"\n]{1,120}"/g];
  function stripQuotes(t) {
    let s = t;
    for (const re of QUOTE_RES) s = s.replace(re, (m) => m[0] + "□" + m[m.length - 1]);
    return s;
  }

  const trim = (s, n) => {
    const t = String(s || "").replace(/\s+/g, " ").trim();
    return t.length > n ? t.slice(0, n) + "…" : t;
  };

  // 同一条规则命中的多个不同片段,最多展示 3 个
  function samplesOf(matches) {
    const out = [];
    for (const m of matches) {
      const s = trim(m, 22);
      if (s && !out.includes(s)) out.push(s);
      if (out.length >= 3) break;
    }
    return out.join(" / ");
  }

  const ptsOf = (w, n) => w * (1 + Math.min(n - 1, 2) * 0.5);

  // ---------- 主函数 ----------
  // 返回 null(太短)或 { score, level, lang, size, hits: [{ id, label, lang, n, pts, sample }] }
  function detect(rawText) {
    const text = clean(rawText);
    const cjk = (text.match(/[\u3400-\u9fff]/g) || []).length;
    const words = (text.match(/[A-Za-z][A-Za-z'’-]*/g) || []).length;
    const size = cjk + words * 2;
    if (size < MIN_SIZE) return null;

    const lines = text.split("\n").filter((s) => s.trim());
    const hits = [];
    const bait = [];
    const body = stripQuotes(text);

    for (const r of ZH_RULES.concat(EN_RULES)) {
      r.re.lastIndex = 0;
      const m = body.match(r.re);
      if (!m || !m.length) continue;
      const pts = m.length === 1 && r.first != null ? r.first : ptsOf(r.w, m.length);
      (r.kind === "bait" ? bait : hits).push({ id: r.id, label: r.label, lang: r.lang, kind: r.kind, n: m.length, pts, sample: samplesOf(m) });
    }

    const words_ = [];
    let wordPts = 0, wordN = 0;
    for (const w of EN_WORD_RES) {
      w.re.lastIndex = 0;
      const m = body.match(w.re);
      if (!m) continue;
      wordN += m.length;
      wordPts += w.pts * (m.length > 1 ? 1.5 : 1);
      words_.push(m[0].toLowerCase());
    }
    if (wordN) hits.push({ id: "en.vocab", label: "AI 高频词", lang: "en", kind: "ai", n: wordN, pts: wordPts, sample: words_.slice(0, 4).join(", ") });

    const zhw = ZH_WORDS.filter(([w]) => body.includes(w));
    if (zhw.length >= ZH_WORD_MIN) {
      hits.push({ id: "zh.vocab", label: "书面化高频词", lang: "zh", kind: "ai", n: zhw.length, pts: zhw.reduce((s, [, p]) => s + p, 0), sample: zhw.slice(0, 4).map(([w]) => w).join("、") });
    }
    // 书面标点单独出现不说明问题,只在已有明确中文套路(合计至少 6 分)时作为加分项
    const zhPts = hits.filter((h) => h.lang === "zh").reduce((s, h) => s + h.pts, 0);
    if (zhPts >= 6 && formalPunct(text, cjk)) {
      hits.push({ id: "zh.punct", label: "书面标点", lang: "zh", kind: "ai", n: 1, pts: 3, sample: trim(text.trim().slice(-12), 14) });
    }

    // 短推里一两处加粗、列表很常见,排版规则在短文本里打折;句式规则不打折
    const layoutRate = size < SHORT ? 0.6 : 1;
    for (const r of LAYOUT_RULES) {
      const { n, sample } = r.count(text, lines);
      if (n < r.min) continue;
      const extra = n - r.min + 1;
      hits.push({ id: r.id, label: r.label, lang: "any", kind: "ai", n, pts: ptsOf(r.w, extra) * layoutRate, sample: trim(sample, 22) });
    }

    let raw = hits.reduce((s, h) => s + h.pts, 0);
    if (hits.length >= 4) raw *= 1.15; // 多种套路同时出现,比单一套路更说明问题
    if (cjk >= words && ZH_CASUAL.test(body)) raw *= 0.7; // 中文口语、玩梗,多半是真人随手写的
    raw += bait.reduce((s, h) => s + h.pts, 0) * BAIT_RATE; // 引流腔只少量计入,不参与"多种套路"加成
    // 推文普遍很短,能命中的套路有限:曲线按 20 分基准收敛(长文本再按长度的平方根放宽,避免"凑"到命中)
    const norm = Math.max(1, Math.sqrt(size / 120));
    const score = Math.min(100, Math.round(100 * (1 - Math.exp(-raw / (CURVE * norm)))));
    for (const list of [hits, bait]) {
      list.sort((a, b) => b.pts - a.pts);
      for (const h of list) h.pts = Math.round(h.pts * 10) / 10;
    }

    return {
      score,
      level: levelOf(score),
      lang: cjk >= words ? "zh" : "en",
      size,
      hits,
      bait,
    };
  }

  const api = { detect, levelOf, stripQuotes, LEVEL_NAMES, STRONG, MIN_SIZE };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.SnowXAiText = api;
})(typeof window !== "undefined" ? window : globalThis);
