import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { asrTimingDebugSummary, cleanAsrWordsForLyrics, refineAsrSegmentsWithWords } from '../src/modules/lyric-videos/lyric/asr';
import { buildFixedStoryboardSceneDrafts } from '../src/modules/lyric-videos/lyric/storyboard';

type Fixture = {
  transcription: {
    raw: {
      segments?: any[];
      words?: any[];
    };
  };
  audioAnalysis?: any;
};

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function runPipeline(fixture: Fixture, rawWords: any[]) {
  const rawSegments = fixture.transcription.raw.segments || [];
  const cleanedWords = cleanAsrWordsForLyrics(rawWords);
  const finalLines = refineAsrSegmentsWithWords({
    segments: rawSegments,
    words: rawWords,
  });
  const fixedScenes = buildFixedStoryboardSceneDrafts({
    lines: finalLines,
    audioAnalysis: fixture.audioAnalysis,
  });

  return {
    cleanedWords,
    finalLines,
    fixedScenes,
    debugSummary: asrTimingDebugSummary({
      raw: { ...fixture.transcription.raw, words: rawWords },
      cleanedWords,
      finalLines,
      fixedScenes,
    }),
  };
}

function assertNoShortSingleWordMorningScene(label: string, result: ReturnType<typeof runPipeline>) {
  const firstLyricLine = result.finalLines[0];
  const firstLyricScene = result.fixedScenes.find((scene) => scene.kind === 'lyric');
  const badMorningScene = result.fixedScenes.find((scene) => {
    const text = String(scene.text || '').trim();
    const durationMs = Math.max(0, Number(scene.endMs || 0) - Number(scene.startMs || 0));
    return /^mou?rning$/i.test(text) && durationMs <= 1800;
  });

  assert(firstLyricLine, `${label}: expected at least one lyric line`);
  assert(
    /morning on my face/i.test(firstLyricLine.text),
    `${label}: first lyric line should keep the full opening phrase, got "${firstLyricLine.text}"`
  );
  assert(firstLyricScene, `${label}: expected at least one lyric scene`);
  assert(!badMorningScene, `${label}: should not create a 0-1.5s single-word Morning/Mourning scene`);
}

async function main() {
  const fixturePath = path.join(process.cwd(), 'debug', 'fixtures', 'open-sky-official-2', 'analyze.json');
  const fixture = JSON.parse(await readFile(fixturePath, 'utf-8')) as Fixture;
  const rawWords = fixture.transcription.raw.words || [];
  assert(rawWords.length > 1, 'fixture should include raw Whisper words');

  const baseline = runPipeline(fixture, rawWords);
  assertNoShortSingleWordMorningScene('baseline fixture', baseline);

  const syntheticBadWords = rawWords.map((word) => ({ ...word }));
  syntheticBadWords[0] = {
    ...syntheticBadWords[0],
    start: 0,
    end: Number(rawWords[0].start || 9.62),
  };
  const repaired = runPipeline(fixture, syntheticBadWords);
  assertNoShortSingleWordMorningScene('synthetic long-leading-word fixture', repaired);
  assert(
    repaired.debugSummary.timingRepairApplied,
    'synthetic long-leading-word fixture: expected timing repair to be applied'
  );

  console.info('[test-asr-scene-fixture] baseline summary:', baseline.debugSummary);
  console.info('[test-asr-scene-fixture] repaired summary:', repaired.debugSummary);
  console.info('[test-asr-scene-fixture] passed');
}

main().catch((error) => {
  console.error('[test-asr-scene-fixture] failed:', error);
  process.exitCode = 1;
});
