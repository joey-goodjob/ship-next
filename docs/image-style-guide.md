# SEO 配图风格规范（Image Style Guide）

适用于所有 SEO 页面「使用场景」区的配图，也可作为本站后续生图的通用基准。
配套文件：`docs/seo-use-case-image-prompts.json`（汇总）、`docs/<slug>.json`（单页提示词）、`docs/seo-image-generation-plan.md`（勾选进度表）。

---

## 1. 范围与产物

- 覆盖每个 SEO 页面的「使用场景」区，每页 **4 张卡片**，共 **14 页 × 4 = 56 张**。
- 例外：`how-to-make-a-lyric-video` 没有该区，不在内。
- 提示词存在各页 `docs/<slug>.json` 的 `images[].prompt`，进度在 `seo-image-generation-plan.md` 勾选。

## 2. 命名 / 路径 / 比例

- 路径：`/imgs/seo/<slug>/use-case-N.png`，`N` 对应页面 `useCases[]` 的顺序。
  - 特例：`audio-to-lyric-video` 用描述式文件名 `use-case-youtube / tiktok / demo / batch.png`。
- **en / zh 共用同一套图**，不用生两遍。
- 输出比例：**统一 1:1（正方形）**。
- 落盘目录：`public/imgs/seo/<slug>/`（对应 `diskPath`），文件名不要改。

## 3. 风格规范（核心）

**要：** SaaS 网站插图 / 复古海报 / 实拍 / 电影感。

**不要：**

- ❌ 卡通、动漫人物
- ❌ 霓虹、过饱和（要自然、克制的颜色）
- ❌ 发光波形线 / 光带（glowing waveform lines / light ribbons）
- ❌ 背影坐在电脑前 + 黑乎乎背景
- ❌ 水印、logo、可读的小 UI 文字

**分工原则：**

- 需要「人」的画面 → 一律**实拍 / 电影照（真人）**，脸可见或不出现人，绝不用插画角色。
- 插图只用于**物件 / 界面 / 概念**（SaaS 插图、等距 3D、复古海报）。

## 4. 多样性

- 风格与角度**铺开**，不要把一个模板反复套用。
- **页内** 4 张：风格 + 角度各不相同。
- **跨页** 14 套：彼此也要不同，尤其几个 alternative 对比页要明显区分。

**风格池：** modern SaaS 插图 · 等距 3D 插图 · 复古海报 · 实拍照片 · 电影剧照 · 微距产品照 · 平铺 flat-lay · 实拍生活。

**角度池：** 平视 · 俯拍 · 仰角 · 鸟瞰 · 微距 · 过肩 · 斜角 Dutch · 侧 profile · 三分之一 · 广角 · POV · 居中。

## 5. 每条 prompt 的结构

```
[风格 + 角度] + [扣住卡片文案的场景/主体] + [功能特征] + [统一约束尾]
```

- **功能特征**：扣住卡片含义，体现歌词视频的格式（16:9 / 9:16 / 1:1）或可读的屏上歌词。
  - 注意：这里的 16:9 / 9:16 指**画面里展示的歌词视频形态**，与第 2 节「图片本身 1:1」是两回事，别混淆。
- **统一约束尾**（每条 prompt 结尾固定带上）：

```
Natural restrained color, no neon, no glowing lines, no cartoon or anime characters, 1:1, no watermark, no logos.
```

## 6. 每张图记录的字段

| 字段 | 含义 |
|---|---|
| `slot` | 第几张（1–4，对应 useCases 顺序） |
| `useCaseTitle` | 对应卡片标题 |
| `style` | 这张用的风格 |
| `angle` | 这张用的角度 |
| `urlPath` | 页面引用路径 `/imgs/seo/<slug>/...` |
| `diskPath` | 实际落盘 `public/imgs/seo/<slug>/...` |
| `prompt` | 直接拿去生图的完整提示词 |

## 7. 一句话总结

> **1:1、自然色、SaaS 插图 / 复古 / 实拍 / 电影；真人只用实拍；风格与角度铺开不重样；每张带一个歌词视频特征；无卡通、无霓虹、无发光线、无水印。**
