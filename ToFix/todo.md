# Lyric Video Pipeline Robustness TODO

> 暂时不修代码。这个文档用于记录当前测试中暴露出的健壮性问题，后续按优先级逐个修。

## 背景

当前主链路已经能进入真实 AI pipeline，但整体还偏 happy path：

```text
/generate
  -> audio_prepare
  -> asr_words
  -> song_analysis
  -> prompt_generation
  -> image_generation
  -> provider callback/query
  -> render/export
```

真实测试里，AI provider 和模型返回经常会出现少量缺失、字段不完整、JSON 不稳定、任务等待、缓存陈旧等情况。现在很多“可恢复问题”会被当成 fatal error，导致整条 run 停住，用户看到的表现就是卡在某个百分比。

## P0 - Prompt2 partial success recovery

### 问题

Prompt2 已返回大部分 scene prompt，但缺少少量 scene 时，当前代码会整批失败。

典型例子：

- 目标 scene：65 个
- Kie / Claude 实际返回：63 个
- 当前结果：`prompt_generation` 卡在 75%，63 个已生成 prompt 也不落库

### 判断

这不是 Kie 不可用，也不是 Prompt2 完全失败，而是可恢复的结构缺口。

### 建议修复

在 `generateStoryboardScenesWithKieClaude()` 中区分：

- `0` 个有效 scene：真实 Prompt2 失败，继续 fail
- 部分 scene 缺失：记录 `missingSceneIds`，进入 targeted retry
- 个别 scene 缺少 `image_prompt` 或 `video_prompt`：记录 `incompleteSceneIds`，进入 targeted retry

targeted retry 后仍缺失的 scene，用 `fallbackPromptForFixedScene()` 兜底补齐。

### 验收

- `prompt_generation` 不再因为少量 scene 缺失卡在 75%
- `lyric_video_scene` 最终有完整 scene 数量
- 每个 scene 都有 `prompt` 和 `motionPrompt`
- step output 记录：
  - `sceneCount`
  - `missingSceneIds`
  - `incompleteSceneIds`
  - `retriedSceneIds`
  - `fallbackSceneIds`
- UI 显示为成功但带 warning，而不是整批失败

## P0 - 明确 fatal / warning / waiting 三类状态

### 问题

当前很多阶段只有 success / failed，但真实 pipeline 需要更细的状态语义。

### 建议分类

必须停：

- 没有音频
- ASR 没有歌词 segments
- Prompt1 返回空分析
- Prompt2 返回 0 个有效 scene
- 图片任务一个 provider task 都没有排进去

不该停，只记录 warning：

- Prompt2 少量 scene 缺失
- Prompt2 个别 scene prompt 字段不完整
- 少量 scene 使用 fallback prompt
- 部分图片还在等待或少量图片失败

异步等待：

- image generation 已排队，但 provider 还没完成
- render/export 等待图片完成

### 验收

- 每个 generation step output 能说明真实原因
- UI 不再把 warning 误导成 provider 不可用
- 可恢复问题不会阻塞后续阶段

## P1 - AI provider 返回适配层

### 问题

外部 AI 返回不稳定，当前主流程对返回结构的容忍度不够。

常见情况：

- JSON 被截断
- 字段名不一致
- scene_id 类型不一致
- scene 数量少
- prompt 字段为空
- 模型返回额外 markdown 或解释文本

### 建议修复

在进入主流程前增加统一适配步骤：

```text
raw provider response
  -> parseJsonLoose
  -> normalize
  -> validate contract
  -> repair / retry / fallback
  -> stable domain object
```

### 验收

- 主流程只消费稳定的 domain object
- provider 原始返回保留在 step output 或 debug fixture 中
- normalize / repair 过程有可观察日志

## P1 - 阶段级 retry / resume

### 问题

现在一旦中间阶段失败，测试时经常需要重新跑整条链路，成本高且容易制造新的变量。

### 建议修复

支持按阶段恢复：

- ASR 成功后，不重复转写
- Prompt1 成功后，可复用 song analysis
- Prompt2 失败后，可只重跑 Prompt2
- 图片排队失败后，可只重排图片任务

### 验收

- 一个项目可以从指定阶段继续跑
- 已成功落库的数据不会被无意义覆盖
- rerun 时 step input/output 能看出复用了哪些上游结果

## P1 - 固定回归样本和测试协议

### 问题

