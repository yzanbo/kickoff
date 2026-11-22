// notes がプロジェクトの画面の表（projectViews）に出す画面の中身
import type { ProjectViewContext } from "@/features/projects/ui";
import { NoteTab } from "./NoteTab";

/** 別のプロジェクトを読み込んでいる途中は、URL で来たノートを渡さない */
export const NotesViewPage = ({ project, stale, openNote, openNoteLine }: ProjectViewContext) => (
  <NoteTab key={project.id} projectId={project.id} openNote={stale ? undefined : openNote} openNoteLine={openNoteLine} />
);
