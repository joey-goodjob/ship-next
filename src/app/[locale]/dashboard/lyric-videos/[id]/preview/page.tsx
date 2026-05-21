import { PreviewWorkbench } from "./preview-workbench";

export default async function LyricVideoPreviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <PreviewWorkbench projectId={id} />;
}
