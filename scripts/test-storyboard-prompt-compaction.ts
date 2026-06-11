import assert from 'node:assert/strict';
import {
  buildDebugStoryboardScenesPrompt,
  buildStoryboardScenesPrompt,
} from '@/modules/lyric-videos/lyric/llm';
import type { FixedStoryboardSceneDraft, LyricVideoSongAnalysisResult } from '@/modules/lyric-videos/lyric/types';

const songAnalysis: LyricVideoSongAnalysisResult = {
  theme: 'leaving home to find closure',
  characters: [],
  key_props: [],
  narrative_arc: [
    {
      time_range: '0s-30s',
      section_label: 'verse',
      plot_beat: 'The main character walks away from a locked apartment.',
      visual_anchor: 'A key drops into a storm drain.',
    },
  ],
  story_acts: [
    {
      title: 'Act 1',
      description: 'A lonely departure through wet city streets, anchored by a lost key and cold dawn light.',
    },
  ],
  location_plan: [],
  emotion_arc: [],
  visual_style: 'cinematic realistic live-action still',
  color_palette: ['#172033', '#f2b56b'],
  notes: '',
};

const fixedScenes: FixedStoryboardSceneDraft[] = [
  {
    sceneId: 'scene_1',
    kind: 'lyric',
    shotType: 'character_shot',
    startMs: 0,
    endMs: 4200,
    text: 'I left the key behind',
    linkedLineIds: ['line_1'],
    energyLevel: 'medium',
    avgEnergy: 0.47,
    beatCount: 8,
    bpm: 96,
    prevLyric: '',
    nextLyric: 'The morning found me gone',
    planning: {
      durationClass: 'normal',
      needsMotion: true,
      isVocalMontage: true,
      energy: 0.47,
      sourceLineId: 'line_1',
      splitIndex: 1,
      splitCount: 2,
      repeatGroupId: 'repeat_abc',
      repeatIndex: 1,
      repeatTotal: 2,
      focusText: 'I left the key behind',
    },
  },
];

function assertCompactedPrompt(prompt: string) {
  assert.equal(prompt.includes('"characters":[]'), false, 'empty characters should not be sent to Prompt2');
  assert.equal(prompt.includes('"key_props":[]'), false, 'empty key_props should not be sent to Prompt2');
  assert.equal(prompt.includes('"location_plan":[]'), false, 'empty location_plan should not be sent to Prompt2');
  assert.equal(prompt.includes('"emotion_arc":[]'), false, 'empty emotion_arc should not be sent to Prompt2');
  assert.equal(prompt.includes('"notes":""'), false, 'empty notes should not be sent to Prompt2');
  assert.equal(prompt.includes('"prevLyric":""'), false, 'empty scene fields should not be sent to Prompt2');
  assert.equal(prompt.includes('"energy":'), false, 'planning.energy duplicates energyLevel and should not be sent');
  assert.equal(prompt.includes('"sourceLineId"'), false, 'internal sourceLineId should not be sent to Prompt2');

  assert.equal(prompt.includes('"repeatGroupId":"repeat_abc"'), true, 'repeat grouping must stay available');
  assert.equal(prompt.includes('"isVocalMontage":true'), true, 'vocal montage planning must stay available');
  assert.equal(prompt.includes('"splitIndex":1'), true, 'split planning must stay available');
  assert.equal(prompt.includes('"focusText":"I left the key behind"'), true, 'focus text must stay available');
}

assertCompactedPrompt(buildDebugStoryboardScenesPrompt({ songAnalysis, scenes: fixedScenes }));
assertCompactedPrompt(buildStoryboardScenesPrompt({ songAnalysis, scenes: fixedScenes }));

console.log('storyboard prompt compaction assertions passed');
