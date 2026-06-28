import { envConfigs } from "@/config";
import { PreviewWorkbench } from "@/components/lyric-videos/preview-workbench";

export default async function CreationPreviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ debugLock?: string }>;
}) {
  const { id } = await params;
  const query = searchParams ? await searchParams : {};
  const debugGenerationLocked =
    process.env.NODE_ENV !== "production" && ["1", "true", "yes"].includes(String(query.debugLock || "").toLowerCase());

  return <PreviewWorkbench projectId={id} appName={envConfigs.app_name} debugGenerationLocked={debugGenerationLocked} />;
}
