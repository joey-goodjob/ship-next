# lyricvideomaker.app — Safe Browsing「欺骗性网页」整改清单

> 现状：GSC 安全问题 = 欺骗性网页（Social Engineering），示例网址「不适用」=> **域名级判定，非单页**。
> Safe Browsing：「Some pages on this site are unsafe — try to trick visitors into sharing personal info or downloading software」。
> 排查结论：**未发现被黑、跳转、iframe 注入、cloaking、恶意外链、广告联盟、注入脚本**（全站第三方脚本仅 Google Analytics）。
> 真正风险 = 内容侧「免费/导出口径缺少限定」+ 少量上传/公开页托管隐患 + 索引卫生不干净，叠加在一个全新 `.app` 域名上被分类器整体误标。

状态图例：✅ 已实证（看过代码）｜🟡 待确认（需运行时/浏览器核验）｜❌ 已排除或 ChatGPT 说法不准

---

## 🔴 P0 — 可能直接影响 Safe Browsing 判定，第一批先修

| # | 问题 | 状态 | 证据 / 位置 | 处理动作 | 验收标准 |
|---|------|------|------------|----------|----------|
| 1 | **免费/导出文案缺少限定，容易被理解成无限制免费** | ✅ 实证 | 全站文案：`no subscription`×97、`no credit card`×25、`export free`×24、`no signup`×5、`free is free`×1。`public/seo-pages/**`、`src/config/locale/messages/**/landing.json`。最严重 `free-lyric-video-maker.json`（单页 11 处） | 全站统一口径：可以说免费导出，但必须写成 `Free export with watermark` / `Export a watermarked video for free` / `免费导出带水印版本`。注册、积分、订阅口径写清楚：`Free signup credits` / `Account required to use free credits` / `Credits required for AI generation` / `No subscription required` / `No credit card to start`（而非单独写 `Free is free` 或无条件 `free export`） | 任何「免费导出 / free export」旁必须紧挨着出现 watermark / 带水印；任何「免费积分 / free credits」旁必须说明注册账号获得、用于 AI 生成或导出；不得出现让用户理解成无限免费、无账号完整导出的表达 |
| 2 | **图片上传接受 SVG，并以 `image/svg+xml` + `Content-Disposition: inline` 存储** | ✅ 实证 | `src/app/api/storage/upload-image/route.ts:16,41`（接受 `image/svg+xml`，仅校验 `startsWith('image/')`）；`src/core/storage/r2.ts:124` 默认 `disposition: 'inline'` | 上传白名单移除 SVG（或服务端清洗）；非预览类资源统一 `Content-Disposition: attachment`；对图片设 `X-Content-Type-Options: nosniff` | 无法上传 `.svg/.html`；上传 SVG 被拒；图片响应头带 nosniff |
| 3 | **公开 preview 页无服务端鉴权** | ✅ 页面实证 / 🟡 API 待确认 | `src/app/[locale]/creations/[id]/preview/page.tsx`（17 行，直接渲染客户端组件，无 auth gate）；`lyric-videos/[id]/preview` 重定向到它 | 确认拉数据的 API（`/api/lyric-videos/[id]/...`）对非 owner 是否鉴权；公开分享场景要确保展示的用户歌词文本不可被填成钓鱼引导；分享页加 `noindex` | 非本人 id 无法读到他人项目内容；分享页 head 含 noindex |
| 4 | **上传产物公开域名归属确认** | 🟡 待确认 | `.env.local: STORAGE_PUBLIC_DOMAIN=`（空）→ 回落 R2 端点直链，**当前不挂你主域**。`src/core/storage/r2.ts:58` | 若未来配置 `cdn.lyricvideomaker.app` 指向 bucket，务必先做完 #2；确认 bucket 未开目录列表、分享 URL 有过期 | bucket 不可列目录；自有子域不直出用户上传的可执行内容 |

---

## 🟠 P1 — 索引 / 卫生 / 一致性（有益但别指望靠它解封），第二批

