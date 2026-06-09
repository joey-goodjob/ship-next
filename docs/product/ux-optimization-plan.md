# Lyric Video Studio — UX 优化方案

## 一、当前用户流程诊断

### 完整动线（现状）

```
首页上传音频 → [等待上传] → 创建项目 → [等待 ASR + Prompt1 ~60-90s]
  → 跳转 preview workbench → 用户看到 Customize 面板
  → 手动切 Scenes tab → 点 Batch Generation → [等待 Prompt2 + 图片生成 ~120-300s]
  → 逐个检查 scene → 点 Export → [等待渲染 ~30-60s] → 下载
```

### 核心痛点

| 阶段 | 痛点 | 严重程度 |
|------|------|----------|
| 上传后等待 | 60-90s 无交互黑洞，只有 spinner + "Preparing lyrics and story direction..." | **致命** |
| 进入工作台 | 默认打开 Customize，但此时用户最该做的是审核 Story 和 Lyrics | **严重** |
| 5 个 tab 平铺 | 没有顺序引导，用户不知道该先看哪个、什么时候该切下一个 | **严重** |
| Scenes 生成等待 | Prompt2 + 图片生成 120-300s，用户只能盯进度条 | **严重** |
| Story 编辑锁死 | scenes 创建后 Story/Style/Palette/Format 全部锁死，但没有提前告诉用户"改完再往下走" | **中等** |
| Export 按钮位置 | 右上角，生成完图片后用户不一定注意到 | **轻微** |

---

## 二、全流程体验地图（目标态）

### 设计原则

1. **渐进式披露**：不要一次暴露所有功能，按流程阶段逐步解锁
2. **等待时有事做**：每个长等待都给用户一个有意义的交互选项
3. **明确的"下一步"**：每个阶段完成后，界面要告诉用户接下来做什么
4. **不可逆操作前确认**：进入 scenes 生成前明确告知"之后 Story 不可改"

### 目标用户流程

```
首页上传 → 音频裁剪/角色选择 → 点击生成
  → 进入工作台（Step 1: Direction）
    → 背景执行 ASR + Prompt1
    → 用户看到实时进度：识别歌词中... → 分析情绪中... → 生成故事方向中...
    → 歌词先到 → 弹出歌词面板让用户校对（有事做！）
    → Story 到达 → 高亮 Story 区域 + toast "Story ready, review before proceeding"
  → 用户审核/编辑 Story、Style、Palette、Format
  → 点击 "Generate Scenes" （明确警告：之后 Direction 锁定）
  → 进入 Step 2: Scenes
    → Prompt2 生成 scenes → scenes 逐个出现在面板
    → 图片开始生成 → 图片逐张加载到预览区（渐进式反馈！）
    → 用户可以在等待期间逐个审核已完成的 scene prompt
  → 全部完成 → 自动切换到预览模式 → "Export" 按钮高亮脉冲
  → 导出 → 进度条 → 完成 → 下载/在线播放
```

---

## 三、等待体验优化方案

### 3.1 等待阶段一：ASR + Prompt1（60-90s）

**现状**：一个 spinner + 一行文字，用户完全被动。

**方案：分阶段进度 + 歌词先行交互**

```
┌─────────────────────────────────────────────┐
│  Step 1 of 3: Analyzing your song           │
│                                             │
│  ✅ Audio uploaded                          │
│  ✅ Lyrics transcribed (38 lines)     [12s] │
│  🔄 Analyzing song emotion & energy...      │
│  ○  Generating story direction...           │
│                                             │
│  ┌─ Lyrics Preview ──────────────────────┐  │
│  │ I kept your blue ticket stub...       │  │
│  │ Now the pages smell like rain...      │  │
│  │ [可编辑、可滚动]                        │  │
│  └───────────────────────────────────────┘  │
│                                             │
│  💡 Review your lyrics while we prepare     │
│     the story direction.                    │
└─────────────────────────────────────────────┘
```

**实现要点**：

