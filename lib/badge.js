// 统一标签的 DOM 构建,内容脚本和弹窗预览共用,保证两边长得一模一样。
// 视觉由 data-sxa-skin 主题决定(样式在 content.css),结构对所有主题一致。
(function (root) {
  "use strict";
  const P = root.SnowXParse;
  const SVG_NS = "http://www.w3.org/2000/svg";

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }

  // 档位图标:平稳 = 箭头,上升 = 上升折线,爆款 = 火焰
  const ICON_PATHS = [
    { d: "M2 8h10M9 5l3 3-3 3", stroke: true },
    { d: "M2 12l4-4 3 3 5-6M10 5h4v4", stroke: true },
    { d: "M8.6 1c.4 2.6 3.9 4 3.9 7.7A4.5 4.5 0 0 1 8 15a4.3 4.3 0 0 1-4.5-4.3c0-1.9 1-3.1 2-4 .1 1.4.8 2.4 1.6 2.6C6.7 6.8 7 3.4 8.6 1z", stroke: false },
  ];

  function icon(level, big) {
    const spec = ICON_PATHS[level] || ICON_PATHS[0];
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", "0 0 16 16");
    svg.setAttribute("class", "sxa-ic" + (big ? " big" : ""));
    svg.setAttribute("aria-hidden", "true");
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", spec.d);
    if (spec.stroke) {
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", "currentColor");
      path.setAttribute("stroke-width", "2.2");
      path.setAttribute("stroke-linecap", "round");
      path.setAttribute("stroke-linejoin", "round");
    } else {
      path.setAttribute("fill", "currentColor");
    }
    svg.append(path);
    return svg;
  }

  const LEVEL_NAMES = ["平稳", "上升", "爆款"];

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
        p.append(icon(lv), el("b", "sxa-n", P.fmt(shown)), el("span", "sxa-u", "/h"));
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
