<div align="center">

<img src="icons/icon128.png" width="96" height="96" alt="Snow X Assistant">

# Snow X Assistant

**一眼看出哪条推文正在起飞,哪个账号值得关注。**

在 X(Twitter)的信息流里,为每条推文标出实时流速和 AI 腔指数,为每个账号标出粉丝量级与质量。<br>
另附视频下载和一套克制、可控的互关清理工具。标签只读页面已有数据,不额外请求任何接口。

<p>
  <img alt="Manifest V3" src="https://img.shields.io/badge/Manifest-V3-1d9bf0?style=flat-square">
<img alt="Version" src="https://img.shields.io/badge/version-0.8.0-0f1419?style=flat-square">
  <img alt="Permissions" src="https://img.shields.io/badge/permissions-storage%20%2B%20downloads-00ba7c?style=flat-square">
  <img alt="Network" src="https://img.shields.io/badge/extra%20requests-0-00ba7c?style=flat-square">
  <img alt="Build" src="https://img.shields.io/badge/build-none-8b98a5?style=flat-square">
  <img alt="License" src="https://img.shields.io/badge/license-MIT-f91880?style=flat-square">
</p>

<p>
  <a href="#特性">特性</a> ·
  <a href="#主题">主题</a> ·
  <a href="#安装">安装</a> ·
  <a href="#隐私">隐私</a> ·
  <a href="#工作原理">工作原理</a> ·
  <a href="#常见问题">常见问题</a>
</p>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/images/hero-dark.png">
  <source media="(prefers-color-scheme: light)" srcset="docs/images/hero-light.png">
  <img src="docs/images/hero-dark.png" width="640" alt="推文头部的流速、AI 概率与账号标签(热度条主题)">
</picture>

</div>

<br>

## 特性

<table>
<tr>
<td width="25%" valign="top">

### 推文流速

`浏览量 ÷ 发布至今小时数`。低于 1k/h 只显示灰色数字,1k、5k、1w 起依次进入三档 🚀,档位越高越亮,爆款带光晕,滑动信息流时一眼就能抓住。

</td>
<td width="25%" valign="top">

### AI 文本检测

中英文两套规则,识别套话开场、总结收尾、客服式结尾、万能夸夸回复、AI 高频词和排版套路,给出 0 到 100 的 AI 腔指数。完全在本地计算。

</td>
<td width="25%" valign="top">

### 账号标签

粉丝量级、关注/粉丝比（百分比）,以及互关、未回关、大V、新号、老号、高互动、低活跃、疑似互粉号八种质量标签,每一项都能单独开关。

</td>
<td width="25%" valign="top">

### 互关清理

在自己的「正在关注」页筛出未回关账号,勾选后批量取关。带间隔、抖动、单次上限与随时停止,节奏由你掌控。

</td>
</tr>
</table>

- 四个功能各有独立开关,互不影响。只想看流速,就只开流速。
- 悬停任意标签,弹出账号与推文的详细数据卡:粉丝、关注、比值、注册时长,浏览、赞、转、评、藏和爆款分,以及 AI 检测命中的具体规则。
- 自动适配 X 的浅色、暗蓝、纯黑三种背景,也可以在弹窗里固定为浅色或深色。
- 支持中文和英文界面。
- 标签布局有三种:「自动」(默认,标题行太挤时收起末尾的标签,完整数据看悬停卡)、「跟在名字后」和「单独一行」(固定显示在名字下方)。

<p align="center">
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/images/hovercard-dark.png">
  <source media="(prefers-color-scheme: light)" srcset="docs/images/hovercard-light.png">
  <img src="docs/images/hovercard-dark.png" width="296" alt="悬停详情卡:账号数据、推文流速与 AI 检测明细">
</picture>
</p>

## 主题

八套主题,形状、字体与排版各不相同,不只是换个颜色。默认主题为「热度条」。流速、AI 检测、账号标签和悬停卡共用同一套主题,AI 标签统一用紫色,与流速的暖色区分开。下图每个主题都展示了流速四档和 AI 检测的效果。

