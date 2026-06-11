export type CastRole = 'primary' | 'secondary' | 'tertiary' | 'quaternary' | 'inactive';

type CastLike = {
  id: string;
  role?: string | null;
  status?: string | null;
  deletedAt?: unknown;
  sort?: number | null;
};

type SceneLike = {
  id?: string;
  castIds?: string[] | null;
};

export const ACTIVE_CAST_LIMIT = 4;
export const ACTIVE_CAST_ROLES: CastRole[] = ['primary', 'secondary', 'tertiary', 'quaternary'];
export {
  ensureUniqueActiveCastName,
  insertCastMention,
  parseCastMentionIds,
  parseCastMentionIdsFromPrompts,
  removeCastMention,
} from '@/lib/lyric-video-cast-mentions';

export function castRoleForStorage(role?: string | null): CastRole {
  const normalized = String(role || '').trim().toLowerCase();
  if (normalized === 'primary' || normalized === 'main') return 'primary';
  if (normalized === 'secondary' || normalized === 'duet_partner' || normalized === 'supporting') return 'secondary';
  if (normalized === 'tertiary' || normalized === 'third') return 'tertiary';
  if (normalized === 'quaternary' || normalized === 'fourth') return 'quaternary';
  return 'inactive';
}

export function castRoleForDisplay(role?: string | null) {
  const normalized = castRoleForStorage(role);
  if (normalized === 'primary') return 'Primary';
  if (normalized === 'secondary') return 'Role 2';
  if (normalized === 'tertiary') return 'Role 3';
  if (normalized === 'quaternary') return 'Role 4';
  return 'Inactive';
}

export function castRoleRank(role?: string | null) {
  const normalized = castRoleForStorage(role);
  if (normalized === 'primary') return 0;
  if (normalized === 'secondary') return 1;
  if (normalized === 'tertiary') return 2;
  if (normalized === 'quaternary') return 3;
  return 4;
}

export function isActiveCastMember(member: CastLike) {
  if (member.deletedAt) return false;
  if (String(member.status || 'active') !== 'active') return false;
  return castRoleForStorage(member.role) !== 'inactive';
}

export function activeCastForStoryboard<T extends CastLike>(cast?: T[]) {
  const sorted = (Array.isArray(cast) ? cast : [])
    .filter(isActiveCastMember)
    .sort((a, b) => {
      const roleDelta = castRoleRank(a.role) - castRoleRank(b.role);
      if (roleDelta !== 0) return roleDelta;
      return (Number(a.sort) || 0) - (Number(b.sort) || 0);
    });
  return ACTIVE_CAST_ROLES.map((role) => sorted.find((member) => castRoleForStorage(member.role) === role))
    .filter(Boolean)
    .slice(0, ACTIVE_CAST_LIMIT) as T[];
}

export function cleanSceneCastIds(castIds: unknown, cast?: CastLike[]) {
  const activeIds = new Set(activeCastForStoryboard(cast).map((member) => member.id));
  const rawIds = Array.isArray(castIds) ? castIds : [];
  const cleaned: string[] = [];
  for (const id of rawIds) {
    const castId = String(id || '').trim();
    if (!castId || !activeIds.has(castId) || cleaned.includes(castId)) continue;
    cleaned.push(castId);
  }
  return cleaned;
}

export function castCombinationKeyForScene(scene: SceneLike, cast?: CastLike[]) {
  const rankById = new Map(activeCastForStoryboard(cast).map((member, index) => [member.id, index]));
  const cleaned = cleanSceneCastIds(scene.castIds || [], cast).sort((a, b) => {
    return (rankById.get(a) ?? 99) - (rankById.get(b) ?? 99) || a.localeCompare(b);
  });
  return cleaned.length > 0 ? cleaned.join('+') : 'none';
}

export function groupScenesByCastCombination<T extends SceneLike>(scenes: T[], cast?: CastLike[]) {
  const groups = new Map<string, T[]>();
  for (const scene of scenes) {
    const key = castCombinationKeyForScene(scene, cast);
    groups.set(key, [...(groups.get(key) || []), scene]);
  }
  return Array.from(groups.entries()).map(([key, groupedScenes]) => ({
    key,
    scenes: groupedScenes,
  }));
}

export function removeCastIdFromSceneCastIds(castIds: unknown, castId: string) {
  const rawIds = Array.isArray(castIds) ? castIds : [];
  return rawIds.map((id) => String(id || '').trim()).filter((id) => id && id !== castId);
}
