import { redirect } from "@/core/i18n/navigation";

export default async function LyricVideoPreviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams?: Promise<{ debugLock?: string }>;
}) {
  const { locale, id } = await params;
  const query = searchParams ? await searchParams : {};
  const debugLock = String(query.debugLock || "");
  const suffix = debugLock ? `?debugLock=${encodeURIComponent(debugLock)}` : "";

  redirect({ href: `/creations/${id}/preview${suffix}`, locale });
}
