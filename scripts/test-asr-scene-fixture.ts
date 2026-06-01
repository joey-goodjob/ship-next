import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { asrTimingDebugSummary, cleanAsrWordsForLyrics, refineAsrSegmentsWithWords } from '../src/modules/lyric-videos/lyric/asr';
import { buildFixedStoryboardSceneDrafts } from '../src/modules/lyric-videos/lyric/storyboard';
import { parseElevenLabsTranscriptionResponse } from '../src/core/ai/elevenlabs';

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
    words: cleanedWords,
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

async function readJsonIfExists(filePath: string) {
  try {
    return JSON.parse(await readFile(filePath, 'utf-8'));
  } catch (error: any) {
    if (error?.code !== 'ENOENT') throw error;
    return null;
  }
}

function syntheticElevenLabsExport() {
  return {
    language_code: 'en',
    segments: [
      {
        text: 'Morning on my face, dust on my shoes. I left the old road ',
        start_time: 9.38,
        end_time: 16.16,
        words: [
          { text: 'Morning', start_time: 9.38, end_time: 10 },
          { text: ' ', start_time: 10, end_time: 10.08 },
          { text: 'on', start_time: 10.08, end_time: 10.26 },
          { text: 'my', start_time: 10.32, end_time: 10.46 },
          { text: 'face,', start_time: 10.46, end_time: 11.2 },
          { text: 'dust', start_time: 11.2, end_time: 11.6 },
          { text: 'on', start_time: 11.6, end_time: 11.8 },
          { text: 'my', start_time: 11.8, end_time: 12 },
          { text: 'shoes.', start_time: 12, end_time: 12.4 },
          { text: 'I', start_time: 13, end_time: 13.2 },
          { text: 'left', start_time: 13.2, end_time: 13.6 },
          { text: 'the', start_time: 13.6, end_time: 13.8 },
          { text: 'old', start_time: 13.8, end_time: 14.1 },
          { text: 'road', start_time: 14.1, end_time: 14.6 },
        ],
      },
      {
        text: 'for something new. ',
        start_time: 17.22,
        end_time: 18.46,
        words: [
          { text: 'for', start_time: 17.22, end_time: 17.38 },
          { text: 'something', start_time: 17.44, end_time: 18 },
          { text: 'new.', start_time: 18.1, end_time: 18.46 },
        ],
      },
      {
        text: "nothing's as it seems. I'm free, I'm free. Watch me rise again. Open sky tonight.",
        start_time: 50,
        end_time: 64,
        words: [
          { text: "nothing's", start_time: 50, end_time: 51 },
          { text: 'as', start_time: 51, end_time: 51.3 },
          { text: 'it', start_time: 51.3, end_time: 51.5 },
          { text: 'seems.', start_time: 51.5, end_time: 52 },
          { text: "I'm", start_time: 52.1, end_time: 52.3 },
          { text: 'free,', start_time: 52.3, end_time: 52.7 },
          { text: "I'm", start_time: 52.8, end_time: 53 },
          { text: 'free.', start_time: 53, end_time: 53.32 },
          { text: 'Watch', start_time: 54, end_time: 54.5 },
          { text: 'me', start_time: 54.5, end_time: 54.7 },
          { text: 'rise', start_time: 54.7, end_time: 55.2 },
          { text: 'again.', start_time: 55.2, end_time: 56 },
          { text: 'Open', start_time: 58, end_time: 58.5 },
          { text: 'sky', start_time: 58.5, end_time: 59.1 },
          { text: 'tonight.', start_time: 59.1, end_time: 60 },
        ],
      },
      {
        text: 'Oh, oh, oh. Oh, oh, oh. Open sky tonight.',
        start_time: 152,
        end_time: 158,
        words: [
          { text: 'Oh,', start_time: 152, end_time: 153 },
          { text: 'oh,', start_time: 153, end_time: 154 },
          { text: 'oh.', start_time: 154, end_time: 155 },
          { text: 'Oh,', start_time: 155, end_time: 155.1 },
          { text: 'oh,', start_time: 155.1, end_time: 155.2 },
          { text: 'oh.', start_time: 155.2, end_time: 155.3 },
          { text: 'Open', start_time: 156, end_time: 156.4 },
          { text: 'sky', start_time: 156.4, end_time: 157 },
          { text: 'tonight.', start_time: 157, end_time: 158 },
        ],
      },
    ],
  };
}

