import { redirect } from "@/core/i18n/navigation";

export default async function LegacyLyricVideoPreviewPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  redirect({ href: `/lyric-videos/${id}/preview`, locale });
}
