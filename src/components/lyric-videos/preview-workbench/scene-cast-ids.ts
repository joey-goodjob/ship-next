export function normalizeSceneCastIds(castIds: unknown): string[] {
  const rawIds = Array.isArray(castIds)
    ? castIds
    : typeof castIds === "string"
      ? parseSceneCastIdsJson(castIds)
      : [];

  return Array.from(
    new Set(
      rawIds
        .map((id) => String(id || "").trim())
        .filter(Boolean),
    ),
  );
}

function parseSceneCastIdsJson(value: string): unknown[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
