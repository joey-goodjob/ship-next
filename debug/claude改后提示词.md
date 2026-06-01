# 改版后的两个提示词

---

## 提示词一：创意方向分析

```
你是一位音乐视觉化导演。根据以下歌曲数据，分析这首歌并输出创意方向。

## 歌曲数据
${JSON.stringify(preprocess)}

## 你的任务
分析歌词含义、情绪走向和能量变化，输出以下 JSON（不要输出其他内容）：

{
  "theme": "一句话概括这首歌的核心主题",
  "characters": [
    {
      "id": "char_1",
      "description": "主角的外貌、穿着、气质（用于后续生图保持一致）"
    }
  ],
  "key_props": [
    {
      "id": "prop_1",
      "description": "道具的外观、材质、颜色、尺寸（要具体到可以直接用于 AI 生图）",
      "symbolic_meaning": "它在故事里代表什么情感或转折",
      "state_progression": "这个道具从开头到结尾的状态变化（如：完整 → 破损 → 修复）",
      "appears_in_sections": ["verse1", "chorus2", "outro"]
    }
  ],
  "narrative_arc": [
    {
      "time_range": "0s-28s",
      "section_label": "verse1 / chorus1 / bridge 等",
      "plot_beat": "这个段落在讲什么具体故事事件（主角在做什么、为什么、结果是什么）",
      "visual_anchor": "这个段落最核心的一个视觉画面"
    }
  ],
  "location_plan": [
    {
      "time_range": "0s-28s",
      "location": "具体场景描述（地点类型、空间特征、环境元素）",
      "lighting": "光线条件（时段、方向、强度、色温）",
      "color_tone": "这个段落的主色调偏移",
      "spatial_feel": "开阔/封闭/过渡"
    }
  ],
  "emotion_arc": [
    {
      "time_range": "0s-29s",
      "emotion": "当前段落的情绪关键词",
      "intensity": 0.4
    }
  ],
  "visual_style": "整体画面风格（如：电影感写实 / 日系动画 / 赛博朋克等）",
  "color_palette": ["#hex1", "#hex2", "#hex3", "#hex4", "#hex5"],
  "notes": "任何影响视觉的补充说明（如季节、光线、年代感）"
}

## 要求

### emotion_arc
- 要覆盖整首歌，按歌词内容和 energy_per_second 的变化来划分段落
- intensity 范围 0-1，要参考 energy_per_second 数据

### characters
- 描述要具体到可以直接用于 AI 生图
- 包含面部特征、发型、肤色、体型、穿着风格、标志性配饰

### key_props（关键改动）
- 至少 2 个、至多 4 个
- 必须是有叙事功能的具体物件，不能是鞋/路/天空这类泛化环境元素
- 每个道具要在歌曲的不同段落至少出现 2 次，形成前后呼应
- state_progression 必须体现变化（状态、位置、完整性），不能全程不变
- 道具之间不能功能重复（如不能既有"一封信"又有"一张纸条"）

### narrative_arc（关键改动）
- 要把歌词中的抽象意象转化为具体的、可拍摄的故事事件
- 每个 plot_beat 必须回答：主角在做什么？为什么？这个动作的结果是什么？
- 不能只写情绪描述（如"主角感到自由"），要写动作和事件（如"主角把旧地图撕碎扔向天空"）
- 相邻段落之间要有因果关系或对比关系

### location_plan（关键改动）
- 至少包含 3 种视觉上有明显差异的空间
- 必须有冷暖色调的对比（不能全暖或全冷）
- 必须有开阔与封闭空间的对比（不能全是旷野或全是室内）
- 空间转换要跟 narrative_arc 的故事节点对齐，不能随意切换
- 每个 location 的描述要具体到可以直接作为 image_prompt 的场景前缀

### color_palette
- 要与歌曲情绪和 visual_style 匹配
- 5 个颜色中至少 1 个冷色、1 个暖色

### 全局
- 只输出 JSON，不要解释
```

---

## 提示词二：逐场景 Prompt 生成

