import { readFileSync } from "node:fs";
import { join } from "node:path";

const componentPath = join(process.cwd(), "src/components/lyric-video-material-carousel.tsx");
const source = readFileSync(componentPath, "utf8");

const expectedVideos = [
  "/external/freebeat-seedance/homeGrid-v1-17.mp4",
  "/external/freebeat-seedance/homeGrid-v1-11.mp4",
  "/external/freebeat-seedance/homeGrid-v1-2.mp4",
  "/external/freebeat-seedance/homeGrid-v1-7.mp4",
];

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

const foundVideos = [...source.matchAll(/video:\s*"([^"]+)"/g)].map((match) => match[1]);

assert(
  JSON.stringify(foundVideos) === JSON.stringify(expectedVideos),
  `Expected carousel videos ${expectedVideos.join(", ")} but found ${foundVideos.join(", ") || "none"}`,
);

assert(source.includes("<video"), "Expected material carousel to render a video element");
assert(source.includes("autoPlay"), "Expected carousel video to autoplay");
assert(source.includes("muted"), "Expected carousel video to be muted for autoplay");
assert(source.includes("loop"), "Expected carousel video to loop");
assert(source.includes("playsInline"), "Expected carousel video to play inline on mobile browsers");
assert(!source.includes("/character-library/openart-seed/"), "Old character image materials should not remain");

console.log("Material carousel video configuration is correct.");