<p align="center">
  <img src="docs/images/themes.png" width="900" alt="八套标签主题总览">
</p>

| 主题 | 风格 | 流速的表达方式 |
|---|---|---|
| 热度条(默认) | 无框文字,质量标签带下划线 | 五格进度条,绿到红渐变 |
| 信号灯 | 实心圆角胶囊 | 灰 / 绿 / 橙 / 红色块,光晕逐级增强 |
| 徽章 | shields.io 两段式,方角 | 左侧写「流速」,右侧数值按档位上色 |
| 贴纸 | 粗黑描边、硬投影、交替微倾 | 普通档虚线描边,爆款更歪更大 |
| 终端 | 一整条命令行,等宽字体 | 普通档 `~` 前缀,其余为 🚀 加文字发光 |
| 霓虹 | 透明底、发光描边 | 青 / 黄 / 洋红霓虹框 |
| 原生文字 | 无框,`·` 分隔,最接近 X 原生 | 仅以亮色文字区分 |
| 极光 | 渐变描边胶囊 | 渐变填充,爆款呼吸光晕 |

## 设置

<table>
<tr>
<td align="center" width="33%"><img src="docs/images/popup-tags.png" width="280" alt="标签设置"><br><sub>标签:开关、显示项与流速阈值,顶部实时预览</sub></td>
<td align="center" width="33%"><img src="docs/images/popup-themes.png" width="280" alt="主题选择"><br><sub>主题:大卡片预览,可切换浅色 / 深色背景对比</sub></td>
<td align="center" width="33%"><img src="docs/images/popup-general.png" width="280" alt="通用设置"><br><sub>通用:外观、语言、作者与项目</sub></td>
</tr>
</table>

弹窗分为「标签」「主题」「下载」「互关清理」「通用」五个页签,所有改动即时生效,无需刷新页面。

「通用」页签可以设置:

- 外观:自动 / 浅色 / 深色。会同时作用于弹窗、页面里的标签、悬停卡和互关清理工具栏。选「自动」时,弹窗跟随系统,页面里跟随 X 当前的背景色。
- 语言:自动 / 中文 / English。选「自动」时跟随 X 的界面语言,非中文一律显示英文。英文界面下数字用 K / M / B 表示。
- 作者的 X 账号和 GitHub 仓库链接。觉得好用的话,欢迎去 GitHub 点个 Star。

## 安装

> [!NOTE]
> 目前尚未上架 Chrome 网上应用店,请以「开发者模式」加载。Edge、Brave、Arc 等 Chromium 内核浏览器通常也可按相同方式加载,但尚未逐一验证。

