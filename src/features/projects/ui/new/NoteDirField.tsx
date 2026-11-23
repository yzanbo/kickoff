// projects ⇄ notes の口: 新しいプロジェクト・取り込むプロジェクトのダイアログの「ノートの保存先」の欄（notes が contributes.ts で 1 つだけ登録する。
// 登録がなければ欄なし）。送る形（noteDirBody）は projects の API の本文なので、ここに置く
import type { ComponentType } from "react";
import type { NewProjectNoteDir } from "@shared/foundation/apiTypes";
import { definePoint } from "@/foundation/ui/points";

/** base = 自動で決めるときのフォルダ名、custom = 手で決めた場所（null なら自動） */
export interface NewProjectNoteFieldProps {
  base: string;
  custom: string | null;
  onCustom: (next: string | null) => void;
}

export const newProjectNoteField = definePoint<{ Field: ComponentType<NewProjectNoteFieldProps> }>("newProjectNoteField", { key: () => "notes" });

/**
 * 新しいプロジェクト・取り込むプロジェクトのノートの保存先を送る形。手で決めた場所（custom）があれば別の場所（note_dir）、
 * なければ base（フォルダ名）から設定の親フォルダの下の名前（note_folder。コアが重ならない名前にする）。base がまだなければ送らない（初めてノートを使ったときに決める）
 */
export function noteDirBody(base: string, custom: string | null): NewProjectNoteDir {
  if (custom?.trim()) return { note_dir: custom.trim() };
  return base.trim() ? { note_folder: base.trim() } : {};
}

/** 登録された「ノートの保存先」の欄を描く */
export function NoteDirField(props: NewProjectNoteFieldProps) {
  const Field = newProjectNoteField.items()[0]?.Field;
  return Field ? <Field {...props} /> : null;
}
