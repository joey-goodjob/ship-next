# Preview Scene Video First Playback Buffering TODO

> 暂时不改代码。这个文档记录后续要做的预览播放改善：刚生成后第一次播放时，分镜视频不要先停在静态首帧/海报图上，等一段时间后才开始动。

## 背景

当前 preview workbench 的播放是音频主时钟驱动：

- 音频、字幕、时间轴会正常往前走。
- 当前分镜画面来自 scene 的 `videoUrl`。
- scene 的 `imageUrl` 会作为视频 `poster`。
- 切到新分镜时，浏览器需要加载/缓冲这个分镜的视频。

刚生成完第一次预览时，分镜视频通常还没有进入浏览器缓存。用户看到的表现是：画面切到了新分镜，但先停在一张静态图/首帧上，过了大约一段时间后视频运动才突然开始。第二遍播放通常正常，因为视频已经被浏览器缓存。

## 初步判断

高概率不是字幕、时间轴或动画参数本身的问题，而是视频首次播放的缓冲/解码未就绪：

- 当前 `<video>` 使用 `poster={imageUrl}`，未就绪时浏览器会显示静态 poster。
- 播放时间由 audio 推进，video 只是跟随 `currentTime`。
- 新分镜视频首次加载时，如果 `readyState` 不足或目标时间点还没缓冲，画面会停在 poster/首帧。
- 预加载目前只覆盖当前分镜附近的少量视频，刚生成后第一次播放可能来不及把后续分镜都铺进缓存。

还需要补充验证视频文件和存储层：

- MP4 是否适合 fast start。
- R2/CDN 是否支持 range request。
- 视频关键帧间隔是否导致 seek 后必须等待较久才能解码。
- 缓存头是否利于浏览器复用。

## 改善目标

- 清空缓存后的第一次预览，进入新分镜时不要出现明显的“音频走了，画面还停在静态图”的错位。
- 如果当前分镜视频尚未就绪，音频、字幕、时间轴也应等待或给出明确 loading 状态。
- 第二遍播放体验不能变差。
- 拖动时间轴、上一/下一分镜、单分镜预览不能被破坏。

## 建议修复方向

### 1. 先加运行时证据

给当前分镜视频增加临时或开发态诊断日志，记录：

- `sceneId`
- `videoUrl`
- `currentTime`
- `readyState`
- `networkState`
- `buffered ranges`
- `loadedmetadata`
- `loadeddata`
- `canplay`
- `playing`
- `waiting`
- `stalled`
- `error`

确认第一次卡住时是否确实是视频未 ready 或目标时间点未缓冲。

### 2. 增加优先级预缓冲

不要只依赖当前隐藏 `<video preload="auto">` 的少量邻居预加载。建议抽一个轻量 preload manager：

- 当前分镜最高优先级。
- 下一分镜、下下分镜优先。
- 上一分镜次优先。
- 后续分镜低优先级排队。
- 控制并发，避免一次性拉太多视频影响主播放。

### 3. 分镜切换时增加视频就绪门槛

当时间轴进入新分镜时，如果视频还没达到可播放状态：

- 暂停或延迟音频主时钟。
- 等当前分镜视频 `canplay` 或 `readyState >= HAVE_FUTURE_DATA` 后再一起继续。
- 超过短阈值时显示轻量 loading，避免用户以为视频已经在播放。

### 4. 后续再评估双 video 缓冲

如果预缓冲和就绪门槛仍不够，再考虑 A/B 双 `<video>`：

- 一个负责当前播放。
- 一个提前加载下一分镜。
- 下一分镜 ready 后再切换显示层。

这部分复杂度更高，第一版不建议直接上。

### 5. 检查视频文件生成和上传链路

抽样检查刚生成的分镜视频：

- 是否 fast start。
- 是否支持 range request。
- 关键帧间隔是否合理。
- 首次加载 TTFB 和下载速度是否异常。
- CDN/R2 缓存头是否合理。

如果视频文件本身不利于流式预览，应在 worker 上传前做 remux/优化，或生成更轻量的 preview 版本。

## 可能涉及文件

- `src/components/lyric-videos/preview-workbench/video-preview.tsx`
- `src/components/lyric-videos/preview-workbench/playback-context.tsx`
- `src/components/lyric-videos/preview-workbench/utils.ts`
- `src/modules/lyric-videos/lyric/worker-render.ts`
- `src/modules/lyric-videos/lyric/scene-video-generation.ts`
- storage / R2 upload 相关 service

## 验收标准

- 清空浏览器缓存后第一次播放，分镜切换时不再明显停在静态 poster。
- 视频未就绪时，音频不会独自继续往前跑。
- 首次播放和第二遍播放都保持音频、字幕、画面同步。
- 时间轴拖动、上一/下一分镜、单分镜 preview 仍正常。
- 有日志或测试能证明卡顿点从视频未 ready 变成可控等待。
- `pnpm build` 通过。

## 第一版建议范围

先做低风险改善：

- 开发态诊断日志。
- 优先级预缓冲。
- 当前分镜视频就绪门槛。

暂不做：

- 大规模重构播放架构。
- 双 video 缓冲。
- worker 侧视频 remux，除非证据证明 MP4 文件结构就是主要瓶颈。
