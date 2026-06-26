import assert from 'node:assert/strict';

import {
  buildDebugStoryboardScenesPrompt,
  buildStoryboardScenesPrompt,
} from '@/modules/lyric-videos/lyric/llm';
import { buildGridSceneImagePrompt } from '@/modules/lyric-videos/lyric/media-generation';
import type { FixedStoryboardSceneDraft, LyricVideoSongAnalysisResult } from '@/modules/lyric-videos/lyric/types';

const songAnalysis: LyricVideoSongAnalysisResult = {
  theme: 'a performer finds courage in a neon city',
  characters: [],
  key_props: [],
  narrative_arc: [
    {
      time_range: '0s-30s',
      section_label: 'verse',
      plot_beat: 'The performer steps into a glowing street.',
      visual_anchor: 'Neon reflections in rain.',
    },
  ],
  story_acts: [
    {
      title: 'Act 1',
      description: 'A performer moves through a rainy city and gathers courage under bright neon signs.',
    },
  ],
  location_plan: [],
  emotion_arc: [],
  visual_style: 'anime',
  color_palette: ['#1d1b3f', '#ff4fd8'],
  notes: '',
};

const fixedScenes: FixedStoryboardSceneDraft[] = [
  {
    sceneId: 'scene_1',
    kind: 'lyric',
    shotType: 'character_shot',
    startMs: 0,
    endMs: 4000,
    text: 'I see myself in neon light',
    linkedLineIds: ['line_1'],
    energyLevel: 'medium',
    avgEnergy: 0.5,
    beatCount: 8,
    bpm: 100,
    prevLyric: '',
    nextLyric: '',
    planning: {
      durationClass: 'normal',
      needsMotion: true,
      isVocalMontage: false,
      energy: 0.5,
      splitIndex: 1,
      splitCount: 1,
      focusText: 'neon light',
    },
  },
];

const animeProject = {
  artStyle: 'anime',
  customStyle: 'cyberpunk neon, dramatic rim light',
  palette: 'neon magenta, deep blue',
  storyPrompt: 'A cyberpunk stage performance in the rain.',
};

function assertAnimeStyleCanPass(prompt: string) {
  assert.match(prompt, /Art style: anime/i, 'selected art style should be present');
  assert.match(prompt, /Custom style notes: cyberpunk neon/i, 'custom style should be present');
  assert.doesNotMatch(prompt, /no anime/i, 'anime style must not be forbidden when selected');
  assert.doesNotMatch(prompt, /不要使用[^\r\n]*anime/i, 'anime style must not be forbidden in Chinese rules');
  assert.doesNotMatch(prompt, /must use cinematic realistic live-action still/i, 'selected non-realistic styles must not be overwritten by realistic-only rules');
}

assertAnimeStyleCanPass(buildStoryboardScenesPrompt({
  songAnalysis,
  scenes: fixedScenes,
  project: animeProject,
}));

assertAnimeStyleCanPass(buildDebugStoryboardScenesPrompt({
  songAnalysis,
  scenes: fixedScenes,
  project: animeProject,
}));

assertAnimeStyleCanPass(buildGridSceneImagePrompt({
  scenes: [
    {
      id: 'scene_1',
      startMs: 0,
      endMs: 4000,
      prompt: 'Anime character shot of the performer under neon rain.',
    },
  ],
  project: animeProject,
}).compiledPrompt);

const realistic3DPrompt = buildGridSceneImagePrompt({
  scenes: [
    {
      id: 'scene_1',
      startMs: 0,
      endMs: 4000,
      prompt: 'Realistic 3D render of a performer on a cinematic stage.',
    },
  ],
  project: { artStyle: 'realistic 3D render', customStyle: 'glass materials' },
}).compiledPrompt;

assert.match(realistic3DPrompt, /realistic 3D rendered/i, '3D render style should be present');
assert.doesNotMatch(realistic3DPrompt, /no 3D render/i, '3D render must not be forbidden when selected');
assert.doesNotMatch(realistic3DPrompt, /Do not switch[^\r\n.]*3D render/i, '3D render must not be blocked by style boundary');

const digitalPrompt = buildGridSceneImagePrompt({
  scenes: [
    {
      id: 'scene_1',
      startMs: 0,
      endMs: 4000,
      prompt: 'Digital illustration of a performer on a stylized night skyline.',
    },
  ],
  project: { artStyle: 'digital', customStyle: 'teal moonlit city' },
}).compiledPrompt;

assert.match(digitalPrompt, /digital illustration/i, 'digital style should be present');
assert.doesNotMatch(digitalPrompt, /Do not switch[^\r\n.]*digital illustration/i, 'digital style must not be blocked by style boundary');

const legacyPrompt = buildStoryboardScenesPrompt({
  songAnalysis,
  scenes: fixedScenes,
  project: { artStyle: 'cinematic illustration', customStyle: '' },
});
assert.match(legacyPrompt, /Art style: realistic/i, 'legacy cinematic illustration should map to the current realistic default');

console.log('lyric video style prompt assertions passed');
