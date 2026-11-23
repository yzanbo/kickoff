import "./NewProjectNoteDirField.css";
import { projectNoteFolder } from "@shared/notes/names";
import { useQuery } from "@/foundation/ui/query";
import { useProjects, type NewProjectNoteFieldProps } from "@/features/projects/ui";
import { useAppSettings } from "@/features/settings/ui";
import { Field } from "@/foundation/ui/kit/Field";
import { notesApi } from "@/features/notes/ui/api";
import { NoteOverlapNotice } from "./NoteOverlapNotice";
import { canPickFolder, pickFolder } from "@/features/notes/ui/native";

/**
 * 「ノートの保存先」の欄。ふだんは保存先・フォルダから自動で決まる場所（設定の親フォルダ / フォルダ名。ほかのプロジェクトと重なれば「名前-2」）を見せるだけで、
 * 「変更…」で手で決められる（絶対パス・「選択…」・「自動に戻す」）。custom が null なら自動。新しいプロジェクトのダイアログ（projects の newProjectNoteField）に出す
 */
export function NewProjectNoteDirField({ base, custom, onCustom }: NewProjectNoteFieldProps) {
  const auto = useAutoNoteDir(base);
  const label = "ノートの保存先";
  if (custom === null) {
    return (
      <Field as="div" label={label} help="「ノート」タブのノートを置くフォルダです（アプリの設定の「ノート」の親フォルダの下に、フォルダ名で作ります）。">
        <div className="input-row">
          <input type="text" aria-label={label} value={auto ?? ""} placeholder="フォルダを選ぶと決まります" readOnly className="note-dir-auto" title={auto} />
          <button type="button" className="btn" onClick={() => onCustom(auto ?? "")}>
            変更…
          </button>
        </div>
        <NoteOverlapNotice dir={auto} />
      </Field>
    );
  }
  return (
    <Field as="div" label={label} help="このプロジェクトだけ、指定した場所にノートを置きます（/ か ~ から始まる場所。あとからプロジェクトの設定でも変えられます）。">
      <div className="input-row">
        <input type="text" aria-label={label} value={custom} required autoFocus placeholder={auto ?? "/Users/you/notes/my-app"} onChange={(e) => onCustom(e.target.value)} />
        {canPickFolder() && (
          <button
            type="button"
            className="btn"
            onClick={async () => {
              const picked = await pickFolder("ノートの保存先を選択");
              if (picked) onCustom(picked);
            }}
          >
            選択…
          </button>
        )}
        <button type="button" className="btn" onClick={() => onCustom(null)}>
          自動に戻す
        </button>
      </div>
      <NoteOverlapNotice dir={custom} />
    </Field>
  );
}

/** 自動で決まるノートのフォルダ（base がなければ undefined。親フォルダが分かるまでも undefined） */
function useAutoNoteDir(base: string): string | undefined {
  const settings = useAppSettings().data;
  const defaults = useQuery("NoteDirField.defaults", () => notesApi("GET /api/notes/defaults"));
  const { projects } = useProjects();
  const root = settings?.notes_dir ?? defaults.data?.default_dir;
  if (!root || !base.trim()) return undefined;
  return `${root.replace(/\/+$/, "")}/${projectNoteFolder(base.trim(), projects)}`;
}
