import assert from 'node:assert/strict';
import { buildTimelineRulerTicks } from '../src/components/lyric-videos/preview-workbench/timeline-ruler';

const normalZoomTicks = buildTimelineRulerTicks({ totalDurationSeconds: 65, zoom: 1 });

assert.equal(normalZoomTicks.length, 66);
assert.deepEqual(
  normalZoomTicks.filter((tick) => tick.label).map((tick) => tick.second),
  [0, 10, 20, 30, 40, 50, 60],
);
assert.equal(normalZoomTicks.find((tick) => tick.second === 5)?.strength, 'medium');
assert.equal(normalZoomTicks.find((tick) => tick.second === 6)?.strength, 'minor');

const closeZoomTicks = buildTimelineRulerTicks({ totalDurationSeconds: 28, zoom: 2 });

assert.deepEqual(
  closeZoomTicks.filter((tick) => tick.label).map((tick) => tick.second),
  [0, 5, 10, 15, 20, 25],
);

console.log('timeline ruler tick helpers ok');
