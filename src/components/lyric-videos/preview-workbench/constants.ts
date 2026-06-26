const STYLE_PREVIEW_BASE_URL = "https://pub-64bde3d3ea024866bfbb145e4a8ed3bc.r2.dev/style-previews/lyric-video-styles";

export const STYLE_OPTIONS = [
  {
    value: "realistic",
    label: "Realistic",
    previewSrc: `${STYLE_PREVIEW_BASE_URL}/realistic.webp`,
  },
  {
    value: "realistic 3D render",
    label: "3D Render",
    previewSrc: `${STYLE_PREVIEW_BASE_URL}/realistic-3d-render.webp`,
  },
  {
    value: "anime",
    label: "Anime",
    previewSrc: `${STYLE_PREVIEW_BASE_URL}/anime.webp`,
  },
  {
    value: "cartoon",
    label: "Cartoon",
    previewSrc: `${STYLE_PREVIEW_BASE_URL}/cartoon.webp`,
  },
  {
    value: "digital",
    label: "Digital",
    previewSrc: `${STYLE_PREVIEW_BASE_URL}/digital.webp`,
  },
  {
    value: "digital oil painting",
    label: "Oil painting",
    previewSrc: `${STYLE_PREVIEW_BASE_URL}/oil-painting.webp`,
  },
  {
    value: "pencil sketch",
    label: "Pencil",
    previewSrc: `${STYLE_PREVIEW_BASE_URL}/pencil-sketch.webp`,
  },
  {
    value: "pixel art",
    label: "Pixel art",
    previewSrc: `${STYLE_PREVIEW_BASE_URL}/pixel-art.webp`,
  },
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