| # | 问题 | 状态 | 证据 / 位置 | 处理动作 | 验收标准 |
|---|------|------|------------|----------|----------|
| 5 | **认证页 robots.txt Disallow 与页面 noindex 冲突** | ✅ 实证 | `src/app/robots.ts` disallow `/sign-in /sign-up /forgot-password …`；`src/app/[locale]/(auth)/layout.tsx` 又设 `index:false,follow:false`。robots 拦抓取 → Google 看不到 noindex | 认证页从 robots disallow 中移除（放开抓取），保留页面 `noindex,nofollow`，并加响应头 `X-Robots-Tag: noindex`。robots 只保留 `/api /admin /dashboard /settings` 等真私有 | URL 检查能拿到认证页 HTML 且显示 noindex |
| 6 | **缺少自定义 404（not-found.tsx）** | ✅ 实证缺失 | 全项目无 `not-found.tsx`（404 回落 root layout，仅 title） | 新增 `src/app/not-found.tsx` 与 `src/app/[locale]/not-found.tsx`：返回 404、`noindex,nofollow`、不带 canonical | 随机不存在 URL 返回 404 且 head 为 noindex、无首页 canonical |
| 7 | **下载 / 导出 / 项目页索引控制** | 🟡 | `/exports/* /download/* /creations/* /lyric-videos/*` | 私有/产物路径加 `noindex` + `X-Robots-Tag`；下载响应设准确 `Content-Type` + `Content-Disposition: attachment`（MP4=`video/mp4`，字幕=文本） | 这些路径不被索引；MP4/SRT 不会被当网页执行 |
| 8 | **安全响应头缺失** | 🟡 ChatGPT 提出，未在代码见到配置 | `next.config.ts` 未见 headers 配置 | 补 `Content-Security-Policy`、`X-Content-Type-Options: nosniff`、`Referrer-Policy`、`X-Frame-Options` | 浏览器响应头可见上述 header |
| 9 | **sitemap / canonical 收口** | 🟡 待核验 | `src/app/robots.ts` 指向 sitemap；`src/lib/site-metadata.ts:71` canonical=self（公开页正确） | 确认 sitemap 只含公开 SEO 页/首页/pricing/policy，不含登录页/项目页/API/404；公开页 canonical self，私有页无 canonical | sitemap 干净；每个 200 SEO 页 canonical 指向自身 |

---

## 🟡 P2 — 信任信号 / 收尾

| # | 问题 | 状态 | 处理动作 | 验收标准 |
|---|------|------|----------|----------|
| 10 | 登录/注册页信任信息不足 | 🟡 | 登录页加品牌与用途说明（"用于保存项目、管理积分、导出歌词视频"）+ Privacy / Terms / Contact 链接 | 登录页明确写明用途与隐私入口 |
| 11 | Footer 信任入口 | ✅ 已有 policy 页 | Footer 显著放 About / Contact / Privacy / Terms / Refund / Pricing，最好有真实 demo 视频 | 全站 footer 可直达上述入口 |
| 12 | Alternative 对比页 | ✅ 实证 | `capify / kapwing / veed / neural-frames` 四页去掉对方 Logo/品牌素材，加 "Independent comparison. Not affiliated with …" | 每页有独立对比声明 |
| 13 | FAQ 讲清免费导出和积分规则 | ✅ 已部分存在 | FAQ 明确：免费账号、150 一次性 credits、免费导出带水印、生成/去水印或更高规格导出消耗 credits、付费前展示费用 | 用户不会误解为无限制免费或无水印免费导出 |
| 14 | 申请审核 | 待做 | 上面修完，跑一轮 URL 检查，再在 GSC 点「申请审核」，说明已修正免费表述、上传安全、noindex/404 策略 | 提交前再过一遍站点 |

---

## ❌ ChatGPT 清单中不准 / 可降级的项（别让程序员白改）

| 原条目 | 结论 | 依据 |
|--------|------|------|
| 「404 混入首页 canonical + index,follow」 | **不成立**（说法不准） | 无 not-found.tsx，404 回落 root layout（仅 title），不会套用 `buildPublicMetadata` 的 `index:true+canonical`。仍建议补 404（见 #6），但不是它说的那个机理 |
| 「Free 套餐承诺 Unlimited / Premium / Lip Sync / Commercial」 | **代码侧基本不成立** | `landing.json` 中这些功能标注 `included for paid credits`，Free = `150 credits one time`。建议浏览器看一眼渲染确认，代码是诚实的 |
| 「站点被黑 / 注入 / 跳转 / cloaking」 | **已排除** | 全站第三方脚本仅 Google Analytics，无 iframe / 注入 / 重定向 |

---

## 执行顺序（拆两批）

**第一批（内容 + 真风险，最可能解封）**：#1 免费导出/水印/积分口径统一 → #2 关掉 SVG/改 attachment → #3 公开 preview 鉴权与 noindex → #4 确认 bucket。
**第二批（索引卫生 + 信任）**：#5 认证页 robots/noindex → #6 404 → #7 下载/导出 noindex → #8 安全头 → #9 sitemap/canonical → #10~13 信任信号。
**最后**：跑一轮 URL 检查 → GSC 申请审核（#14）。
