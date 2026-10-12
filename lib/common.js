// 内容脚本和弹窗共用的运行时工具:设置读写、页面深浅色判断、事件拦截。
// 纯计算逻辑放在 parse.js(可单测),这里只放依赖 chrome / DOM 的部分。
(function (root) {
  "use strict";
  const P = root.SnowXParse;
  const SETTINGS_KEY = "sxa_settings";
  const storage = (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) || null;

  // 读一次设置;没有扩展环境(本地测试页)时直接给默认值
  function loadSettings(cb) {
    if (!storage) { cb(P.mergeSettings()); return; }
    storage.get(SETTINGS_KEY, (r) => cb(P.mergeSettings(r && r[SETTINGS_KEY])));
  }

  // 设置在别处(弹窗 / 其它标签页)被修改时回调
  function onSettingsChange(cb) {
    if (!storage) return;
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "local" && changes[SETTINGS_KEY]) cb(P.mergeSettings(changes[SETTINGS_KEY].newValue));
    });
  }

  function saveSettings(s) {
    if (storage) storage.set({ [SETTINGS_KEY]: s });
  }

  // 按 body 背景亮度判断 X 当前是否深色主题;取不到时返回 null
  function pageIsDark() {
    if (!document.body) return null;
    const m = getComputedStyle(document.body).backgroundColor.match(/\d+/g);
    if (!m) return null;
    return (+m[0] * 299 + +m[1] * 587 + +m[2] * 114) / 1000 < 128;
  }

  // 设置里强制了深浅色时直接用,自动时按 X 页面背景判断
  function themeIsDark(s) {
    if (s && s.theme === "dark") return true;
    if (s && s.theme === "light") return false;
    return pageIsDark();
  }

  // 按设置切换界面语言。自动时跟随 X 的 <html lang>(X 按账号界面语言设置),取不到再看浏览器语言
  function applyLang(s, hint) {
    const I = root.SnowXI18n;
    if (!I) return "zh";
    const h = hint || (document.documentElement && document.documentElement.lang) || (typeof navigator !== "undefined" ? navigator.language : "");
    return I.setLang(I.resolve(s && s.lang, h));
  }

  // 让这些事件停在 el 上,不冒泡给 X(避免触发跳转、资料悬浮卡等)
  function stopEvents(el, events) {
    for (const ev of events) el.addEventListener(ev, (e) => e.stopPropagation());
  }

  root.SnowXCommon = { SETTINGS_KEY, storage, loadSettings, onSettingsChange, saveSettings, pageIsDark, themeIsDark, applyLang, stopEvents };
})(typeof window !== "undefined" ? window : globalThis);
