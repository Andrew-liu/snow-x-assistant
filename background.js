// 后台:只做两件事,都只响应本扩展自己的消息。
// 1. sxa-resolve:页面缓存里没有视频信息时,请求 X 官方嵌入组件用的公开接口 tweet-result 取视频直链;
// 2. sxa-download:把 video.twimg.com 上的 mp4 交给浏览器下载,存到下载目录的 SnowX 文件夹。
importScripts("lib/parse.js");

(() => {
  "use strict";
  const P = self.SnowXParse;
  const CACHE_MAX = 200;
  const CACHE_TTL = 10 * 60e3;
  const TIMEOUT_MS = 12000;
  const cache = new Map(); // tweetId -> { at, rec }

  async function resolve(id) {
    if (!/^\d{5,25}$/.test(id)) throw new Error("bad_id");
    const hit = cache.get(id);
    if (hit && Date.now() - hit.at < CACHE_TTL) return hit.rec;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    let res;
    try {
      res = await fetch(P.syndicationUrl(id), { signal: ctrl.signal, credentials: "omit", cache: "no-store" });
    } catch (e) {
      throw new Error(e && e.name === "AbortError" ? "timeout" : "network");
    } finally {
      clearTimeout(timer);
    }
    if (res.status === 404) throw new Error("not_found");
    if (!res.ok) throw new Error("http_" + res.status);
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch (_) {}
    const rec = P.fromSyndication(json);
    if (!rec) throw new Error("not_found");
    cache.set(id, { at: Date.now(), rec });
    while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
    return rec;
  }

  function download(url, filename) {
    return new Promise((ok, fail) => {
      if (!P.isVideoUrl(url)) { fail(new Error("bad_url")); return; }
      chrome.downloads.download(
        { url, filename: P.safeFileName(filename), conflictAction: "uniquify", saveAs: false },
        (downloadId) => {
          const err = chrome.runtime.lastError;
          if (err || downloadId === undefined) fail(new Error((err && err.message) || "failed"));
          else ok(downloadId);
        },
      );
    });
  }

  chrome.runtime.onMessage.addListener((msg, sender, reply) => {
    if (!msg || sender.id !== chrome.runtime.id) return;
    if (msg.type === "sxa-resolve") {
      resolve(String(msg.id || "")).then(
        (rec) => reply({ ok: true, rec }),
        (e) => reply({ ok: false, error: e.message }),
      );
      return true;
    }
    if (msg.type === "sxa-download") {
      download(String(msg.url || ""), String(msg.filename || "")).then(
        (id) => reply({ ok: true, id }),
        (e) => reply({ ok: false, error: e.message }),
      );
      return true;
    }
  });
})();
