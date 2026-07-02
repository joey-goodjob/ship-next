# Scene Image Sync Latency TODO

> 暂时不改代码。这个文档记录当前图片生成“供应商已完成，但前端很久才显示”的待优化问题。

## 背景

真实测试里看到的现象：

- Kie 后台图片任务大约 20 多秒已经生成完成。
- Preview 工作台仍然显示 `Generating images`，例如 `27/47`。
- 用户感觉是“后台早好了，但返回到前端很慢”。

当前主链路不是一张 scene 对应一个 provider task，而是把最多 9 个 scene 合成一张 `3x3` 九宫格图，再同步回来裁切成单张 scene 图片。

## 当前代码判断

关键位置：

- `src/modules/lyric-videos/lyric/media-generation.ts`
  - `GRID_SCENE_IMAGE_SIZE = 3`
  - `GRID_SCENE_IMAGE_BATCH_SIZE = 9`
  - `GRID_IMAGE_SYNC_READY_BATCH_LIMIT = 1`
  - `syncGridSceneImageBatch()`
  - `syncSceneImages()`
- `src/components/lyric-videos/preview-workbench/editor-provider.tsx`
  - `syncSceneImages()` 每 5 秒轮询一次 `/api/lyric-videos/:id/images`
- `src/app/api/lyric-videos/[id]/images/route.ts`
  - `GET` 才触发后端查询 provider、下载、裁切、保存、写 DB

当前瓶颈：

```text
Kie task success
  -> 等前端下一次 5s 轮询
  -> GET /api/lyric-videos/:id/images
  -> 后端每次最多只处理 1 个 ready batch
  -> 下载 Kie 九宫格原图
  -> sharp 裁切 9 张 scene 图片
  -> 上传/保存每张图片
  -> 写 image candidate 和 scene.imageUrl
  -> 前端 refresh 后才显示
```

所以 5 张九宫格图，也就是最多 45 张 scene 图片，即使 Kie 已经全部完成，当前也至少需要 5 轮同步。

粗略时间：

- 理想下限：约 25-30 秒。
- 常见情况：约 30-60 秒。
- 如果 Kie 图片下载慢、R2 上传慢、Vercel 冷启动或网络抖动，会更久。

## 优化目标

- Kie 已完成后的前端等待时间明显缩短。
- 用户不再长时间卡在 `27/47`、`36/47` 这种批量同步中间态。
- 不牺牲稳定性，不让单次 API 请求过重导致超时或内存压力。
- 用户离开页面后，图片同步也应该能继续推进，而不是完全依赖前端轮询。

## 建议修复顺序

### P0 - 一次同步多个 ready batch

把 `GRID_IMAGE_SYNC_READY_BATCH_LIMIT` 从 `1` 调高到保守值，例如 `2` 或 `3`。

预期收益：

- 5 个 ready batch 不再需要 5 轮轮询。
- 如果设为 `3`，大约 2 轮可处理完，前端等待可能从 30-60 秒降到 10-25 秒。

注意：

- 需要看 `route-sync-success.durationMs`、`batch-synced.batchTotalMs`。
- 如果单次请求太重，再降回更保守的值。
- 不建议一开始直接无限处理所有 ready batch。

### P0 - 单 batch 内裁切/保存有限并发

当前 `syncGridSceneImageBatch()` 里每个 scene 是顺序裁切、保存、写库。

可以把 9 张 panel 的处理改成有限并发，例如每次 2-3 张：

- 保持 sharp / R2 / DB 压力可控。
- 减少 `cropSaveDbMs`。
- 不改变九宫格生成协议。

### P1 - 增加更清楚的同步阶段日志

当前 `batch-synced` 已经记录：

- `providerQueryMs`
- `downloadMs`
- `cropSaveDbMs`
- `batchTotalMs`

后续可以补充：

- selected ready batch 数量。
- 本次跳过的 ready batch 数量。
- 每批 scene 数量。
- route 总耗时和每个 batch 耗时对应关系。

验收时要能回答：

- 慢在 provider query？
- 慢在下载 Kie 原图？
- 慢在 sharp 裁切？
- 慢在上传/保存？
- 还是慢在每 5 秒只同步 1 批？

### P1 - 后端后台同步，不依赖前端轮询

长期更好的方向：

```text
provider task queued
  -> 后端 worker / cron / queue 定期检查 ready batch
  -> ready 后立即下载裁切保存
  -> 前端只负责读状态
```

这样用户离开页面也不会中断推进，前端不再承担“驱动任务完成”的职责。

可以先复用现有 `syncSceneImages()` 逻辑，但由后台任务调用。

### P2 - Provider callback / webhook

如果 Kie 支持 callback，可以在 provider 完成时直接触发同步：

- 去掉 provider polling 的等待。
- Kie success 后更快进入下载裁切保存。

必须设计：

- 回调签名校验。
- 幂等处理。
- 重复回调保护。
- 回调失败后的 fallback polling。

### P2 - SSE / WebSocket 推送前端状态

这个只能减少“后端已经写库但前端还没刷新”的几秒，不解决裁切/上传本身。

适合作为后台同步稳定后的体验优化。

## 验收标准

- 5 个九宫格 batch 在 provider 已完成后，不再需要 5 轮前端轮询才能全部显示。
- `batch-synced` 日志能看到单次 sync 处理多个 ready batch。
- `route-sync-success.durationMs` 不出现明显超时风险。
- Preview 工作台进度从 `27/47` 到完成的等待明显缩短。
- 图片候选、scene.imageUrl、billing run finalization 仍然正确。
- `pnpm build` 通过。

## 第一版建议范围

先做低风险收敛：

- 调高 ready batch sync limit 到 `2` 或 `3`。
- 观察真实 run 的 `route-sync-success.durationMs` 和 `batch-synced.batchTotalMs`。
- 如果单次耗时稳定，再考虑 batch 内有限并发。

暂时不建议第一版直接上 worker、webhook 或 SSE。
