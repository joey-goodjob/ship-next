import { pickLyricVideoCreateProjectInput } from '../src/app/api/lyric-videos/create-project-input';

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

const input = {
  userId: 'attacker-user-id',
  generationStatus: 'success',
  pipelineStage: 'complete',
  activeRunId: null,
  title: 'ok',
  audioUrl: 'https://example.com/song.mp3',
  trimStartMs: 1000,
  trimEndMs: 30000,
};

const result = pickLyricVideoCreateProjectInput(input);
const keys = Object.keys(result).sort();

assert(result.title === 'ok', 'title should be preserved');
assert(result.audioUrl === 'https://example.com/song.mp3', 'audioUrl should be preserved');
assert(result.trimStartMs === 1000, 'trimStartMs should be preserved');
assert(result.trimEndMs === 30000, 'trimEndMs should be preserved');
assert(!('userId' in result), 'request body userId must not be accepted');
assert(!('generationStatus' in result), 'generationStatus must not be accepted');
assert(!('pipelineStage' in result), 'pipelineStage must not be accepted');
assert(!('activeRunId' in result), 'activeRunId must not be accepted');
assert(
  keys.join(',') === 'audioUrl,title,trimEndMs,trimStartMs',
  `unexpected create input keys: ${keys.join(',')}`,
);

console.log('lyric video create project input guard ok');
