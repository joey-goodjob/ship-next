# Lyric Video Studio 实施计划

## 1. 总体架构

继续沿用 ShipAny 模块化规则：

User Request -> API Route -> `src/modules/lyric-videos/service.ts` -> Database/AI/Storage/FFmpeg。

第一阶段不重写架构，只在现有模块上补齐产品能力。前端入口保持在 `src/app/[locale]/dashboard/lyric-videos/page.tsx`，后续可拆分为更小的 client components。

## 2. 后端 Pipeline

### 2.1 项目创建

输入：

- 音频文件上传结果：`audioUrl`、`audioStorageKey`、`audioFilename`。
- 可选项目标题。
- 可选初始风格参数。

处理：

- 调用 `createProject` 创建 `lyric_video_project`。
- 初始状态为 `draft` 或 `uploaded`。
- 如果用户同时粘贴歌词，可立即调用转写草稿逻辑保存歌词。

验收：

- 项目列表能看到新项目。
- 项目详情能播放音频。
- 无音频时不能进入导出。

### 2.2 歌词识别与编辑

现有能力：

- `createTranscriptionDraft` 支持手动歌词或 Kie Gemini 音频转写。
- `replaceLyrics` 支持整批替换歌词行。

需要增强：

- 前端提供更明确的歌词行编辑体验，展示 `startMs`、`endMs`、`text`。
- 保存时保留用户编辑后的时间戳，而不是只按每 4 秒重新估算。
- API 失败时展示 `pipelineError`。

验收：

- 粘贴歌词可以跳过 AI 转写。
- 自动转写后可以手动修正歌词。
- 保存后刷新页面仍保留修正结果。

### 2.3 全局风格配置

字段：

- `storyPrompt`
- `palette`
- `artStyle`
- `aspectRatio`
- `resolution`
- `previewConfig`

处理：

- 使用现有 `PATCH /api/lyric-videos/[id]` 保存。
- storyboard 生成时读取最新项目字段。
- 图片生成时把 `aspectRatio`、`resolution` 传给模型。

验收：

- 用户修改风格并保存后，项目详情刷新仍保留。
- 重新生成 storyboard 时 prompt 会体现 Story Prompt、Palette、Art Style。
- 竖屏项目 preview 和导出尺寸使用 `9:16`。

### 2.4 分镜生成与时间轴

现有能力：

- `generateStoryboard` 根据歌词生成 scenes。
- `replaceScenes` 保存 scenes。
- `updateScene` 可更新 scene prompt 和 motion prompt。

需要增强：

- `updateScene` 支持更新 `startMs`、`endMs`。
- 新增 scene split 能力：输入 sceneId 和 splitMs，把一个 scene 拆成两个连续 scenes。
- split 后保留原 scene prompt，并为新 scene 生成可编辑初稿 prompt。
- `linkedLineIds` 保持 JSON 数组，后续用于展示 scene 关联歌词。

验收：

- storyboard 生成后能看到按时间排序的 scene 列表。
- scene prompt、motion prompt、时间范围保存后不丢失。
- split 后 scene 数量增加，时间范围连续且不重叠。

### 2.5 静态图片生成

现有能力：

- `queueSceneImages` 支持单个 scene 或全部 scenes。
- `syncSceneImages` 轮询 provider 状态并更新 imageUrl。

需要增强：

- 前端更清楚地区分 `draft`、`processing`、`success`、`failed`。
- 失败 scene 可单独重试。
- 生成图片时把全局角色描述或角色锁定 prompt 注入 scene prompt。

验收：

- 单个 scene 可以生成图片。
- 全部 scenes 可以批量生成图片。
- processing 状态会自动刷新。
- failed 状态能展示错误并允许重试。

### 2.6 字幕样式与导出

现有能力：

- `LYRIC_VIDEO_DEFAULT_STYLE` 定义基础字幕样式。
- `buildAss` 生成 ASS 字幕。
- `queueExport` 调用 FFmpeg 生成静态 MP4。

需要增强：

- 前端提供 subtitle style 面板。
- 保存样式到 `previewConfig` 或导出 settings。
- 导出前校验音频、歌词、分镜、图片是否齐全。
- 导出历史展示 status、错误、视频地址。

验收：

- 用户可以调整字体、字号、颜色、阴影、位置。
- 导出视频使用用户配置的字幕样式。
- 导出成功后可以在线播放并打开 MP4。

## 3. 前端工作台

第一阶段可以在现有 tabs 上迭代；第二阶段升级为编辑器布局：

- 左侧：项目列表、新建项目、全局风格、字幕样式。
- 中间：视频预览、音频播放器、当前歌词显示。
- 右侧：scene timeline、歌词行、分镜图片、prompt 编辑。
- 顶部：项目状态、保存、生成、导出。

交互原则：

- 用户当前所在阶段必须清晰。
- 每个生成动作都要有 loading、success、failed 状态。
- 危险或高成本动作需要明确按钮文案，例如“重新生成全部图片”。
- 移动端可以退化为 tabs，但不能出现内容重叠或按钮溢出。

## 4. 数据模型

继续使用现有四张表：

- `lyric_video_project`：项目、音频、全局风格、渲染状态。
- `lyric_video_line`：歌词行和时间戳。
- `lyric_video_scene`：分镜、prompt、图片任务、图片地址、状态。
- `lyric_video_export`：导出任务、视频地址、导出设置、费用。

后续可能新增字段：

- `lyric_video_project.characterPrompt` 或放入 `previewConfig.characterPrompt`。
- `lyric_video_scene.subtitleConfig`，如果需要 scene 级字幕覆盖。
- `lyric_video_scene.videoUrl`，等 v2 支持图生视频后再加。

第一阶段优先复用 JSON 字段，避免过早扩表。

## 5. API 约定

保留现有路由：

- `GET /api/lyric-videos`
- `POST /api/lyric-videos`
- `GET /api/lyric-videos/[id]`
- `PATCH /api/lyric-videos/[id]`
- `DELETE /api/lyric-videos/[id]`
- `POST /api/lyric-videos/[id]/transcribe`
- `POST /api/lyric-videos/[id]/lyrics`
- `POST /api/lyric-videos/[id]/storyboard`
- `PATCH /api/lyric-videos/[id]/scenes/[sceneId]`
- `POST /api/lyric-videos/[id]/images`
- `GET /api/lyric-videos/[id]/images`
- `POST /api/lyric-videos/[id]/exports`

后续新增：

- `POST /api/lyric-videos/[id]/scenes/[sceneId]/split`

所有 API 继续返回 `respData` 或 `respErr`，不直接返回 `NextResponse.json`。

## 6. 状态流转

项目阶段建议：

- `draft`
- `uploaded`
- `lyrics_ready`
- `storyboard_ready`
- `images_processing`
- `images_ready`
- `rendering`
- `export_ready`
- `transcription_failed`
- `export_failed`

scene 状态建议：

- `draft`
- `processing`
- `success`
- `failed`

export 状态建议：

- `pending`
- `processing`
- `success`
- `failed`

## 7. 验收与测试

每个功能完成后：

- 运行 `pnpm build`。
- 手动验证完整流程：上传音频 -> 保存歌词 -> 生成分镜 -> 生成图片 -> 导出 MP4。
- 验证异常输入：未登录、缺音频、缺歌词、缺分镜、缺图片、AI 失败、FFmpeg 失败。
- 检查桌面、平板、手机布局，确保文本和按钮不重叠。

文档完成后无需运行 build；涉及代码改动后必须运行 build。
