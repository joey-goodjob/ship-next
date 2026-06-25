import fs from 'node:fs';
import { selectScenesMissingMotionPrompts } from '../src/modules/lyric-videos/lyric/video-prompts';

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function assertDeepEqual(actual: unknown, expected: unknown, message: string) {
  const left = JSON.stringify(actual);
  const right = JSON.stringify(expected);
  if (left !== right) throw new Error(`${message}: expected ${right}, got ${left}`);
}

const scenes = [
  { id: 'empty-a', sort: 0, motionPrompt: '' },
  { id: 'ready', sort: 1, motionPrompt: 'Camera slowly pushes toward the window.' },
  { id: 'blank', sort: 2, motionPrompt: '   ' },
  { id: 'empty-b', sort: 3, motionPrompt: null },
];

assertDeepEqual(
  selectScenesMissingMotionPrompts(scenes).map((scene) => scene.id),
  ['empty-a', 'blank', 'empty-b'],
  'missing video prompts should include only empty motionPrompt scenes',
);

assertDeepEqual(
  selectScenesMissingMotionPrompts(scenes, ['ready', 'empty-b', 'missing']).map((scene) => scene.id),
  ['empty-b'],
  'requested scene ids should narrow video prompt generation without overwriting existing prompts',
);

const imageRouteSource = fs.readFileSync('src/app/api/lyric-videos/[id]/images/route.ts', 'utf8');
assert(
  imageRouteSource.includes('generateMissingSceneVideoPrompts'),
  'image queue route should trigger missing video prompt generation',
);
assert(
  imageRouteSource.includes('getProjectScenesByIds'),
  'image queue route should return freshly loaded scenes after video prompt persistence',
);
assert(
  imageRouteSource.includes('generateVideoPrompts !== false'),
  'image queue route should generate video prompts by default while allowing explicit opt-out',
);

const visualsServiceSource = fs.readFileSync('src/modules/lyric-videos/lyric/media-generation.ts', 'utf8');
assert(
  visualsServiceSource.includes('generateMissingSceneVideoPrompts'),
  'Continue visuals flow should generate missing video prompts after storyboard prompts are ready',
);
assert(
  visualsServiceSource.includes('videoPromptPersistedSceneCount'),
  'Continue visuals prompt step output should record video prompt persistence status',
);

const videoPromptRoutePath = 'src/app/api/lyric-videos/[id]/video-prompts/route.ts';
assert(fs.existsSync(videoPromptRoutePath), 'a dedicated video prompt route should backfill prompts without image regeneration');
const videoPromptRouteSource = fs.readFileSync(videoPromptRoutePath, 'utf8');
assert(
  videoPromptRouteSource.includes('generateMissingSceneVideoPrompts'),
  'dedicated video prompt route should call missing prompt generation service',
);

const editorProviderSource = fs.readFileSync('src/components/lyric-videos/preview-workbench/editor-provider.tsx', 'utf8');
assert(
  editorProviderSource.includes('generateSceneVideoPrompts'),
  'editor provider should expose a video prompt generation action',
);

const scenesPanelSource = fs.readFileSync('src/components/lyric-videos/preview-workbench/scenes-panel.tsx', 'utf8');
assert(
  scenesPanelSource.includes('Generate Missing Video Prompts'),
  'batch generation dialog should offer a prompt-only backfill action',
);

console.log('video prompt sync rules ok');
