/**
 * `lyric` 子目录是歌词视频业务的真实实现层。
 *
 * 上层 API route 只看到 `service.ts` 这个统一入口；这里继续把拆分后的模块
 * 组织成一个公共导出面，方便 route 写成 `service.createProject()`、
 * `service.startGenerationRunQueued()` 这种稳定调用形式。
 */
export * from './types';
export * from './json';
export * from './status';
export * from './project';
export * from './audio';
export * from './asr';
export * from './storyboard';
export * from './llm';
export * from './generation-runner';
export * from './media-generation';
export * from './cast';
export * from './render';
export * from './debug';
