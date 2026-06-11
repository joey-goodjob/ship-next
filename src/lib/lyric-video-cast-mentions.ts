export type CastMentionMember = {
  id: string;
  name?: string | null;
  role?: string | null;
  status?: string | null;
  deletedAt?: unknown;
  sort?: number | null;
};

function castMentionRoleRank(role?: string | null) {
  const normalized = String(role || '').trim().toLowerCase();
  if (normalized === 'primary' || normalized === 'main' || !normalized) return 0;
  if (normalized === 'secondary' || normalized === 'duet_partner' || normalized === 'supporting') return 1;
  if (normalized === 'tertiary' || normalized === 'third') return 2;
  if (normalized === 'quaternary' || normalized === 'fourth') return 3;
  return 4;
}

function isActiveMentionCast(member: CastMentionMember) {
  if (member.deletedAt) return false;
  if (String(member.status || 'active') !== 'active') return false;
  return castMentionRoleRank(member.role) < 4;
}

function normalizedCastName(name: unknown) {
  return String(name || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function activeCastForMentions<T extends CastMentionMember>(cast?: T[]) {
  return (Array.isArray(cast) ? cast : [])
    .filter((member) => isActiveMentionCast(member) && normalizedCastName(member.name))
    .sort((a, b) => castMentionRoleRank(a.role) - castMentionRoleRank(b.role) || (Number(a.sort) || 0) - (Number(b.sort) || 0))
    .slice(0, 4);
}

function mentionBoundaryAllows(text: string, index: number) {
  if (index >= text.length) return true;
  return !/[\p{L}\p{N}_-]/u.test(text[index] || '');
}

function mentionCandidates(cast?: CastMentionMember[]) {
  return activeCastForMentions(cast)
    .map((member) => ({
      member,
      mention: `@${String(member.name || '').trim().replace(/\s+/g, ' ')}`,
    }))
    .filter((item) => item.mention.length > 1)
    .sort((a, b) => b.mention.length - a.mention.length);
}

export function parseCastMentionIds(prompt: string, cast?: CastMentionMember[]) {
  const text = String(prompt || '');
  const found = new Set<string>();
  const candidates = mentionCandidates(cast);
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] !== '@') continue;
    const rest = text.slice(index).toLowerCase();
    const match = candidates.find((candidate) => {
      const mention = candidate.mention.toLowerCase();
      return rest.startsWith(mention) && mentionBoundaryAllows(text, index + candidate.mention.length);
    });
    if (match) found.add(match.member.id);
  }
  return activeCastForMentions(cast).map((member) => member.id).filter((id) => found.has(id));
}

export function parseCastMentionIdsFromPrompts(prompts: string[], cast?: CastMentionMember[]) {
  const found = new Set<string>();
  for (const prompt of prompts) {
    for (const id of parseCastMentionIds(prompt, cast)) found.add(id);
  }
  return activeCastForMentions(cast).map((member) => member.id).filter((id) => found.has(id));
}

export function insertCastMention(prompt: string, cursor: number, castMember: Pick<CastMentionMember, 'name'>) {
  const text = String(prompt || '');
  const safeCursor = Math.max(0, Math.min(text.length, Math.floor(Number(cursor) || 0)));
  const before = text.slice(0, safeCursor);
  const after = text.slice(safeCursor);
  const queryStart = before.lastIndexOf('@');
  const replaceStart = queryStart >= 0 && !/\s/.test(before.slice(queryStart + 1)) ? queryStart : safeCursor;
  const prefix = text.slice(0, replaceStart);
  const name = String(castMember.name || '').trim().replace(/\s+/g, ' ');
  const mention = name ? `@${name} ` : '@';
  const nextText = `${prefix}${mention}${after.replace(/^\s+/, '')}`;
  return {
    text: nextText,
    cursor: prefix.length + mention.length,
  };
}

export function removeCastMention(prompt: string, castMember: Pick<CastMentionMember, 'name'>) {
  const name = String(castMember.name || '').trim().replace(/\s+/g, ' ');
  if (!name) return String(prompt || '');
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  return String(prompt || '')
    .replace(new RegExp(`(^|\\s)@${escaped}(?=$|\\s|[.,;:!?])`, 'giu'), ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function ensureUniqueActiveCastName(cast?: CastMentionMember[], ignoreCastId?: string) {
  const seen = new Set<string>();
  for (const member of activeCastForMentions(cast)) {
    if (ignoreCastId && member.id === ignoreCastId) continue;
    const name = normalizedCastName(member.name);
    if (!name) continue;
    if (seen.has(name)) return false;
    seen.add(name);
  }
  return true;
}
