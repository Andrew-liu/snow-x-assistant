// 打包运行文件到 dist/snow-x-assistant-<版本>/ 和同名 zip,用于 GitHub Release 和 Chrome 商店上传。
// 用法:node store/pack.js
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const FILES = [
  "manifest.json", "background.js", "inject.js", "content.js", "content.css", "following.js",
  "popup.html", "popup.css", "popup.js", "LICENSE",
  "lib/aitext.js", "lib/badge.js", "lib/common.js", "lib/i18n.js", "lib/parse.js",
  "icons/icon16.png", "icons/icon32.png", "icons/icon48.png", "icons/icon128.png",
];

const version = JSON.parse(fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8")).version;
const name = "snow-x-assistant-" + version;
const outDir = path.join(ROOT, "dist", name);
const zip = outDir + ".zip";

fs.rmSync(outDir, { recursive: true, force: true });
fs.rmSync(zip, { force: true });
for (const f of FILES) {
  const src = path.join(ROOT, f);
  if (!fs.existsSync(src)) throw new Error("missing " + f);
  const dst = path.join(outDir, f);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
}
// Windows 10+ 自带 tar,-a 按扩展名生成 zip;manifest.json 位于压缩包根目录
execFileSync("tar", ["-a", "-c", "-f", zip, "-C", outDir, ...FILES], { stdio: "inherit" });
console.log(`${name}: ${FILES.length} files -> ${path.relative(ROOT, zip)}`);