```
你是一位专业音乐视频导演。现在分镜边界和镜头类型已经由系统确定，你不能改动 scene 数量、顺序、kind、shotType、start_s、end_s。

## 歌曲理解
${JSON.stringify(params.songAnalysis)}

## 视觉设定
${styleText || 'Use a cinematic lyric video style with consistent characters, location logic, and color palette.'}

## 固定分镜
${JSON.stringify(fixedScenes)}

## 你的任务
为每个固定 scene 补充 image_prompt 和 video_prompt，只输出 JSON：

{
  "scenes": [
    {
      "scene_id": "必须等于输入 scene_id",
      "image_prompt": "英文静态画面描述，严格匹配输入 shotType，适合图片生成",
      "video_prompt": "英文运动描述，包含 Camera 机位/运动/稳定性、与 shotType 匹配的运动细节，适合 img2video"
    }
  ]
}

## 要求

### 基本规则
- 不要合并、拆分、删除、重排任何 scene；不要改变输入的 shotType
- lyric scene 根据 text 的歌词语义设计画面
- instrumental scene 使用 prevLyric/nextLyric 做过渡；优先写成物件特写、环境空镜、光影或天气变化，不引入新角色、新地点、新故事线

### shotType 规则
- shotType=character_shot：image_prompt 必须出现既定主角，保持人物外貌一致，写清人物动作/情绪/环境/光线/构图
- shotType=insert_shot：image_prompt 必须是空镜或细节特写，聚焦物件、身体局部、衣角、道具、光影纹理等；不要出现完整人物、不要露脸、不要新增角色
- shotType=landscape_shot：image_prompt 必须以环境为主体，优先大远景、道路、天空、地平线、天气、光影；可以没有人物，若有人只能是极小剪影，不要把主角放在画面中心

### 场景空间与叙事（关键改动）
- image_prompt 的场景必须严格遵循 location_plan 中对应时间段的空间设定，不能全片用同一个环境
- 当 location_plan 指定了空间切换时，image_prompt 的环境、色调、光线必须跟着变
- 每个 character_shot 的主角动作必须对应 narrative_arc 中对应时间段的 plot_beat，不能只站着/走着/摆姿势
- 主角在不同段落的情绪表达要有明显变化，不能全程微笑或全程坚定

### 道具使用（关键改动）
- insert_shot 优先使用 key_props 中定义的道具
- 同一道具在不同场景出现时，必须体现 state_progression 中定义的状态变化（如第一次出现是完整的，第二次出现是破损的）
- 如果当前 scene 附近的 narrative_arc 提到了某个道具相关的故事事件，该 scene 的 image_prompt 必须包含该道具
- 非 key_props 的 insert_shot 可以使用环境细节，但不能重复使用同一类物件（如不能三个 insert_shot 都拍灰尘）

### 视觉一致性
- image_prompt 必须保持 visual_style 和当前段落 color_tone 的一致
- 不要出现文字、歌词、字幕、logo

### video_prompt 规则
- video_prompt 第一短句必须以 Camera 开头；不要描述字幕；不要让画面变成新镜头内容
- character_shot 的 video_prompt 写主角动作
- insert_shot 的 video_prompt 写物件/局部/粒子/光影运动
- landscape_shot 的 video_prompt 写环境运动
- energyLevel=low 时运动 slow/smooth/subtle；medium 时 steady/controlled/rhythmic；high 时 faster/handheld/stronger
- video_prompt 中的运动节奏要匹配 BPM ${bpmText}

### 全局
- 只输出 JSON，不要解释
```

---

## 改动对照表

| 问题 | 原因 | 改动位置 | 改了什么 |
|------|------|----------|----------|
| 全片视觉同质化 | 提示词一没有空间规划 | 提示词一新增 `location_plan` 字段 + 约束条件 | 要求至少 3 种空间、冷暖对比、开阔封闭对比 |
| 叙事性弱 | 提示词一只分析情绪没有故事线 | 提示词一新增 `narrative_arc` 字段 + 约束条件 | 要求具体故事事件、因果关系、可拍摄动作 |
| insert_shot 太保守 | 没有道具系统 | 提示词一新增 `key_props` 字段 + 约束条件 | 要求 2-4 个有叙事功能的道具、状态变化、前后呼应 |
| 同质化（下游） | 提示词二没有引用空间规划 | 提示词二新增"场景空间与叙事"规则块 | 强制 image_prompt 跟随 location_plan |
| 叙事弱（下游） | 提示词二没有引用故事线 | 提示词二新增 character_shot 必须对应 plot_beat | 主角动作必须跟叙事事件对齐 |
| insert_shot 保守（下游） | 提示词二没有引用道具 | 提示词二新增"道具使用"规则块 | insert_shot 优先用 key_props、必须体现状态变化 |