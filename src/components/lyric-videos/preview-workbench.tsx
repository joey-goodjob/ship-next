"use client";

import { useEffect } from "react";
import { EditorProvider } from "./preview-workbench/editor-provider";
import { EditorWorkspace } from "./preview-workbench/editor-workspace";

export function PreviewWorkbench({
  appName,
  debugGenerationLocked,
  projectId,
}: {
  appName: string;
  debugGenerationLocked?: boolean;
  projectId: string;
}) {
  useEffect(() => {
    const htmlOverflow = document.documentElement.style.overflow;
    const bodyOverflow = document.body.style.overflow;
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";

    return () => {
      document.documentElement.style.overflow = htmlOverflow;
      document.body.style.overflow = bodyOverflow;
    };
  }, []);

  return (
    <EditorProvider appName={appName} projectId={projectId} debugGenerationLocked={debugGenerationLocked}>
      <EditorWorkspace />
    </EditorProvider>
  );
}
