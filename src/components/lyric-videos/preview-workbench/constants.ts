const STYLE_PREVIEW_BASE_URL = "https://cdn.lyricvideomaker.app/style-previews/lyric-video-styles";

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

export const CAPTION_STYLE_OPTIONS = [
  {
    value: "classic",
    label: "Classic",
    description: "Large centered lyrics with a soft fade.",
    sample: "Carry your world",
    defaults: { fontSize: 52, position: "bottom", transition: "fade", textColor: "#ffffff", shadowColor: "#000000" },
  },
  {
    value: "cinematic",
    label: "Cinematic",
    description: "Title-like lyric text for emotional scenes.",
    sample: "OUR COLORS WILL FADE",
    defaults: { fontSize: 52, position: "bottom", transition: "fade", textColor: "#ffffff", shadowColor: "#000000" },
  },
  {
    value: "pop",
    label: "Pop Beat",
    description: "Bold lyrics that pop on each line change.",
    sample: "I feel it now",
    defaults: { fontSize: 56, position: "center", transition: "pop", textColor: "#ffffff", shadowColor: "#000000" },
  },
  {
    value: "slide",
    label: "Slide Up",
    description: "Short-form friendly lyrics that move upward.",
    sample: "Run into the light",
    defaults: { fontSize: 50, position: "bottom", transition: "slide", textColor: "#ffffff", shadowColor: "#000000" },
  },
  {
    value: "stacked",
    label: "Stacked",
    description: "Previous, current, and next lyric lines together.",
    sample: "Current line stays bright",
    defaults: { fontSize: 44, position: "bottom", transition: "fade", textColor: "#ffffff", shadowColor: "#000000" },
  },
] as const;

export const CAPTION_FONT_OPTIONS = [
  { value: "Inter", label: "Inter", sample: "Clean modern lyric" },
  { value: "Cal Sans", label: "Cal Sans", sample: "Soft bold chorus" },
  { value: "Bebas Neue", label: "Bebas Neue", sample: "LOUD HOOK LINE" },
  { value: "Anton", label: "Anton", sample: "Heavy pop title" },
  { value: "Oswald", label: "Oswald", sample: "Condensed stage type" },
  { value: "Montserrat", label: "Montserrat", sample: "Polished lyric video" },
  { value: "Poppins", label: "Poppins", sample: "Rounded bright words" },
  { value: "Raleway", label: "Raleway", sample: "Elegant synth line" },
  { value: "Playfair Display", label: "Playfair Display", sample: "Cinematic romance" },
  { value: "DM Serif Display", label: "DM Serif Display", sample: "Classic film lyric" },
  { value: "Cinzel", label: "Cinzel", sample: "Epic final chorus" },
  { value: "Lora", label: "Lora", sample: "Warm acoustic verse" },
  { value: "Permanent Marker", label: "Permanent Marker", sample: "Raw handwritten line" },
  { value: "Caveat", label: "Caveat", sample: "Personal note lyric" },
  { value: "Dancing Script", label: "Dancing Script", sample: "Soft romantic hook" },
  { value: "Pacifico", label: "Pacifico", sample: "Retro summer lyric" },
  { value: "Orbitron", label: "Orbitron", sample: "Neon future line" },
  { value: "Rubik Glitch", label: "Rubik Glitch", sample: "Broken signal lyric" },
  { value: "Monoton", label: "Monoton", sample: "Electric night title" },
  { value: "VT323", label: "VT323", sample: "Terminal heartbreak" },
  { value: "Special Elite", label: "Special Elite", sample: "Typed memory line" },
  { value: "Bungee", label: "Bungee", sample: "Street poster hook" },
  { value: "Fredoka", label: "Fredoka", sample: "Playful bright chorus" },
  { value: "Space Grotesk", label: "Space Grotesk", sample: "Modern indie line" },
  { value: "Urbanist", label: "Urbanist", sample: "Creator clean lyric" },
  { value: "Roboto Slab", label: "Roboto Slab", sample: "Grounded story verse" },
  { value: "Satisfy", label: "Satisfy", sample: "Late-night handwritten" },
  { value: "Luckiest Guy", label: "Luckiest Guy", sample: "Big playful hook" },
] as const;

export const CAPTION_EFFECT_OPTIONS = [
  { value: "none", label: "None" },
  { value: "fade", label: "Fade" },
  { value: "slide", label: "Slide" },
  { value: "pop", label: "Pop" },
  { value: "glitch", label: "Glitch" },
  { value: "zoom", label: "Zoom" },
] as const;

export const CAPTION_BLEND_MODE_OPTIONS = [
  { value: "normal", label: "Normal" },
  { value: "multiply", label: "Multiply" },
  { value: "screen", label: "Screen" },
  { value: "overlay", label: "Overlay" },
  { value: "soft-light", label: "Soft Light" },
  { value: "hard-light", label: "Hard Light" },
  { value: "color-dodge", label: "Color Dodge" },
  { value: "color-burn", label: "Color Burn" },
  { value: "difference", label: "Difference" },
  { value: "exclusion", label: "Exclusion" },
  { value: "luminosity", label: "Luminosity" },
] as const;

export const SIDE_PANEL_WIDTH_KEY = "lyric-video-workbench-side-panel-width";
export const TIMELINE_HEIGHT_KEY = "lyric-video-workbench-timeline-height";
export const DEFAULT_TIMELINE_HEIGHT = 104;
export const LYRIC_FRAME_RATE = 30;
export const DEFAULT_CAPTION_FONT_SIZE = 52;
export const MIN_CAPTION_FONT_SIZE = 28;
export const MAX_CAPTION_FONT_SIZE = 72;
