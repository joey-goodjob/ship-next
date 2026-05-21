# Lyric Video Studio 功能实施 Checklist

用法：每完成一个功能，把 `- [ ]` 改成 `- [x]`。不要提前打勾；打勾必须代表代码、体验和基础验证都完成。

## 1. 文档基线

- [x] 创建 PRD 文档：`docs/product/lyric-video-studio-prd.md`
- [x] 创建实施计划文档：`docs/product/lyric-video-studio-implementation.md`
- [x] 创建功能 checklist：`docs/product/lyric-video-studio-checklist.md`
- [x] 标记当前已有能力与主要缺口

## 2. 项目与音频上传

- [x] 支持上传 MP3、WAV、M4A、AAC、OGG、FLAC
- [x] 限制音频大小并展示清晰错误
- [x] 创建 lyric video project
- [x] 展示项目列表
- [x] 展示项目详情和 pipeline 状态
- [x] 支持音频在线播放预览
- [x] 上传失败时展示错误提示
- [x] 完成后运行 `pnpm build`

## 3. 歌词识别与编辑

- [ ] 支持手动粘贴歌词创建歌词草稿
- [ ] 支持 AI 音频转写歌词
- [ ] 展示歌词时间轴列表
- [ ] 支持编辑单行歌词文本
- [ ] 支持编辑 `startMs` 和 `endMs`
- [ ] 保存歌词后刷新页面不丢失
- [ ] 转写失败时展示 `pipelineError`
- [ ] 完成后运行 `pnpm build`

## 4. 全局风格配置

- [ ] 支持编辑 `Story Prompt`
- [ ] 支持选择 `Palette`
- [ ] 支持选择 `Aspect Ratio`
- [ ] 支持编辑或选择 `Art Style`
- [ ] 支持选择 `Resolution`
- [ ] 保存全局风格到项目
- [ ] storyboard 生成读取最新全局风格
- [ ] 图片生成读取最新画面比例和分辨率
- [ ] 完成后运行 `pnpm build`

## 5. 分镜生成与时间轴

- [ ] 根据歌词生成 scenes
- [ ] 展示 scene 时间轴列表
- [ ] 展示 scene 关联歌词
- [ ] 支持编辑 scene prompt
- [ ] 支持编辑 motion prompt
- [ ] 支持保存 scene 修改
- [ ] scene 按时间排序展示
- [ ] 完成后运行 `pnpm build`

## 6. 场景拆分与歌词纠错

- [ ] 支持 Split Scene API
- [ ] 支持在前端选择拆分时间点
- [ ] split 后生成两个连续 scenes
- [ ] split 后不产生时间重叠
- [ ] split 后保留或重新分配关联歌词
- [ ] 支持在 timeline 中修正歌词错别字
- [ ] 支持调整 scene 起止时间
- [ ] 完成后运行 `pnpm build`

## 7. 静态图片生成

- [ ] 支持生成单个 scene 图片
- [ ] 支持批量生成全部 scene 图片
- [ ] 展示 `draft`、`processing`、`success`、`failed` 状态
- [ ] 自动轮询 processing 图片任务
- [ ] 支持手动刷新图片任务状态
- [ ] failed scene 支持单独重试
- [ ] 图片成功后更新 preview
- [ ] 完成后运行 `pnpm build`

## 8. 角色一致性 v1

- [ ] 增加角色描述输入区域
- [ ] 支持保存角色描述
- [ ] storyboard prompt 注入角色描述
- [ ] 图片生成 prompt 注入角色描述
- [ ] 提供“锁定角色”文案和状态反馈
- [ ] 不引入复杂模型训练或参考图工作流
- [ ] 完成后运行 `pnpm build`

## 9. 字幕样式包装

- [ ] 支持选择字体
- [ ] 支持调整字号
- [ ] 支持选择字幕位置
- [ ] 支持设置文字颜色
- [ ] 支持设置阴影颜色
- [ ] 支持选择基础字幕动效
- [ ] 支持 Apply to all scenes
- [ ] 保存字幕配置到 `previewConfig` 或导出 settings
- [ ] 导出时使用字幕配置生成 ASS
- [ ] 完成后运行 `pnpm build`

## 10. 静态 MP4 导出

- [ ] 导出前校验音频存在
- [ ] 导出前校验歌词存在
- [ ] 导出前校验 scenes 存在
- [ ] 导出前校验至少一张 scene 图片存在
- [ ] 使用 FFmpeg 合成静态图片、音频和字幕
- [ ] 创建 export job 记录
- [ ] 导出成功后保存 `videoUrl`
- [ ] 导出失败后保存错误信息
- [ ] 支持在线播放导出视频
- [ ] 支持打开或下载 MP4
- [ ] 完成后运行 `pnpm build`

## 11. 前端编辑器体验升级

- [ ] 设计三栏工作台布局
- [ ] 左侧放项目、全局风格、字幕样式
- [ ] 中间放视频预览和音频播放器
- [ ] 右侧放 timeline、scene 和歌词编辑
- [ ] 顶部展示生成、保存、导出入口
- [ ] 移动端退化为可用 tabs
- [ ] 桌面和平板不出现内容重叠
- [ ] 完成后运行 `pnpm build`

## 12. 高级功能延期

- [ ] 图生视频进入 v2 规划，不进入当前 MVP
- [ ] AI Inpainting 进入 v2/v3 规划，不进入当前 MVP
- [ ] 多角色高级一致性进入 v2/v3 规划
- [ ] NLE 工程文件导出进入 v2/v3 规划
- [ ] 高级逐词 karaoke 和节拍分析进入 v2/v3 规划
