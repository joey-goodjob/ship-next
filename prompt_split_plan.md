# Prompt 拆分方案

## 公共部分（每个请求都带）

所有请求共享同一个 `歌曲数据` 输入（song/duration/bpm/key/lines/energy_per_second）。

但 **energy_per_second 建议预处理**：把 205 个逐秒值压缩为每 5 秒均值（约 41 个值），减少 ~80% 输入 token。

---

## Phase 1：三个请求并行发出

### 请求 A — 叙事骨架（theme + emotion_arc + narrative_arc）

```
你是一位音乐视觉化导演。根据以下歌曲数据，分析歌词含义、情绪走向和能量变化。

## 歌曲数据
{完整歌曲数据}

## 输出要求
只输出以下 JSON，不要输出其他内容：

{
  "theme": "一句话概括核心主题",
  "emotion_arc": [...],
  "narrative_arc": [...]
}

### emotion_arc 要求
- 覆盖整首歌，按歌词内容和 energy_per_second 变化划分段落
- intensity 范围 0-1，参考 energy_per_second 数据

### narrative_arc 要求
- 把歌词中的抽象意象转化为具体的、可拍摄的故事事件
- 每个 plot_beat 必须回答：主角在做什么？为什么？这个动作的结果是什么？
- 不能只写情绪描述（如"主角感到自由"），要写动作和事件
- 相邻段落之间要有因果关系或对比关系
- time_range 和 section_label 要准确对应歌曲结构
```

### 请求 B — 人物与道具（characters + key_props）

```
你是一位音乐视觉化导演。根据以下歌曲数据，设计角色和关键道具。

## 歌曲数据
{完整歌曲数据，energy_per_second 可省略}

## 输出要求
只输出以下 JSON，不要输出其他内容：

{
  "characters": [...],
  "key_props": [...]
}

### characters 要求
- 描述要具体到可以直接用于 AI 生图
- 包含面部特征、发型、肤色、体型、穿着风格、标志性配饰

### key_props 要求
- 至少 2 个、至多 4 个
- 必须是有叙事功能的具体物件，不能是鞋/路/天空这类泛化环境元素
- 每个道具要在歌曲的不同段落至少出现 2 次，形成前后呼应
- state_progression 必须体现变化（状态、位置、完整性），不能全程不变
- 道具之间不能功能重复
- appears_in_sections 用 verse1/chorus1/bridge 等标注
```

### 请求 C — 视觉风格（visual_style + color_palette + notes）

```
你是一位音乐视觉化导演。根据以下歌曲数据，确定整体视觉风格。

## 歌曲数据
{完整歌曲数据，energy_per_second 可省略}

## 输出要求
只输出以下 JSON，不要输出其他内容：

{
  "visual_style": "整体画面风格",
  "color_palette": ["#hex1", "#hex2", "#hex3", "#hex4", "#hex5"],
  "notes": "任何影响视觉的补充说明（季节、光线、年代感）"
}

### 要求
- visual_style 要具体（如"35mm胶片质感的冬日写实"而非泛泛的"电影感"）
- color_palette 5 个颜色中至少 1 个冷色、1 个暖色
- 要与歌曲情绪匹配
```

---

## Phase 2：两个请求并行发出（依赖请求 A 的结果）

### 请求 D — 故事编排（story_acts）

```
你是一位音乐视觉化导演。根据以下歌曲数据和已分析的叙事结构，编排 MV 故事。

## 歌曲数据
{完整歌曲数据，energy_per_second 可省略}

## 已分析的叙事结构
{请求A返回的 narrative_arc}

## 输出要求
只输出以下 JSON，不要输出其他内容：

{
  "story_acts": [...]
}

### story_acts 要求
- 产出 3-5 个 Act
- 每个 Act 覆盖一个较大的叙事段落
- description 必须用英文自然段，80-120 words
- 写清楚人物动作、地点、视觉母题、情绪推进和转场方向
- Acts 之间要形成完整起承转合
- 不要写字幕、歌词文字、屏幕文字或 UI 文案
```

### 请求 E — 场景规划（location_plan）

```
你是一位音乐视觉化导演。根据以下歌曲数据和已分析的叙事/情绪结构，规划场景空间。

## 歌曲数据
{完整歌曲数据，energy_per_second 可省略}

## 已分析的叙事结构
{请求A返回的 narrative_arc}

## 已分析的情绪曲线
{请求A返回的 emotion_arc}

## 输出要求
只输出以下 JSON，不要输出其他内容：

{
  "location_plan": [...]
}

### location_plan 要求
- 至少 3 种视觉上有明显差异的空间
- 必须有冷暖色调的对比
- 必须有开阔与封闭空间的对比
- 空间转换要跟 narrative_arc 的故事节点对齐
- 每个 location 描述要具体到可以直接作为 image_prompt 的场景前缀
```

---

## 最终合并

```javascript
// 伪代码
const [resultA, resultB, resultC] = await Promise.all([requestA(), requestB(), requestC()])

const [resultD, resultE] = await Promise.all([
  requestD(resultA.narrative_arc),
  requestE(resultA.narrative_arc, resultA.emotion_arc)
])

const finalJSON = {
  ...resultA,  // theme, emotion_arc, narrative_arc
  ...resultB,  // characters, key_props
  ...resultC,  // visual_style, color_palette, notes
  ...resultD,  // story_acts
  ...resultE,  // location_plan
}
```

---

## 预期耗时对比

| 方案 | 耗时 |
|------|------|
| 原始单请求 | ~129s |
| Phase 1（最慢的一个） | ~40-50s |
| Phase 2（最慢的一个） | ~20-30s |
| **总计（Phase1 + Phase2）** | **~60-80s** |

如果进一步压缩 energy_per_second 输入 + 降低 reasoning effort，可能压到 **40-60s**。
