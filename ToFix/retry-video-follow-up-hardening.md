# Retry Video Follow-up TODO

> 暂时不改代码。这个文档记录 Retry Video 主链路修复后的后续加固项：UI pending 闪烁、历史重复 candidate 清理、以及 DB 唯一约束。

## 背景

Retry Video 的核心数据链路已经修到可用：

- 点击 Retry Video 后会 queue 当前 scene 的视频生成。
- KIE success 后，新视频会写入正确 scene 的 video candidates。
- 当前视频会在 retry 前保留为候选，避免被新视频覆盖后丢失。
- sync 写入侧已经按 `processing + providerTaskId` 做 claim，降低并发重复写入。
- 前后端候选展示已经按 `sceneId + providerTaskId / videoTaskId / videoUrl` 做去重。

剩下的问题主要是体验稳定性和数据库层加固，不是当前主功能不可用。

## 待处理 1：Retry Video Pending UI 闪烁

### 现象

在 Batch Generation 里点击某个 scene 的 Retry Video：

- pending/loading 占位框会立即短暂出现。
- 随后可能消失一下。
- 等 toast 提示队列已开始后，pending 又出现。
- KIE success 后，新候选出现，但 pending 框有时还会再转一下再消失。

最终数据结果是对的，但 UI 看起来像本地 optimistic state 和 refresh/sync 返回的数据在打架。

### 初步判断

高概率是状态覆盖顺序问题：

- 点击 Retry Video 时，前端先 optimistic 设置 `videoStatus = processing`。
- POST `/scene-videos` 还没完成前，某个 GET `/scene-videos` 或 project `refresh()` 返回旧 DB snapshot。
- 旧 snapshot 里 scene 仍是 `success`，把本地 pending 覆盖掉。
- POST queue 成功后返回真正的 `processing`，pending 又出现。
- success 时，本地 pending flag 和服务端 success 清理时机不同，导致 loading 框短暂残留。

### 重点检查文件

- `src/components/lyric-videos/preview-workbench/editor-provider.tsx`
  - `queueSceneVideos()`
  - `syncSceneVideos()`
  - `refresh()`
  - optimistic `applyQueuedSceneVideo()`
  - in-flight scene id 状态
- `src/components/lyric-videos/preview-workbench/scene-video-candidates.ts`
  - `applyQueuedSceneVideo()`
  - `getSceneVideoCandidateDisplayList()`
  - `getSceneVideoCandidateStripItems({ pending })`
- `src/components/lyric-videos/preview-workbench/scenes-panel.tsx`
  - Retry Video 按钮点击后 pending prop 的来源
  - KIE success 后 pending 的清理时机

### 修复方向

- 给每个 retry scene 维护稳定的 local pending / in-flight 状态，按 `sceneId` 独立。
- POST queue 未返回前，禁止旧 refresh snapshot 清掉 optimistic pending。
- sync success 返回新 candidate 后，再清掉对应 scene 的 pending。
- 避免 pending 同时由多个来源重复计算，例如 `scene.videoStatus === "processing"` 和本地 in-flight 同时各加一个 loading item。

### 验收标准

- 点击 Retry Video 后，pending 框立即出现。
- 从点击到 KIE 完成之前，pending 框不消失、不跳动。
- POST queue 慢时，旧 refresh 不会覆盖 optimistic pending。
- KIE success 后，新视频候选出现，pending 框稳定消失。
- 两个 scene 同时 retry 时，各自 pending 只在自己的候选条里显示。

### 建议测试

- POST queue pending 期间，refresh 返回旧 scene，不应清掉 optimistic pending。
- sync success 返回新 candidate 后，应清掉 pending。
- 两个 scene 同时 retry 时，pending 状态按 sceneId 独立维护。

## 待处理 2：历史重复 Video Candidate 清理清单

### 现象

历史 DB 中可能已经存在重复 video candidate 行。典型重复是：

- 同一个 `scene_id`
- 同一个 `provider_task_id`
- 来自同一次 KIE 任务
- 因旧代码并发 sync 被插入多条
- 可能每条有不同 R2 `video_url`，但本质代表同一个 KIE 生成结果

这类数据不是视频坏了，也不是 KIE 返回错了，而是同一次生成结果被重复写入 DB。

### 风险

- UI 在旧代码或未去重路径下可能显示多个重复候选。
- 刷新前后候选数量可能不一致。
- 后续加唯一索引前，如果不清理重复行，migration 会失败。

### 建议处理方式

先只出清单，不直接删除：

```sql
select
  scene_id,
  provider_task_id,
  count(*) as duplicate_count,
  array_agg(id order by created_at desc) as candidate_ids
from lyric_video_scene_video_candidate
where provider_task_id is not null
group by scene_id, provider_task_id
having count(*) > 1
order by duplicate_count desc, scene_id;
```

确认后再做清理：

- 每组保留 `created_at` 最新的一条。
- 其他重复行先导出备份清单。
- 经人工确认后再删除。

## 待处理 3：DB 唯一约束加固

### 背景

当前应用层已经有查重和 sync claim，正常场景基本能防重复。但数据库层还没有最后一道唯一约束。

### 建议

清理历史重复数据后，再加唯一索引：

- 优先约束：`scene_id + provider_task_id`
- 只对 `provider_task_id is not null` 生效
- 如果后续需要，再考虑 `scene_id + video_task_id`

PostgreSQL 示例：

```sql
create unique index if not exists lyric_video_scene_video_candidate_scene_provider_unique
on lyric_video_scene_video_candidate (scene_id, provider_task_id)
where provider_task_id is not null;
```

### 注意

- 必须先清理历史重复行，否则唯一索引可能创建失败。
- schema/migration 需要按当前 DB provider 生成，不要手写后直接跳过迁移流程。
- 加唯一约束后，插入逻辑最好配合 `on conflict do nothing` 或等价处理，避免并发下抛不必要错误。

## 推荐优先级

1. 先修 Pending UI 闪烁，因为这是用户能直接看到的体验问题。
2. 再出历史重复 candidate 清理清单，先不删除。
3. 清理确认后，加 DB 唯一约束。
4. 最后做一次真实 Retry Video 回归测试。

## 真实验证路径

- 打开 `http://localhost:3000/creations/fde611bc-0667-4223-b44d-b31531bc4d58/preview`
- 进入 `Scenes -> Batch Generation`
- 任意两个 scene 连续点击 Retry Video
- 观察 pending 是否稳定、候选是否只进入对应 scene
- 同时检查 server log、`lyric_video_scene`、`lyric_video_scene_video_candidate`

