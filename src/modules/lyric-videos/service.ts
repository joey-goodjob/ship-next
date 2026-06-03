/**
 * 歌词视频模块的统一 service 入口。
 *
 * API route 都从 `@/modules/lyric-videos/service` 导入函数，但这个文件本身
 * 不承载业务逻辑，只把 `lyric/*` 下的主链路模块重新导出：
 *
 * - project.ts：创建/更新项目，写 `lyric_video_project`
 * - generation-runner.ts：一键生成总控，串起 ASR、分镜、图片排队
 * - asr.ts：转写、清洗歌词，写 `lyric_video_line` / `lyric_video_word`
 * - storyboard.ts：把歌词行变成分镜 scene，写 `lyric_video_scene`
 * - media-generation.ts：图片生成排队/轮询，回写 scene 图片状态
 */
export * from './lyric';
