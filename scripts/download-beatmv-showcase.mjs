import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { basename, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const outputDir = join(process.cwd(), "public", "beatmv-showcase");

const assets = [
  "https://beatmv.ai/videos/showcase/G7V2Biy3omw.mp4",
  "https://beatmv.ai/videos/showcase/XvzlglZbZf0.mp4",
  "https://beatmv.ai/videos/showcase/s7OrG5Iq2Kw.mp4",
  "https://beatmv.ai/videos/showcase/_8QsZGLyZGQ.mp4",
  "https://beatmv.ai/videos/showcase/-Nb-M1GAOX8.mp4",
  "https://beatmv.ai/videos/showcase/edvPrDCWwOk.mp4",
  "https://beatmv.ai/videos/showcase/7NK_JOkuSVY.mp4",
  "https://beatmv.ai/videos/showcase/fpUpVznI4Yc.mp4",
  "https://beatmv.ai/imgs/cases/bgdark.webp",
];

async function download(url) {
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`);
  }

  const filePath = join(outputDir, basename(new URL(url).pathname));
  await pipeline(Readable.fromWeb(response.body), createWriteStream(filePath));
  console.log(`Downloaded ${url} -> ${filePath}`);
}

await mkdir(outputDir, { recursive: true });

for (let index = 0; index < assets.length; index += 4) {
  await Promise.all(assets.slice(index, index + 4).map(download));
}
