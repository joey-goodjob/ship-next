export function debugPreviewWorkbench(scope: string, event: string, data: Record<string, unknown> = {}) {
  if (process.env.NODE_ENV === "production") return;
  console.info(`[lyric-video][${scope}] ${event}`, data);
}
