export const STYLE_OPTIONS = [
  { value: "cinematic illustration", label: "Cinematic illustration", icon: "film" },
  { value: "realistic 3D render", label: "Realistic 3D render", icon: "box" },
  { value: "anime", label: "Anime", icon: "smile" },
  { value: "cartoon", label: "Cartoon", icon: "clapperboard" },
  { value: "digital oil painting", label: "Digital oil painting", icon: "brush" },
  { value: "pencil sketch", label: "Pencil sketch", icon: "pencil" },
  { value: "pixel art", label: "Pixel art", icon: "grid" },
] as const;

export const FORMAT_OPTIONS = [
  { value: "16:9", label: "16:9", description: "Widescreen", icon: "monitor" },
  { value: "9:16", label: "9:16", description: "Vertical", icon: "smartphone" },
] as const;
export const SIDE_PANEL_WIDTH_KEY = "lyric-video-workbench-side-panel-width";
export const TIMELINE_HEIGHT_KEY = "lyric-video-workbench-timeline-height";
export const DEFAULT_TIMELINE_HEIGHT = 104;
export const LYRIC_FRAME_RATE = 30;
export const DEFAULT_CAPTION_FONT_SIZE = 42;
export const MIN_CAPTION_FONT_SIZE = 28;
export const MAX_CAPTION_FONT_SIZE = 72;