1. 下载本仓库(`Code → Download ZIP` 后解压,或 `git clone`)。
2. 打开 `chrome://extensions`,开启右上角的 **开发者模式**。
3. 点击 **加载已解压的扩展程序**,选择仓库根目录(包含 `manifest.json` 的那一层)。
4. 打开或刷新 [x.com](https://x.com)。互关清理需进入 `x.com/<你的用户名>/following`。

> [!IMPORTANT]
> 加载后请勿删除或移动该目录,否则扩展会失效。更新版本时,替换目录内容后在扩展页点击刷新即可。

## 使用说明

### 流速

| 档位 | 默认阈值 | 显示 |
|---|---|---|
| 普通 | 低于 1,000 浏览/小时 | 灰色数字,无图标 |
| 升温 | 1,000 浏览/小时起 | 🚀 第一档 |
| 热门 | 5,000 浏览/小时起 | 🚀 第二档,更亮并带光晕 |
| 爆款 | 10,000 浏览/小时起 | 🚀 第三档,最亮,光晕最强 |

三个阈值都可以在弹窗中自定义,必须从小到大递增。新号和大号的基准差别很大,建议按你常看的圈子调整。

### AI 文本检测

根据正文自动选择中文或英文规则,按写法特征加权打分,只看「怎么写」,不判断内容真假。引号、书名号里的内容不计入,引用或吐槽 AI 套话的推文不会因此被标出。

| 规则组 | 典型命中 |
|---|---|
| 中文 | 「在当今……时代」「在……的今天」式开场、值得注意的是、首先/其次/最后、总而言之、希望对你有所帮助、不是……而是/与其说……不如说、不仅仅是……更是、「当然重要。但……」式让步、一字之差/天壤之别、未来已来/新时代已经到来、业内人士认为、至少有三件事、这意味着什么?、无论你是……还是……都、说得太好了/值得深思/期待更多分享、赋能/抓手/闭环等黑话 |
| 中文回复腔 | 「这个观点很有意思！」式附和开头、「未来可能会……」「值得持续关注」式展望收尾、「随着技术的不断进步」式趋势套话、本质上/背后反映的是、关键在于/真正的壁垒是、各有千秋/取决于使用场景、书面化高频词(至少 2 个才计),以及短回复里句句完整的书面标点 |
| 英文 | `In today's … landscape`、`it's important to note`、`not just … but`、`Let's dive in`、`Here's the kicker`、`The best part:`、`Not a X. Not a Y. A Z.`、`Imagine a world where`、`Let that sink in`、`Experts agree`、`Great point`、`Thanks for sharing`、delve / tapestry 等高频词 |
| 排版 | 大量加粗、破折号、emoji 列表、编号列表、小标题、成串话题标签,短推里按六折计分 |
| 引流腔 | 建议收藏、一文读懂、99% 的人不知道、亲测有效、`Bookmark this`、`A thread 🧵` 等。营销号也常这么写,悬停卡单独列出,只按四成计入总分 |

「不是……而是……」这类句式偶尔用一次是正常修辞,只命中一次时按半分计,反复使用才全额累加。中文里出现笑死、卧槽、属于是、句末「吧/啊」等口语信号时,整体分数打七折。分数曲线按推文的长度校准,一两处典型套路就能到 50% 左右,较长的文本会相应放宽。

开关默认关闭,需在弹窗「标签」页手动打开。打开后,每条有正文的推文都会在标签行显示 `AI xx%`:

| AI 概率 | 显示 |
|---|---|
| 正文太短(有效长度不足 10) | `AI –`,淡化,不判断 |
| 0% 到 39% | 「不明显」,淡化 |
| 40% 到 74% | 「疑似 AI」,浅紫描边 |
| 75% 及以上 | 「很像 AI」,实心紫色并带光晕 |

> [!NOTE]
> 这是启发式规则,不是模型判定。认真写的长文、公文、教程同样可能命中,请只当作阅读提示。

### 账号标签

粉丝数前的圆点表示量级:蓝色千级、紫色万级、粉色十万级、橙色百万级。默认显示粉丝数和关注/粉丝比,质量标签全部显示;其中疑似互粉号、新号、老号默认关闭,可在弹窗里单独打开。质量标签基于经验阈值,只作参考:

| 标签 | 判定规则 |
|---|---|
| 互关 / 关注了你 | 来自 X 返回的关系字段 |
| 未回关 | 你关注了对方,但对方没有关注你。同样来自 X 已返回的关系字段,不额外请求;你没关注的账号不标 |
| 大V | 粉丝 ≥ 1 万,且粉丝/关注 ≥ 10 |
| 疑似互粉号 | 关注 ≥ 1,000,粉丝 < 5,000,粉丝/关注在 0.8 到 1.25 之间 |
| 新号 | 注册不足 90 天 |
| 老号 | 注册超过 8 年 |
| 高互动 | 近期推文互动/浏览 ≥ 3% |
| 低活跃 | 粉丝 ≥ 5,000,但互动/浏览 < 0.1% |

### 视频下载

- **时间线按钮**:带视频或 GIF 的推文,操作栏末尾多一个下载图标,点一下下载最高清晰度的 mp4。多视频推文会逐个下载。可在弹窗「下载」页关闭。
- **粘贴链接**:在弹窗「下载」页粘贴 `x.com/用户名/status/…` 链接(当前标签页是推文详情页时会自动填入),列出各清晰度和码率,点哪个下哪个。本条没有视频时会取引用推文里的视频。
- **数据来源**:优先用页面已加载的 GraphQL 数据,零额外请求;页面里没有这条推文时,后台请求 X 官方嵌入组件使用的公开接口 `cdn.syndication.twimg.com/tweet-result`,不带 Cookie。
- 文件保存在浏览器下载目录的 `SnowX` 文件夹,命名为 `作者_推文ID_清晰度.mp4`。只保存 mp4 直链,不下载 m3u8 分段流。受保护、已删除或需要登录才能看的推文无法通过粘贴链接解析。

> [!CAUTION]
> 仅限个人保存与学习使用。视频版权归原作者所有,请遵守 X 服务条款和当地法律,不要转载或用于商业用途。

### 互关清理

<p align="center">
  <img src="docs/images/mutual-cleanup.png" width="560" alt="互关清理工具栏">
</p>

- **只在自己的关注页出现**,其他页面不加载任何清理逻辑。
- **宁漏勿误**:同时参考页面上的「关注了你」标记和 X 返回的关系数据,无法确认时不会被选为未回关。
- **模拟真人节奏**:点击 X 自带的「正在关注 → 取消关注」按钮完成,间隔可选 1、1.5、3、5 秒四档,默认 1.5 秒,并加随机抖动。
- **有上限,可中断**:滚动一小时内最多取关 50 人,到量自动暂停并显示还需等待的分钟数,记录跨刷新和多个标签页共享。执行前二次确认,过程中随时可停;只有按钮真正变回「关注」才计为成功。

> [!WARNING]
> 短时间内大量取关可能触发 X 的风控。插件已强制每小时最多 50 人,仍建议分多天进行。

## 隐私

Snow X Assistant 的设计前提是:**不让你的数据离开浏览器**。

| | |
|---|---|
| 网络请求 | 标签功能不发起任何请求,数据来自 X 页面本身已经加载的 GraphQL 响应,以及页面上已渲染的数字和正文。唯一的例外是视频下载:页面里没有这条推文的数据时,向 `cdn.syndication.twimg.com` 请求一次推文的公开嵌入信息(不带 Cookie),以及从 `video.twimg.com` 下载你选中的视频 |
| AI 检测 | 正文只在当前页面内用本地规则打分,不上传、不调用任何模型接口,结果仅缓存在内存中 |
| 权限 | `storage` 保存设置;`downloads` 保存视频;`host_permissions` 只有 `x.com`、`twitter.com`(弹窗向已打开的 X 页面查询缓存)和 `cdn.syndication.twimg.com`(解析粘贴的链接)。后台脚本只响应本扩展自己的消息,且只下载 `video.twimg.com` 上的地址 |
| 存储 | `chrome.storage.local` 只保存你的设置和最近一小时的取关时间戳(用于每小时上限),不记录浏览历史、不保存账号数据 |
| 第三方 | 无统计、无遥测、无远程配置、无 CDN 依赖 |
| 代码 | 无构建、无压缩,你加载的就是仓库里的源码,可逐行审阅 |

## 工作原理

```mermaid
flowchart LR
  X["x.com 页面<br/>GraphQL 响应"] -->|"clone 一份,原响应不变"| I["inject.js<br/>页面主世界"]
  I -->|postMessage| C["content.js<br/>内容脚本"]
  D["页面已渲染的数字"] -.->|兜底| C
  C --> P["lib/parse.js<br/>解析 · 流速 · 标签规则"]
  C --> A["lib/aitext.js<br/>中英文 AI 文本规则"]
  P --> B["lib/badge.js<br/>标签与悬停卡"]
  A --> B
  F["following.js"] -->|"点击 X 自带按钮"| X
  S["popup<br/>设置"] <-->|chrome.storage.local| C
```

```
snow-x-assistant
├── manifest.json     # MV3 清单,storage + downloads 权限
├── background.js     # 后台:解析粘贴的推文链接、调用 chrome.downloads 保存视频
├── inject.js         # 页面主世界:复制 X 自身的 GraphQL 响应
├── content.js        # 内容脚本:缓存数据、定位推文、挂载标签与悬停卡
├── content.css       # 八套主题与悬停卡样式
├── following.js      # 互关清理工具栏与取关队列
├── lib/
│   ├── parse.js      # 纯函数:解析、流速、质量标签、设置校验
│   ├── aitext.js     # 纯函数:中英文 AI 文本检测规则与打分
│   ├── badge.js      # 标签 DOM 构建,弹窗与页面共用
│   ├── common.js     # 设置读写、深浅色与语言切换
│   └── i18n.js       # 中文 / 英文文案
├── popup.html/js/css # 设置弹窗
└── tests/            # node:test 单元测试
```

## 常见问题

<details>
<summary><b>为什么有些推文没有标签?</b></summary>
<br>
插件只使用 X 已经返回给页面的数据。某些位置(例如部分广告、未加载完的卡片)没有对应数据时,标签就不会出现。滚动或刷新后通常会补上。
</details>

<details>
<summary><b>流速和 X 后台的数据为什么不完全一致?</b></summary>
<br>
流速是「当前浏览量 ÷ 发布至今的小时数」得出的平均值,反映整体热度,而不是此刻的瞬时速度。刚发布几分钟的推文波动会比较大。
</details>

<details>
<summary><b>会不会导致账号被限制?</b></summary>
<br>
标签功能完全只读,不产生任何请求,不会对账号造成影响。互关清理会执行真实的取关操作,请保持默认节奏并分批进行。
</details>

<details>
<summary><b>AI 检测把我认真写的推文也标出来了?</b></summary>
<br>
规则识别的是 AI 常见的写法套路,人写的总结性长文、教程和营销文案也会用到同样的句式。把百分比当参考即可,75% 以上才比较可信;不需要时可在弹窗直接关闭该功能。
</details>

<details>
<summary><b>浏览时页面会不会乱跳?</b></summary>
<br>
X 的时间线是虚拟列表,每条推文按测量好的高度定位。X 在渲染时就量好高度,插件再改动高度会让往上翻时内容乱跳。0.7.4 起插件不再改变推文高度:「自动」和「跟在名字后」只在名字后显示,「单独一行」由样式固定预留一行,不做滚动补偿。
</details>

<details>
<summary><b>关注页的工具栏横跨了整个页面?</b></summary>
<br>
这是旧版本的问题:X 重新渲染关注页时,工具栏可能被挂到页面最外层。新版本只把工具栏插在主列的「正在关注」页签下方,并在每次刷新时校正位置。如果仍遇到,刷新页面或在扩展页点击刷新即可。
</details>

<details>
<summary><b>X 改版后失效了怎么办?</b></summary>
<br>
解析逻辑集中在 <code>lib/parse.js</code>,页面定位在 <code>content.js</code> 与 <code>following.js</code>。欢迎提交 Issue,附上出问题的页面截图会很有帮助。
</details>

## 开发

无构建步骤,修改源码后在 `chrome://extensions` 点击刷新即可生效。

```bash
node --test tests/
```

提交改动前请确保:

- 除视频下载已有的嵌入接口外,不引入新的网络请求或权限;
- 新的解析逻辑以纯函数形式放进 `lib/parse.js`,并补充对应测试;
- 不修改 X 的原始请求与响应。

## 免责声明

本项目为个人开源作品,与 X Corp. 无任何关联。质量标签基于公开数据与经验阈值,不代表对任何账号的评价。使用互关清理功能产生的后果由使用者自行承担。

## 许可

[MIT](LICENSE)

<div align="center">
<br>
<sub>为在 X 上认真阅读的人而做。</sub>
</div>
