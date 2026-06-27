# Batch Generation Row Layout TODO

> 暂时不改代码。这个文档记录后续要做的 Batch Generation UI 收敛方向。

## 背景

当前 Batch Generation 已经支持右侧视频候选组合，但整体视觉仍偏重：

- 左右模块像两个厚重卡片并排。
- 边框、按钮、状态、积分 badge、候选条同时出现，信息层级有点碎。
- 视频候选条功能清楚，但整体占地感偏强。
- 相比竞品的 storyboard row，我们的每个 scene 看起来更冗杂，不够规整。

参考竞品里更舒服的点：

- 一行就是一个 scene，左右工作区都在同一个 row 里。
- Create Still Image 和 Animate the Image 是并列单元，不像两个独立大卡片。
- 媒体预览尺寸克制，prompt 和 media 比例平衡。
- 候选缩略图很轻，贴近媒体，不像一条重工具栏。
- 操作按钮收在模块右上角，存在感低。
- 选中态主要强调整行，而不是内部到处高亮。

## 改善目标

把 Batch Generation 从“两个重卡片并排”收敛成“统一 storyboard row”：

- 每个 scene 一眼能被识别为一整行。
- 左右 Create Still Image / Animate the Image 的标题、内容区、缩略图规则一致。
- 视频区保持 16:9，但更克制，不抢主视觉。
- 候选图存在但不吵。
- 页面看起来更像专业编辑器，而不是多个卡片拼起来。

## 建议改动

### 1. 统一 Scene Row 外框

- 每个 scene 用一个完整 row 容器包住左右两块。
- 选中态只放在 row 外层，例如细蓝色边框或左侧 accent line。
- 内部 Create Still Image / Animate the Image 不再各自像独立大卡片，而是 row 里的两个 panel。

### 2. 左右模块使用同一套布局规则

- 左侧结构：`prompt + image preview + image candidates`
- 右侧结构：`motion prompt + video preview + video candidates`
- 两边保持一致的标题高度、内容区高度、间距、缩略图尺寸。
- 图片和视频要像同一个系统里的两种 media，而不是临时拼接。

### 3. 降低候选条存在感

- 保留图片/视频候选选择能力。
- 候选缩略图更小，靠近主媒体底部或左下角。
- 左右翻页按钮弱化，只在候选数量超过可见数量时更明显。
- 选中态保留描边和 check，但候选条整体不要太像工具栏。

### 4. 压缩操作按钮层级

- `Retry Image` / `Retry Video` 保留在对应模块右上角。
- model selector 和 retry video 按钮更紧凑。
- scene 顶部 `5 credits` badge 弱化，或只在按钮里显示费用，减少重复信息。

### 5. 媒体尺寸更克制

- 视频保持 16:9，但设置稳定最大宽度。
- 图片和视频预览使用稳定尺寸，避免每行视觉高低不一。
- 候选图不能把 row 撑高，主预览才是主视觉。

### 6. 减少边框和嵌套感

- 外层 row 边界清楚。
- 内部用背景深浅区分区域，少用硬边框。
- Prompt textarea 可以保留边框，media preview 不需要强边框。
- 避免外框、内框、textarea、preview、候选条全部抢视觉。

### 7. 底部批量操作栏降低干扰

- 底部 sticky 操作栏保留。
- 增加内容区 bottom padding，避免遮挡最后一行。
- 只强调主动作，其它按钮使用次级样式。

## 验收标准

- 一眼能看出每一行是一个 scene。
- 左右模块高度、间距、标题位置一致。
- 视频区域比当前更克制，不抢过 prompt 和图片区域。
- 候选图可用，但视觉存在感更轻。
- 选中 scene 时只强调整行。
- 页面整体更接近竞品的 storyboard editor，而不是卡片堆叠。

## 第一版建议范围

先做低风险 UI 收敛，不改功能：

- row 级统一外框
- 去掉左右大卡片的重边框感
- 统一左右内部 grid
- 缩小并弱化候选条
- 弱化 credit badge
- 调整底部 sticky 遮挡