function syntheticAudioAnalysis(durationSec = 165.96) {
  const beatTimesMs = Array.from({ length: Math.floor((durationSec * 1000) / 620) }, (_, index) => 560 + index * 620);
  return {
    durationSec,
    sampleRate: 48000,
    bpm: 96,
    key: 'F',
    beatTimesMs,
    segmentBoundariesMs: [],
    rmsBySecond: Array.from({ length: Math.ceil(durationSec) }, (_, index) => ({
      startMs: index * 1000,
      endMs: (index + 1) * 1000,
      rms: 0.05 + (index % 8) * 0.01,
    })),
    segments: Array.from({ length: Math.ceil(durationSec) }, (_, index) => ({
      startMs: index * 1000,
      endMs: (index + 1) * 1000,
      durationMs: 1000,
      avgEnergy: 0.05 + (index % 8) * 0.01,
    })),
  };
}

async function assertElevenLabsWordSentenceSplitting() {
  const localPath = '/Users/joey/Downloads/Open Sky Tonight （素材）.mp3.json';
  const raw = (await readJsonIfExists(localPath)) || syntheticElevenLabsExport();
  const audioAnalysis = (await readJsonIfExists(path.join(process.cwd(), 'debug', 'open-sky-tonight-librosa-analysis.json'))) || syntheticAudioAnalysis();
  const parsed = parseElevenLabsTranscriptionResponse(raw);
  assert(parsed.words.length > 0, 'ElevenLabs export should parse nested segment words');

  const finalLines = refineAsrSegmentsWithWords({ segments: raw.segments || [], words: parsed.words });
  const morningLine = finalLines.find((line) => /morning on my face/i.test(line.text));
  const oldRoadLine = finalLines.find((line) => /i left the old road for something new/i.test(line.text));
  assert(morningLine, 'ElevenLabs sentence split should keep "Morning on my face..." as a line');
  assert(oldRoadLine, 'ElevenLabs sentence split should stitch "I left the old road for something new." across provider segment boundaries');
  assert(
    !finalLines.some((line) => /morning on my face/i.test(line.text) && /i left the old road/i.test(line.text)),
    'ElevenLabs sentence split should not keep one provider segment as a sentence-and-a-half line'
  );

  const longProviderSegmentLines = finalLines.filter((line) => (line.startMs || 0) >= 46000 && (line.endMs || 0) <= 65000);
  assert(longProviderSegmentLines.length >= 3, 'Long ElevenLabs provider segment should split into multiple sentence lines');
  const ohLines = finalLines.filter((line) => /^oh\b/i.test(line.text));
  assert(ohLines.length <= 1, 'Consecutive oh/ah/la vocalization sentences should merge into one line');
  assert(
    finalLines.every((line) => Math.max(0, Number(line.endMs || 0) - Number(line.startMs || 0)) >= 500),
    'ElevenLabs sentence split should not create zero-duration lines'
  );

  const fixedScenes = buildFixedStoryboardSceneDrafts({
    lines: finalLines,
    audioAnalysis,
    words: parsed.words,
  });
  assert(fixedScenes.length > finalLines.length, 'MV fixed scenes should be richer than the lyric sentence timeline');

  const introScenes = fixedScenes.filter((scene) => scene.text === '[intro]');
  assert(introScenes.length >= 2, 'Intro silence should become multiple instrumental scenes');

  const vocalMontageScenes = fixedScenes.filter((scene) => scene.planning?.isVocalMontage);
  assert(vocalMontageScenes.length >= 3, 'Long Oh/La vocal section should split into beat-based montage scenes');

  assert(
    !fixedScenes.some((scene) => /i can feel it now/i.test(scene.text) && /pulling in my chest/i.test(scene.text)),
    'Multi-sentence scene should split repeated "I can feel it now" away from "Pulling in my chest"'
  );

  const lateChorusScenes = fixedScenes.filter((scene) => (scene.startMs || 0) >= 129000 && (scene.endMs || 0) <= 137000);
  assert(lateChorusScenes.length >= 2, '6.94s multi-sentence chorus should split into multiple MV scenes');

  const movingForwardRepeatIds = fixedScenes
    .filter((scene) => /open sky tonight, i'm moving forward/i.test(scene.text))
    .map((scene) => scene.planning?.repeatGroupId)
    .filter(Boolean);
  assert(
    movingForwardRepeatIds.length >= 2 && new Set(movingForwardRepeatIds).size === 1,
    'Repeated chorus line should share a repeatGroupId'
  );
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
  await assertElevenLabsWordSentenceSplitting();
  console.info('[test-asr-scene-fixture] passed');
}

main().catch((error) => {
  console.error('[test-asr-scene-fixture] failed:', error);
  process.exitCode = 1;
});
