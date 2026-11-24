// プロジェクトの編集のダイアログで編集しているプロジェクト（ProjectEditDialog が渡し、設定の節・欄が読む。節はほかの機能も登録する）
import { createContext, useContext } from "react";
import type { Project } from "@shared/projects/types";

export const EditedProjectContext = createContext<Project | null>(null);

/** 編集しているプロジェクト（プロジェクトの編集のダイアログの中だけで呼ぶ） */
export function useEditedProject(): Project {
  const project = useContext(EditedProjectContext);
  if (!project) throw new Error("useEditedProject はプロジェクトの編集のダイアログの中で呼ぶ");
  return project;
}
