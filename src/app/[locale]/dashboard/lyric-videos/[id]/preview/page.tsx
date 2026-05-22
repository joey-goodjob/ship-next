import { envConfigs } from "@/config";
import { PreviewWorkbench } from "./preview-workbench";

export default async function LyricVideoPreviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <PreviewWorkbench projectId={id} appName={envConfigs.app_name} />;
}
