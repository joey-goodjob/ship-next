type LyricVideoStyleProject = {
  artStyle?: string | null;
  customStyle?: string | null;
};

type StylePreset = {
  label: string;
  prompt: string;
  boundary: string;
};

const DEFAULT_ART_STYLE = 'realistic';
const LEGACY_CINEMATIC_ILLUSTRATION = 'cinematic illustration';

const STYLE_PRESETS: Record<string, StylePreset> = {
  realistic: {
    label: 'realistic',
    prompt: 'photorealistic live-action music-video stills, natural human proportions, real camera language, cinematic lighting, consistent color grading',
    boundary: 'Do not switch into anime, cartoon, 3D render, digital illustration, pencil sketch, pixel art, or painterly illustration unless the custom style explicitly asks for that texture.',
  },
  'realistic 3d render': {
    label: 'realistic 3D render',
    prompt: 'realistic 3D rendered music-video stills, detailed materials, cinematic lighting, consistent 3D character design, natural proportions',
    boundary: 'Do not switch into live-action photography, anime, cartoon, digital illustration, pencil sketch, pixel art, or oil painting.',
  },
  anime: {
    label: 'anime',
    prompt: 'anime music-video stills, expressive anime character design, clean linework, cinematic anime lighting, coherent illustrated backgrounds',
    boundary: 'Do not switch into photorealistic live-action, 3D render, western cartoon, digital illustration, oil painting, pencil sketch, or pixel art.',
  },
  cartoon: {
    label: 'cartoon',
    prompt: 'cartoon music-video stills, stylized character shapes, clean graphic silhouettes, expressive poses, cohesive animated-world backgrounds',
    boundary: 'Do not switch into photorealistic live-action, anime, 3D render, digital illustration, oil painting, pencil sketch, or pixel art.',
  },
  digital: {
    label: 'digital',
    prompt: 'digital illustration music-video stills, polished painted-digital surfaces, crisp character rendering, cinematic lighting, cohesive stylized environments',
    boundary: 'Do not switch into photorealistic live-action, anime, cartoon, 3D render, oil painting, pencil sketch, or pixel art.',
  },
  'digital oil painting': {
    label: 'digital oil painting',
    prompt: 'digital oil painting music-video stills, visible painterly brushwork, rich color layering, cinematic composition, cohesive painted environments',
    boundary: 'Do not switch into photorealistic live-action, anime, cartoon, 3D render, digital illustration, pencil sketch, or pixel art.',
  },
  'pencil sketch': {
    label: 'pencil sketch',
    prompt: 'pencil sketch music-video stills, graphite linework, hand-drawn shading, paper texture, cinematic composition in monochrome or restrained color',
    boundary: 'Do not switch into photorealistic live-action, anime, cartoon, 3D render, digital illustration, oil painting, or pixel art.',
  },
  'pixel art': {
    label: 'pixel art',
    prompt: 'pixel art music-video stills, deliberate low-resolution pixel shapes, limited palette, crisp sprite-like silhouettes, cohesive pixel-art environments',
    boundary: 'Do not switch into photorealistic live-action, anime, cartoon, 3D render, digital illustration, oil painting, or pencil sketch.',
  },
};

function cleanStyleValue(value?: string | null) {
  return String(value || '').trim();
}

function selectedArtStyle(value?: string | null) {
  const raw = cleanStyleValue(value);
  if (!raw) return DEFAULT_ART_STYLE;
  if (raw.toLowerCase() === LEGACY_CINEMATIC_ILLUSTRATION) return DEFAULT_ART_STYLE;
  return raw;
}

function stylePresetFor(value?: string | null): StylePreset {
  const raw = selectedArtStyle(value);
  const key = raw.toLowerCase();
  return STYLE_PRESETS[key] || {
    label: raw,
    prompt: `${raw} music-video stills, cohesive art direction, consistent characters, consistent lighting and color language`,
    boundary: 'Do not switch into a different visual style from the user-selected style.',
  };
}

export function buildUserStyleDirective(project?: LyricVideoStyleProject | null): string {
  if (!project) return '';
  const base = selectedArtStyle(project.artStyle);
  const custom = cleanStyleValue(project.customStyle);
  return [base, custom].filter(Boolean).join(', ');
}

export function buildStoryboardStyleBlock(project?: LyricVideoStyleProject | null): string {
  const preset = stylePresetFor(project?.artStyle);
  const custom = cleanStyleValue(project?.customStyle);
  return [
    `Art style: ${preset.label}`,
    custom ? `Custom style notes: ${custom}` : '',
    `Style instruction: Use ${preset.prompt}.`,
    custom ? 'Custom style notes refine the selected art style; keep them visible while preserving the base style.' : '',
    `Style boundary: ${preset.boundary}`,
    'Every scene image_prompt must stay in this selected visual style.',
  ].filter(Boolean).join('\n');
}

export function buildGridImageStylePrompt(project?: LyricVideoStyleProject | null): string {
  const preset = stylePresetFor(project?.artStyle);
  const custom = cleanStyleValue(project?.customStyle);
  return [
    `Global visual style for all panels: Art style: ${preset.label}; ${preset.prompt}.`,
    custom ? `Custom style notes: ${custom}.` : '',
    `Style boundary: ${preset.boundary}`,
    'Keep consistent art direction, character proportions, color grading, and lighting language across every panel.',
    'No text, subtitles, lyrics, logos, watermarks, or readable typography.',
  ].filter(Boolean).join(' ');
}
