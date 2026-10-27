# Chrome 网上应用店上架材料

本文件里的文字可以直接复制到 Chrome Web Store 开发者后台对应的输入框。

## 1. 基本信息

- 名称：Snow X Assistant
- 类别：社交与通讯（Social & Communication）
- 语言：中文（简体）
- 摘要：自动取自 `manifest.json` 的 `description`，限 132 字符，当前已符合
- 官网：https://github.com/Andrew-liu/snow-x-assistant
- 支持网址：https://github.com/Andrew-liu/snow-x-assistant/issues
- 隐私政策网址：https://andrew-liu.github.io/snow-x-assistant/privacy.html

## 2. 详细说明（中文）

```
Snow X Assistant 是一个 X（Twitter）浏览助手，帮你在刷 X 时一眼看清账号和推文的质量。

【账号与推文标签】
在推文作者名字旁边显示统一的标签：粉丝数、关注/粉丝比、互关、大V、高互动、低活跃等，可选显示疑似互粉号、新号、老号。每项都能单独开关，有 8 套标签主题可选。

【推文流速】
显示单条推文每小时的浏览增长，快速发现正在变热的内容。

【AI 文本概率】
在本地用中英文规则估算推文正文像 AI 写的程度，以百分比显示。纯规则打分，不调用任何 AI 接口，可随时关闭。

【视频下载】
在带视频的推文操作栏加一个下载按钮，也可以在弹窗里粘贴推文链接，选择清晰度后保存 mp4。仅限个人保存与学习使用，请尊重原作者版权并遵守 X 服务条款。

【关注列表整理】
在你自己的关注页筛出没有回关你的账号，由你确认后按设定间隔逐个点击 X 自带的按钮取消关注。默认间隔 1.5 秒，可随时停止，也可以在设置里整体关闭。

【隐私】
· 标签数据只读取 X 页面自己已经加载的内容，不额外请求 X 接口
· 没有开发者服务器，不收集、不上传任何数据，无统计和广告
· 设置只保存在你的浏览器里
· 源代码完全公开：https://github.com/Andrew-liu/snow-x-assistant

支持浅色/深色外观，界面支持中文和英文。
```

## 3. 详细说明（English，可选，在后台添加英文版时使用）

```
Snow X Assistant helps you judge the quality of accounts and tweets at a glance while browsing X (Twitter).

ACCOUNT & TWEET TAGS
Shows unified tags next to author names: followers, following/follower ratio, mutual, big account, high engagement, low activity, plus optional tags for likely follow-farm, new and old accounts. Every tag can be toggled, with 8 tag themes.

VIEW VELOCITY
Shows how fast a tweet is gaining views per hour, so you can spot posts that are taking off.

AI-TEXT LIKELIHOOD
Estimates locally, with Chinese and English rules, how AI-written a tweet's text looks, shown as a percentage. Rule-based only, no AI service is called, and it can be turned off.

VIDEO DOWNLOAD
Adds a download button to tweets with video, or paste a tweet link in the popup and pick a quality to save the mp4. For personal use only. Please respect creators' copyright and the X Terms of Service.

FOLLOWING LIST CLEANUP
On your own Following page, finds accounts that don't follow you back. After you confirm, it unfollows them one by one by clicking X's own buttons at a set interval (1.5 s by default). You can stop at any time or turn the feature off.

PRIVACY
- Tags only read data the X page has already loaded; no extra X API requests
- No developer server, no data collection or upload, no analytics or ads
- Settings stay in your browser
- Fully open source: https://github.com/Andrew-liu/snow-x-assistant

Light/dark appearance, Chinese and English UI.
```

## 4. 隐私权规范（Privacy practices）页

### 单一用途说明（Single purpose）

```
Snow X Assistant 是一个 X（Twitter）浏览增强助手，所有功能都只在 x.com/twitter.com 上运行，服务于同一个目的：帮助用户在浏览 X 时判断账号和推文的质量并管理自己看到的内容，包括账号质量标签、推文浏览流速、AI 文本概率提示、保存推文视频和整理自己的关注列表。
```

```
Snow X Assistant is a browsing assistant for X (Twitter). All features run only on x.com/twitter.com and serve one purpose: helping users evaluate accounts and tweets and manage the content they see on X, including account quality tags, tweet view velocity, AI-text likelihood hints, saving tweet videos, and tidying their own following list.
```

### 权限理由（Permission justification）

storage：
```
Saves the user's settings (feature toggles, tag theme, language, appearance) and, for following cleanup, unfollow timestamps from the last hour to enforce an hourly limit, locally with chrome.storage.local. No account data or browsing history is stored.
```

downloads：
```
Used only when the user clicks the video download button or the download option in the popup, to save the selected tweet video (mp4 from video.twimg.com) into the user's Downloads folder via chrome.downloads.download.
```

主机权限 Host permissions（x.com、twitter.com、cdn.syndication.twimg.com）：
```
x.com / twitter.com: content scripts display account/tweet tags and the video download button on X pages, and the popup checks whether the active tab is an X tweet page to prefill the link.
cdn.syndication.twimg.com: the public endpoint used by X's official embed widget. When the user asks to download a video that the page has not loaded, the background script requests that tweet's public video info from it with only the tweet ID and no cookies.
```

内容脚本在 MAIN world 运行（如果审核询问，可以补充到说明或回复审核邮件）：
```
inject.js runs in the page's main world only to read copies of the GraphQL responses that X's own web app has already requested (URLs containing /i/api/graphql/). It does not create, modify or block any request, and the data never leaves the browser.
```

远程代码（Are you using remote code?）：选 No
```
No. All JavaScript is bundled in the package. No eval, no remotely hosted scripts.
```

### 数据使用（Data usage）勾选

收集的数据类型：一项都不勾。扩展只在页面上即时显示 X 已加载的数据，不保存、不传输，按 Google 的定义不属于收集。

三项声明全部勾选：
- I do not sell or transfer user data to third parties, outside of the approved use cases
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- I do not use or transfer user data to determine creditworthiness or for lending purposes

## 5. 图片素材

位于 `store/images/`：

- `icon128.png`：商店图标，直接用 `icons/icon128.png`
- `screenshot-1.png` 到 `screenshot-4.png`：1280x800 截图，至少传 1 张，最多 5 张
- `promo-small.png`：440x280 小宣传图块
