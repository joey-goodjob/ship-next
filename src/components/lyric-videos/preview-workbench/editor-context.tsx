"use client";

import { createContext, useContext } from "react";
import type { EditorContextValue } from "./types";

export const EditorContext = createContext<EditorContextValue | null>(null);

export function useEditor() {
  const value = useContext(EditorContext);
  if (!value) throw new Error("useEditor must be used inside EditorProvider");
  return value;
}