现在经常用全流程测试定位问题，导致任何阶段失败都会让排查范围变大。

### 建议测试方式

固定至少一首测试歌作为回归样本：

- 固定 project id
- 固定音频
- 固定期望 scene 数量
- 固定需要检查的数据库字段

测试分层：

1. 阶段测试：单独验证 ASR / Prompt1 / Prompt2 / image queue
2. 恢复测试：专门验证 missing scene、字段缺失、provider waiting
3. 全流程 smoke test：最后只验证能走到 image queue 或 render ready

### 验收

- 每次改 pipeline 后都有同一组检查项
- 不再靠肉眼看“卡百分比”判断问题
- 有明确的 pass / fail 标准

## P2 - UI 诊断文案优化

### 问题

用户看到的是百分比卡住，但不知道真实错误边界。

### 建议修复

诊断面板按 step 展示：

- 当前 step
- step status
- fatal error
- warning list
- retry / fallback 使用情况
- provider task ids
- 下一步等待什么

示例文案：

```text
Prompt2 succeeded with warnings.
2 scenes were missing from the first response.
1 scene was repaired by targeted retry.
1 scene used fallback prompt.
Image generation has started.
```

### 验收

- 用户能区分 Kie 不可用、Prompt2 partial success、provider waiting
- 卡住时能直接看到应该查哪个阶段

## P2 - Debug fixture / cache 可见性

### 问题

debug fixture 缓存是重要工具，但缓存陈旧时容易误判为代码没生效。

### 建议修复

- 在 debug response 中显示 fixture key
- 显示是否命中 cache
- 显示 raw provider stop reason
- 提供 refresh cache 的明显入口或参数

### 验收

- 排查时能快速确认当前结果来自新请求还是旧 fixture
- LLM 截断、空 JSON、旧缓存能被快速识别

## 推荐修复顺序

1. P0: Prompt2 partial success recovery
2. P0: fatal / warning / waiting 状态分类
3. P1: 阶段级 retry / resume
4. P1: 固定回归样本和测试协议
5. P2: UI 诊断文案优化
6. P2: Debug fixture / cache 可见性

## 当前最小下一步

先只修 Prompt2：

```text
少量 scene 缺失
  -> targeted retry
  -> 仍缺则 fallback
  -> replaceScenes 写完整 scene
  -> image_generation 继续排队
```

这一步完成后，整条 pipeline 的测试体验会明显改善。

## P1 - Preview Workbench 编辑器多语言化

### 问题

当前 preview workbench 不是完整多语言界面。外层站点已经有 `en/zh` locale 文件，但编辑器内部仍有不少硬编码英文。

已确认的明显范围：

- `src/components/lyric-videos/preview-workbench/font-panel.tsx`
  - `Subtitles`
  - `Display`
  - `Show Whole Verse`
  - `Words Per Group`
  - `Lyrics Style`
  - `Font Family`
  - `Font Style`
  - `Font Case`
  - `Alignment`
  - `Anchor`
  - `Rotation Angle`
  - `Stroke`
  - `Drop Shadow`
  - `Composite`
  - `Effect`
- preview workbench 其他面板也需要继续扫：
  - `Customize`
  - `Lyrics`
  - `Cast`
  - `Scenes`
  - `Exports`
  - `Diagnostics`
  - toast / modal / empty state / error state 文案

如果后期做多语言市场，会出现外层页面已切换语言，但编辑器工具栏仍然是英文的问题。

### 建议修复

先从 `Font` 面板开始做 i18n，避免一次性改太大：

1. 在 `src/config/locale/messages/en/dashboard.json` 增加 `dashboard.workbench.font` 文案。
2. 在 `src/config/locale/messages/zh/dashboard.json` 增加对应中文文案。
3. `font-panel.tsx` 使用 `useTranslations("dashboard.workbench.font")`。
4. 保留字体名、blend mode value、effect id 这类技术值为英文，但 UI label 走翻译。
5. 后续再按面板逐个迁移 `Customize / Lyrics / Cast / Scenes / Exports / Diagnostics`。

### 验收

- `/en/.../preview` 下 Font 面板显示英文。
- `/zh/.../preview` 下 Font 面板显示中文。
- 切换 locale 后，工具栏 tab、面板标题、按钮、helper、placeholder、toast 不再混用英文。
- TypeScript build 通过。
- 不改变 `previewConfig` 存储结构，不影响已有项目的字幕样式配置。
