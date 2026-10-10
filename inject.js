// 运行在页面主世界:只读 X 自己发出的 GraphQL 响应,不主动发任何请求,也不改动请求内容。
(() => {
  "use strict";
  if (window.__snowXAssistantHooked) return;
  window.__snowXAssistantHooked = true;

  const SOURCE = "snow-x-assistant";
  const isGraphql = (url) => typeof url === "string" && url.includes("/i/api/graphql/");

  const emit = (text) => {
    if (typeof text === "string" && text.length) window.postMessage({ source: SOURCE, body: text }, location.origin);
  };

  const origFetch = window.fetch;
  window.fetch = async function (...args) {
    const res = await origFetch.apply(this, args);
    try {
      const req = args[0];
      const url = typeof req === "string" ? req : req instanceof URL ? req.href : req && req.url;
      if (isGraphql(url)) res.clone().text().then(emit).catch(() => {});
    } catch (_) {}
    return res;
  };

  const origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    try {
      const u = typeof url === "string" ? url : url instanceof URL ? url.href : "";
      if (isGraphql(u)) {
        this.addEventListener("load", () => {
          try {
            if (this.responseType === "" || this.responseType === "text") emit(this.responseText);
          } catch (_) {}
        });
      }
    } catch (_) {}
    return origOpen.call(this, method, url, ...rest);
  };
})();
