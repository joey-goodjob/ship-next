# Create / Preview Flow TODO

> 暂时不改代码。这个文档记录 Create 上传页、Preview 工作台、Story 确认和样片预览这条体验链路的后续改动方向。

## 当前决定

这次先不继续拆 Create 到 Preview 的流程。

已经确认要保留当前稳定链路：

- `/create` 上传或导入音频。
- 上传后继续走现有自动转录、歌词检测、Prompt1 / direction generation。
- 生成 story direction 后进入 preview/workbench。
- Suno 首页弹窗、Create 页弹窗、Suno 导入接口都保留。

之前尝试过的 `Customize before generating` / `setup=1` / 延迟 direction generation 方案已经撤回。

## 后续想改的方向

### 1. Create 页变轻

理想体验：

- `/create` 只负责上传、导入音频、裁剪、创建项目。
- 不要在上传页下面强塞人物选择。
- 风格、人物、故事方向更适合放到 preview/workbench 里。

注意：

- 不能破坏上传后的自动转录、歌词检测、Prompt1 和 direction generation。
- 不能简单删除人物功能，只是未来考虑迁移位置。
- 如果迁移人物选择，需要确认角色信息什么时候写入 cast、什么时候参与 Prompt2 / image prompt。

### 2. Preview 阶段要有清楚的 Story 确认引导

问题：

- 短歌可能只有 3-4 个分镜。
- 当前有时会直接进入已经生成好的状态，用户看不到类似 `Confirm Story` 的引导栏。
- 用户会不知道下一步应该先确认 story，还是已经可以改字体、人物、分镜。

后续要确认：

- 长歌和短歌都应该有一致的 Story review 状态。
- 如果 direction ready 但 scenes/images 未正式生成，应该明确提示用户先确认 story。
- 不能因为 scene 数量少就跳过 review 引导。

### 3. 生成前增加样片预览

目标：

- 用户正式生成完整视觉前，先看到一组样片，心里有底。
- 初步想法是沿用当前“一张图生成 9 个分镜再切割”的机制。
- 可以先生成前 9 个分镜样片；如果短歌只有 3-4 个分镜，就按实际分镜数生成，不强行补满 9 张。

第一版建议：

- 不新造复杂机制。
- 复用现有 storyboard scene 和 image batch 生成能力。
- 在用户确认 story 后，先生成一组 preview storyboard images。
- 样片生成完成后，用户再决定是否继续完整生成。

### 4. 风格切换后样片要能跟着变化

理想体验：

- 默认先展示 realistic 风格样片。
- 用户切换 pixel / anime / 3D / cartoon 等风格后，样片能切到对应风格。
- 用户能直观看到同一组分镜在不同风格下的视频气质。

实现前必须先设计：

- 同一个 project、style、scene range 的样片缓存 key。
- 是否重复扣积分。
- 切换风格时是立即生成、用户点击生成，还是显示已有缓存。
- 旧样片是否保留，是否允许用户回切。

### 5. 避免重复图片请求

问题：

- 之前长歌测试时看到过两个图片生成请求。
- 如果未来增加提前样片，更容易出现重复排队、重复扣积分、重复生成。

后续必须加防护：

- 同一 project + style + scene range + prompt version 不应重复排队。
- 已有成功样片时优先复用。
- 已有 running/pending 任务时前端显示等待，不再发第二个请求。
- 后端也要有幂等或去重保护，不能只靠前端按钮 disabled。

## 建议实施顺序

### Phase 1 - 先修 Preview 引导

低风险，不动生成大架构：

- 确保短歌、长歌都能显示 Story review / Confirm Story 引导。
- 明确 direction ready、scene ready、image queued、image ready 的 UI 状态。
- 不让用户进入 preview 后迷路。

验收：

- 3-4 个分镜的短歌仍然会看到清楚的 Story 确认引导。
- 没确认 story 前，不应该表现得像完整生成已结束。
- 不影响现有自动转录和 Prompt1 direction generation。

### Phase 2 - 再做样片预览

在 Phase 1 稳定后再做：

- 用户确认 story 后生成前 N 个分镜样片。
- N 默认最多 9，短歌按实际 scene 数量。
- 加缓存和去重，避免重复请求。
- 样片和正式完整生成要区分清楚。

验收：

- 用户能先看到样片，再决定是否继续完整生成。
- 切换风格时能看到对应风格样片，或清楚知道需要重新生成。
- 不重复扣费，不重复排同一批图片任务。

## 暂时不要做的事

- 不要再直接把 `/create` 改成只创建 draft 然后 `?setup=1` 进 preview。
- 不要打断当前自动转录、歌词检测、Prompt1 / direction generation。
- 不要为了隐藏人物选择而删除 cast 功能。
- 不要先做九宫格样片但没有去重、缓存和扣费策略。
