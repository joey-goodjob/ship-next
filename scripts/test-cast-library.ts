import {
  activeCastForStoryboard,
  castCombinationKeyForScene,
  castRoleForDisplay,
  castRoleForStorage,
  castRoleRank,
  cleanSceneCastIds,
  ensureUniqueActiveCastName,
  groupScenesByCastCombination,
  insertCastMention,
  parseCastMentionIds,
  parseCastMentionIdsFromPrompts,
  removeCastMention,
} from '../src/modules/lyric-videos/lyric/cast-library';
import fs from 'node:fs';

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
}

function assertDeepEqual(actual: unknown, expected: unknown, message: string) {
  const left = JSON.stringify(actual);
  const right = JSON.stringify(expected);
  if (left !== right) throw new Error(`${message}: expected ${right}, got ${left}`);
}

const cast = [
  { id: 'legacy-main', role: 'main', status: 'active', deletedAt: null, sort: 3, name: 'Legacy' },
  { id: 'secondary', role: 'secondary', status: 'active', deletedAt: null, sort: 2, name: 'B' },
  { id: 'tertiary', role: 'tertiary', status: 'active', deletedAt: null, sort: 5, name: 'C' },
  { id: 'quaternary', role: 'quaternary', status: 'active', deletedAt: null, sort: 6, name: 'D' },
  { id: 'inactive', role: 'inactive', status: 'inactive', deletedAt: null, sort: 1, name: 'Hidden' },
  { id: 'deleted', role: 'primary', status: 'active', deletedAt: new Date(), sort: 0, name: 'Deleted' },
  { id: 'third', role: 'primary', status: 'active', deletedAt: null, sort: 4, name: 'Third' },
  { id: 'fifth', role: 'secondary', status: 'active', deletedAt: null, sort: 7, name: 'Fifth' },
];

assertEqual(castRoleForStorage('main'), 'primary', 'legacy main should normalize to primary');
assertEqual(castRoleForStorage('duet_partner'), 'secondary', 'duet partner should normalize to secondary');
assertEqual(castRoleForStorage('tertiary'), 'tertiary', 'tertiary should be a valid role');
assertEqual(castRoleForStorage('quaternary'), 'quaternary', 'quaternary should be a valid role');
assertEqual(castRoleForStorage('anything'), 'inactive', 'unknown role should normalize to inactive');
assertEqual(castRoleForDisplay('main'), 'Primary', 'legacy main should display as Primary');
assertEqual(castRoleForDisplay('secondary'), 'Role 2', 'secondary should display as Role 2');
assertEqual(castRoleForDisplay('tertiary'), 'Role 3', 'tertiary should display as Role 3');
assertEqual(castRoleForDisplay('quaternary'), 'Role 4', 'quaternary should display as Role 4');
assert(castRoleRank('primary') < castRoleRank('secondary'), 'primary should sort before secondary');
assert(castRoleRank('tertiary') < castRoleRank('quaternary'), 'tertiary should sort before quaternary');

const active = activeCastForStoryboard(cast);
assertDeepEqual(
  active.map((member) => member.id),
  ['legacy-main', 'secondary', 'tertiary', 'quaternary'],
  'active storyboard cast should keep one member per role slot, up to four',
);

assertDeepEqual(
  cleanSceneCastIds(['legacy-main', 'missing', 'secondary', 'tertiary', 'quaternary', 'fifth'], active),
  ['legacy-main', 'secondary', 'tertiary', 'quaternary'],
  'cleanSceneCastIds should drop missing ids and preserve active ids',
);

const mentionCast = [
  { id: 'maya', role: 'primary', status: 'active', deletedAt: null, sort: 0, name: 'Maya' },
  { id: 'eli', role: 'secondary', status: 'active', deletedAt: null, sort: 1, name: 'Eli' },
  { id: 'may', role: 'tertiary', status: 'active', deletedAt: null, sort: 2, name: 'May' },
  { id: 'hidden', role: 'inactive', status: 'inactive', deletedAt: null, sort: 3, name: 'Hidden' },
];

