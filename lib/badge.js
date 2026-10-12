// 统一标签的 DOM 构建,内容脚本和弹窗预览共用,保证两边长得一模一样。
// 视觉由 data-sxa-skin 主题决定(样式在 content.css),结构对所有主题一致。
(function (root) {
  "use strict";
  const P = root.SnowXParse;
  const I = root.SnowXI18n;
  const tr = (k, v) => (I ? I.t(k, v) : k);
  const lang = () => (I ? I.lang() : "zh");

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }

  // 档位图标:普通档不加图标,升温 / 热门 / 爆款三档统一前置 🚀(亮度由主题样式区分)
  // 返回 null 表示该档不显示图标
  function icon(level, big) {
    if (!(level > 0)) return null;
    const n = el("span", "sxa-rk" + (big ? " big" : ""), P.ROCKET);
    n.setAttribute("aria-hidden", "true");
    return n;
  }

  const LEVEL_NAMES = P.LEVEL_NAMES;

  const levelName = (lv) => tr("lv." + lv);
  const aiLevelName = (lv) => tr("ai.lv." + lv);

  // opts: { user, stat, tweet, ai, settings, now, compact }
  // 账号部分受 tagsEnabled 控制,流速受 showVelocity、AI 检测受 showAiText 独立控制。返回 { wrap, list } 或 null
  function build(opts) {
    const { stat, tweet, settings: s, compact } = opts;
    const u = s.tagsEnabled ? opts.user : null;
    const now = opts.now || Date.now();
    const list = u ? P.tags(u, stat, now, s) : [];
    const wrap = el("span", "sxa-badge");
    wrap.dataset.sxaSkin = s.skin || "signal";
    const L = lang();

    if (tweet && s.showVelocity) {
      const v = P.velocityOf(tweet, now);
      if (v !== null) {
        const shown = Math.round(v);
        const lv = P.velocityLevel(shown, s);
        const p = el("span", "sxa-p sxa-v");
        p.dataset.lv = String(lv);
        p.title = tr("b.vel", { n: shown.toLocaleString(), lv: levelName(lv) });
        const ic = icon(lv);
        if (ic) p.append(ic);
        p.append(el("b", "sxa-n", P.fmtVel(shown, L)), el("span", "sxa-u", "/h"));
        wrap.append(p);
      }
    }

    // AI 检测:开关打开就常驻标签行,显示 0-100%;正文太短(ai.short)显示「–」
    if (opts.ai && s.showAiText) {
      const p = el("span", "sxa-p sxa-ai");
      if (opts.ai.short) {
        p.dataset.lv = "0";
        p.dataset.short = "1";
        p.title = tr("b.aiShort");
        p.append(el("span", "sxa-u", "AI"), el("b", "sxa-n", "–"));
      } else {
        const A = root.SnowXAiText;
        const sc = opts.ai.score;
        const lv = A ? A.levelOf(sc) : sc >= 75 ? 2 : sc >= 40 ? 1 : 0;
        p.dataset.lv = String(lv);
        const top = (opts.ai.hits || []).slice(0, 3).map((h) => (I ? I.ruleLabel(h.id, h.label) : h.label)).join(tr("sep"));
        p.title = tr("b.ai", { s: sc, lv: aiLevelName(lv) }) + (top ? " · " + top : "");
        p.append(el("span", "sxa-u", "AI"), el("b", "sxa-n", sc + "%"));
      }
      wrap.append(p);
    }

    if (u && s.showFollowers) {
      const p = el("span", "sxa-p sxa-f");
      if (s.tierColors) p.dataset.tier = String(P.tier(u.followers));
      p.title = tr("b.followers", { n: u.followers.toLocaleString() });
      p.append(el("i", "sxa-dot"), el("b", "sxa-n", P.fmt(u.followers, L)), el("span", "sxa-u", tr("b.fUnit")));
      wrap.append(p);
    }

    if (u && s.showRatio) {
      const p = el("span", "sxa-p sxa-r");
      p.title = tr("b.ratio");
      p.append(el("span", "sxa-u", tr("b.rUnit")), el("b", "sxa-n", P.fmtFollowingRatio(P.followingRatioOf(u))));
      wrap.append(p);
    }

    if (!compact) {
      for (const t of list.slice(0, s.maxTags)) {
        const text = I ? I.t("tag." + (t.tid || t.key)) : t.text;
        wrap.append(el("span", "sxa-p sxa-tag " + (t.cls || "n"), text));
      }
    }

    if (!wrap.childElementCount) return null;
    return { wrap, list };
  }

  root.SnowXBadge = { build, icon, el, LEVEL_NAMES, levelName, aiLevelName };
})(typeof window !== "undefined" ? window : globalThis);