- 后端 `executeGenerationRun` 的 `asr_words` 步骤完成后，前端轮询拿到 lines 就立即展示
- 不需要等 `song_analysis` 完成；歌词校对和 Prompt1 可以并行
- generation-runner 已经有 step 级别的状态（queued → running → success），前端直接映射为进度条
- 用户在等待 Prompt1 的 40-60s 内可以校对歌词，**变被动等待为主动参与**

**前端改动**：

- `editor-provider.tsx`：在 ASR 完成后立即 setLines，不等整个 generate 返回
- 新增一个 `DirectionWizard` 组件替代当前的 loading spinner
- 轮询间隔：2s（当前 generation 运行时）

### 3.2 等待阶段二：Prompt2 + 图片生成（120-300s）

**现状**：Scenes 面板显示进度文字，但预览区空白。

**方案：瀑布式渐进加载**

- Prompt2 完成后，scenes 逐个出现在面板（已有）
- 图片生成是分批的（`queueSceneImagesGrid`），每完成一批就刷新对应 scene 的缩略图
- 预览区：当前 scene 图片生成中时显示 prompt 文字 + 模糊占位图（用上一个已完成 scene 的图片做高斯模糊）
- 用户可以在等待时：编辑还没生成图片的 scene prompt、调整 scene 时间范围

**前端改动**：

- `video-preview.tsx`：当 `currentScene.imageUrl` 为空但 `prompt` 存在时，显示 prompt 文字 + 占位背景
- `scenes-panel.tsx`：已完成图片的 scene 显示绿色勾，生成中的显示 spinner，排队的显示序号
- 图片轮询已有（`imageSyncInFlightRef`），无需改后端

### 3.3 等待阶段三：Export 渲染（30-60s）

**现状**：Export 按钮变为 loading 状态，用户不知道进度。

**方案**：

- 显示渲染进度条（后端 FFmpeg 可以输出 frame 进度）
- 预估剩余时间（基于歌曲时长和 scene 数量）
- 渲染完成后自动播放预览 + 下载按钮高亮

---

## 四、工作台交互重设计

### 4.1 取消 Tab 平铺，改为引导式步骤

**现状**：5 个 tab（Customize / Lyrics / Cast / Scenes / Diagnostics）平铺，用户自由切换。

**问题**：用户不知道正确顺序，经常在 Scenes 还没生成时就去看 Scenes 面板，或者忘了审核 Story 就直接生成。

**方案：三阶段引导模式**

```
┌──────────────────────────────────────────────┐
│ Step 1: Direction    Step 2: Scenes    Step 3: Export │
│ ●━━━━━━━━━━━━━━━━━━━○━━━━━━━━━━━━━━━━━━○      │
└──────────────────────────────────────────────┘
```

**Step 1: Direction**（对应当前 Customize + Lyrics + Cast）

显示内容：
- Story（可编辑 textarea + "Create new story" 按钮）
- Style / Palette / Format 选择
- Lyrics 校对区
- Cast 角色管理
- **底部大按钮："Generate Scenes →"**（附警告文案："Direction will be locked after this step"）

**Step 2: Scenes**（对应当前 Scenes tab）

显示内容：
- 生成进度总览
- Scene 列表（带图片/prompt/时间）
- Batch Generation 控制
- 单个 scene 的 prompt 编辑和重新生成
- **底部大按钮："Preview & Export →"**

**Step 3: Export**

显示内容：
- 完整预览播放器（全宽）
- 字幕样式微调（字号、开关）
- Export 按钮 + 格式选择
- 导出历史

**关键交互**：
- 步骤之间可以回退（Step 2 → Step 1），但回退到 Step 1 时 Direction 字段仍然锁定（已生成 scenes）
- 每个步骤底部的"下一步"按钮是唯一的前进路径，避免用户迷路
- 顶部步骤条显示当前位置 + 完成状态

### 4.2 Side Panel 改造

当前 side panel 在右侧占固定宽度。在新设计中：