assertDeepEqual(
  parseCastMentionIds('Wide view, @Maya waits while @Eli enters.', mentionCast),
  ['maya', 'eli'],
  'mentions should parse active cast ids in active cast order',
);
assertDeepEqual(
  parseCastMentionIds('@Eli crosses frame. @Eli turns back.', mentionCast),
  ['eli'],
  'duplicate mentions should return one cast id',
);
assertDeepEqual(
  parseCastMentionIds('No characters in this establishing shot.', mentionCast),
  [],
  'removing mentions should produce no cast ids',
);
assertDeepEqual(
  parseCastMentionIds('@Maya and @May share the frame.', mentionCast),
  ['maya', 'may'],
  'longer cast names should win over prefix names',
);
assertDeepEqual(
  parseCastMentionIds('@Hidden should not bind inactive characters.', mentionCast),
  [],
  'inactive cast should not be parsed from mentions',
);
assertDeepEqual(
  parseCastMentionIdsFromPrompts(['Still image with @Maya on rooftop.', 'Camera follows @Eli entering frame.'], mentionCast),
  ['maya', 'eli'],
  'image and video prompts should combine mentioned cast ids',
);
assertDeepEqual(
  parseCastMentionIdsFromPrompts(['@Maya holds frame.', 'Camera circles @Maya, then @Eli turns.'], mentionCast),
  ['maya', 'eli'],
  'combined image and video mentions should dedupe ids',
);
assertDeepEqual(
  insertCastMention('Wide view, @', 'Wide view, @'.length, mentionCast[0]),
  { text: 'Wide view, @Maya ', cursor: 'Wide view, @Maya '.length },
  'insertCastMention should replace the active @ query',
);
assertDeepEqual(
  insertCastMention('Wide view, @Ma on rooftop', 'Wide view, @Ma'.length, mentionCast[0]),
  { text: 'Wide view, @Maya on rooftop', cursor: 'Wide view, @Maya '.length },
  'insertCastMention should replace a partial mention query',
);
assertEqual(
  removeCastMention('@Maya watches the sky while @Eli enters. @Maya turns.', mentionCast[0]),
  'watches the sky while @Eli enters. turns.',
  'removeCastMention should remove all mentions for one cast member',
);
assert(!ensureUniqueActiveCastName([...mentionCast, { id: 'dupe', role: 'quaternary', status: 'active', deletedAt: null, sort: 4, name: ' maya ' }]), 'active cast names should be unique case-insensitively');
assert(ensureUniqueActiveCastName([...mentionCast, { id: 'ok', role: 'inactive', status: 'inactive', deletedAt: null, sort: 4, name: 'Maya' }]), 'inactive duplicate cast names should be allowed');

const scenes = [
  { id: 'none', castIds: [] },
  { id: 'a', castIds: ['legacy-main'] },
  { id: 'b', castIds: ['secondary'] },
  { id: 'multi', castIds: ['quaternary', 'secondary', 'legacy-main', 'tertiary'] },
  { id: 'stale', castIds: ['deleted', 'missing'] },
];

assertEqual(castCombinationKeyForScene(scenes[0], active), 'none', 'empty scene should use none key');
assertEqual(
  castCombinationKeyForScene(scenes[3], active),
  'legacy-main+secondary+tertiary+quaternary',
  'combination key should sort up to four cast ids',
);
assertEqual(castCombinationKeyForScene(scenes[4], active), 'none', 'stale ids should collapse to none');

const grouped = groupScenesByCastCombination(scenes, active);
assertDeepEqual(
  grouped.map((group) => ({ key: group.key, ids: group.scenes.map((scene) => scene.id) })),
  [
    { key: 'none', ids: ['none', 'stale'] },
    { key: 'legacy-main', ids: ['a'] },
    { key: 'secondary', ids: ['b'] },
    { key: 'legacy-main+secondary+tertiary+quaternary', ids: ['multi'] },
  ],
  'scenes should group by cleaned cast combination',
);

const castPanelSource = fs.readFileSync('src/components/lyric-videos/preview-workbench/cast-panel.tsx', 'utf8');
for (const removedEntry of ['Generate candidates', 'Choose preset', 'Upload character', 'ImageUploader', 'CHARACTER_PRESETS']) {
  assert(!castPanelSource.includes(removedEntry), `CastPanel should not expose ${removedEntry}`);
}
assert(castPanelSource.includes('Add Character'), 'CastPanel should keep a single Add Character entry point');
assert(castPanelSource.includes('Generate New Image'), 'CastPanel should expose AI image generation from the character editor');
assert(castPanelSource.includes('pendingDeleteId'), 'CastPanel should use inline delete confirmation state');
assert(castPanelSource.includes('Yes'), 'CastPanel should expose an inline Yes delete action');
assert(castPanelSource.includes('No'), 'CastPanel should expose an inline No delete action');

const castServiceSource = fs.readFileSync('src/modules/lyric-videos/lyric/cast.ts', 'utf8');
for (const removedCandidateLogic of ['generateCastCandidates', 'Create exactly 3 candidates', 'cast-candidates']) {
  assert(!castServiceSource.includes(removedCandidateLogic), `Cast service should not keep ${removedCandidateLogic}`);
}
for (const requiredCharacterPrompt of ['three-view full body character reference sheet', 'front view, side view, and back view', 'plain white background']) {
  assert(castServiceSource.includes(requiredCharacterPrompt), `Character prompt should require ${requiredCharacterPrompt}`);
}
assert(castServiceSource.includes('ensureUniqueActiveCastName'), 'Cast service should enforce unique active cast names');
assert(castServiceSource.includes('Active character names must be unique'), 'Cast service should return a clear duplicate active name error');

const editorProviderSource = fs.readFileSync('src/components/lyric-videos/preview-workbench/editor-provider.tsx', 'utf8');
assert(!editorProviderSource.includes('window.confirm'), 'Cast deletion should not use browser confirm dialogs');
assert(editorProviderSource.includes('previousCast'), 'Cast deletion should optimistically remove and restore on failure');

console.log('cast library rules ok');
