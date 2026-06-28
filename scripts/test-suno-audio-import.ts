import assert from 'node:assert/strict';

import {
  extractSunoSongIdFromHtml,
  parseSunoAudioImportUrl,
  resolveSunoAudioSource,
} from '../src/modules/storage/suno-import';

async function testParseSunoUrls() {
  assert.deepEqual(parseSunoAudioImportUrl('https://suno.com/song/8ad31fac-0711-44bf-bff6-2d0e4b424029'), {
    kind: 'song',
    canonicalUrl: 'https://suno.com/song/8ad31fac-0711-44bf-bff6-2d0e4b424029',
    songId: '8ad31fac-0711-44bf-bff6-2d0e4b424029',
  });

  assert.deepEqual(parseSunoAudioImportUrl('https://suno.com/s/fQHyRTUrMjSXmkBJ?utm_source=share'), {
    kind: 'share',
    canonicalUrl: 'https://suno.com/s/fQHyRTUrMjSXmkBJ',
    shareId: 'fQHyRTUrMjSXmkBJ',
  });

  assert.throws(() => parseSunoAudioImportUrl('https://youtube.com/watch?v=abc'), /public Suno song link/);
  assert.throws(() => parseSunoAudioImportUrl('https://suno.com/playlist/abc'), /public Suno song link/);
}

async function testExtractSongIdFromHtml() {
  const html = `
    <meta property="og:url" content="https://suno.com/song/8ad31fac-0711-44bf-bff6-2d0e4b424029">
    <script>self.__next_f.push(["https://cdn1.suno.ai/8ad31fac-0711-44bf-bff6-2d0e4b424029.mp3"])</script>
  `;

  assert.equal(extractSunoSongIdFromHtml(html), '8ad31fac-0711-44bf-bff6-2d0e4b424029');
  assert.equal(extractSunoSongIdFromHtml('<html>No public song here</html>'), null);
}

async function testResolveSunoAudioSource() {
  const requests: Array<{ url: string; method?: string }> = [];
  const fetcher: typeof fetch = async (input, init) => {
    const url = String(input);
    requests.push({ url, method: init?.method });

    if (url === 'https://suno.com/s/fQHyRTUrMjSXmkBJ') {
      return new Response('<a href="https://suno.com/song/8ad31fac-0711-44bf-bff6-2d0e4b424029">song</a>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      });
    }

    if (url === 'https://cdn1.suno.ai/8ad31fac-0711-44bf-bff6-2d0e4b424029.mp3' && init?.method === 'HEAD') {
      return new Response(null, {
        status: 200,
        headers: {
          'content-type': 'audio/mp3',
          'content-length': '4497798',
        },
      });
    }

    throw new Error(`unexpected request: ${init?.method || 'GET'} ${url}`);
  };

  const source = await resolveSunoAudioSource('https://suno.com/s/fQHyRTUrMjSXmkBJ', { fetcher });
  assert.deepEqual(source, {
    songId: '8ad31fac-0711-44bf-bff6-2d0e4b424029',
    audioUrl: 'https://cdn1.suno.ai/8ad31fac-0711-44bf-bff6-2d0e4b424029.mp3',
    filename: 'suno-8ad31fac-0711-44bf-bff6-2d0e4b424029.mp3',
    contentType: 'audio/mp3',
    size: 4497798,
  });
  assert.deepEqual(requests.map((request) => `${request.method || 'GET'} ${request.url}`), [
    'GET https://suno.com/s/fQHyRTUrMjSXmkBJ',
    'HEAD https://cdn1.suno.ai/8ad31fac-0711-44bf-bff6-2d0e4b424029.mp3',
  ]);
}

async function testRejectsNonAudioCdnResponse() {
  const fetcher: typeof fetch = async () =>
    new Response(null, {
      status: 200,
      headers: {
        'content-type': 'text/html',
        'content-length': '128',
      },
    });

  await assert.rejects(
    () => resolveSunoAudioSource('https://suno.com/song/8ad31fac-0711-44bf-bff6-2d0e4b424029', { fetcher }),
    /could not import audio/i,
  );
}

async function main() {
  await testParseSunoUrls();
  await testExtractSongIdFromHtml();
  await testResolveSunoAudioSource();
  await testRejectsNonAudioCdnResponse();
  console.log('suno audio import tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