- **Step 1**：side panel 显示 Direction 所有配置项（Story + Style + Palette + Format + Lyrics + Cast 折叠式展开）
- **Step 2**：side panel 显示 Scenes 列表 + 单个 scene 详情编辑
- **Step 3**：side panel 显示 Export 配置 + 字幕样式

每个步骤只显示相关的配置，不显示无关内容。

### 4.3 "下一步"提示系统

在以下关键时刻，使用 toast + 面板内高亮引导用户：

| 时刻 | 提示 |
|------|------|
| Prompt1 完成，Story 就绪 | toast: "Story direction ready! Review and edit before generating scenes." + Story 区域脉冲高亮 |
| 用户首次打开 workbench | 顶部 banner: "Step 1: Review your lyrics and story direction, then generate scenes." |
| 所有 scene 图片生成完成 | toast: "All scenes ready! Preview your video and export." + Export 按钮脉冲 |
| Export 完成 | toast: "Video exported! Download or play online." + 弹出播放器 |

### 4.4 Diagnostics tab 处理

- 从主 tab 列表移除（普通用户不需要）
- 放到 Settings 图标（右上角齿轮）下的下拉菜单中
- 或者只在 `NODE_ENV !== 'production'` 时显示

---

## 五、具体 UI 改动清单

### 优先级 P0（必做，影响核心转化）

1. **分阶段等待 UI**：替换 `editor-workspace.tsx` 中的 loading spinner 为 `DirectionWizard` 组件
   - 文件：新建 `src/components/lyric-videos/preview-workbench/direction-wizard.tsx`
   - 依赖：前端需要在 ASR 完成后就拿到 lines，不等 song_analysis

2. **"Generate Scenes" 确认门**：在 Customize 面板底部添加明确的"生成 scenes"按钮 + 锁定警告
   - 文件：修改 `customize-panel.tsx`
   - 当前状态：用户需要自己切到 Scenes tab 再点 Batch Generation，路径不清晰

3. **步骤进度条**：顶部导航栏下方添加三步进度条
   - 文件：修改 `top-nav-bar.tsx` 或新建 `step-progress.tsx`

### 优先级 P1（应做，显著提升体验）

4. **Scene 图片渐进加载**：每批图片完成后立即更新预览区，不等全部完成
   - 文件：修改 `video-preview.tsx`，当无图片时显示 prompt 文字 + 渐变占位

5. **Toast 引导系统**：在关键节点触发 toast 提示
   - 文件：修改 `editor-provider.tsx`，在状态变化时调用 `toast()`

6. **Side Panel 按步骤折叠**：将 5 个 tab 合并为按步骤组织的折叠面板
   - 文件：重构 `side-panel.tsx`

### 优先级 P2（可选，锦上添花）

7. **Export 进度条**：显示 FFmpeg 渲染进度
8. **歌词校对内联到等待页**：ASR 完成后在等待页直接展示可编辑歌词
9. **Diagnostics 移入设置菜单**
10. **快捷键**：空格播放/暂停、方向键切 scene、Cmd+E 导出

---

## 六、竞品参考

研究这些产品的等待体验和引导流：

- **Canva**：模板选择 → 编辑 → 导出，每步有明确的 CTA，等待时显示动画 + 进度
- **Runway ML**：生成视频时有分阶段进度（Preparing → Generating → Enhancing），每阶段有不同的占位动画
- **Suno AI**：音乐生成等待时显示波形动画 + 预估时间
- **LyricEdits**（你的竞品）：直接参考他们的步骤编排和等待体验

---

## 七、实施路线图

```
Week 1: P0-1 分阶段等待 UI + P0-2 "Generate Scenes" 确认门
Week 2: P0-3 步骤进度条 + P1-5 Toast 引导
Week 3: P1-4 图片渐进加载 + P1-6 Side Panel 重构
Week 4: P2 项 + 整体测试打磨
```

每周末做一次完整流程走查（从上传到导出），录屏记录体验问题。
