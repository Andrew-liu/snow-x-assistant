// 统一标签的 DOM 构建,内容脚本和弹窗预览共用,保证两边长得一模一样。
// 视觉由 data-sxa-skin 主题决定(样式在 content.css),结构对所有主题一致。
(function (root) {
  "use strict";
  const P = root.SnowXParse;


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

  // opts: { user, stat, tweet, settings, now, compact }
  // 账号部分受 tagsEnabled 控制,流速受 showVelocity 独立控制。返回 { wrap, list } 或 null
  function build(opts) {
    const { stat, tweet, settings: s, compact } = opts;
    const u = s.tagsEnabled ? opts.user : null;
    const now = opts.now || Date.now();
    const list = u ? P.tags(u, stat, now, s) : [];
    const wrap = el("span", "sxa-badge");
    wrap.dataset.sxaSkin = s.skin || "signal";

    if (u && s.showFollowers) {
      const p = el("span", "sxa-p sxa-f");
      if (s.tierColors) p.dataset.tier = String(P.tier(u.followers));
      p.title = `${u.followers.toLocaleString()} 粉丝`;
      p.append(el("i", "sxa-dot"), el("b", "sxa-n", P.fmt(u.followers)), el("span", "sxa-u", "粉"));
      wrap.append(p);
    }

    if (tweet && s.showVelocity) {
      const v = P.velocityOf(tweet, now);
      if (v !== null) {
        const shown = Math.round(v);
        const lv = P.velocityLevel(shown, s);
        const p = el("span", "sxa-p sxa-v");
        p.dataset.lv = String(lv);
        p.title = `流速 ${shown.toLocaleString()} 浏览/小时 · ${LEVEL_NAMES[lv]}`;
        const ic = icon(lv);
        if (ic) p.append(ic);
        p.append(el("b", "sxa-n", P.fmt(shown)), el("span", "sxa-u", "/h"));
        wrap.append(p);
      }
    }

    if (u && s.showRatio && u.following > 0) {
      const p = el("span", "sxa-p sxa-r");
      p.title = "粉丝 / 关注";
      p.append(el("span", "sxa-u", "比"), el("b", "sxa-n", P.fmtRatio(P.ratioOf(u))));
      wrap.append(p);
    }

    if (!compact) {
      for (const t of list.slice(0, s.maxTags)) {
        wrap.append(el("span", "sxa-p sxa-tag " + (t.cls || "n"), t.text));
      }
    }

    if (!wrap.childElementCount) return null;
    return { wrap, list };
  }

  root.SnowXBadge = { build, icon, el, LEVEL_NAMES };
})(typeof window !== "undefined" ? window : globalThis);
