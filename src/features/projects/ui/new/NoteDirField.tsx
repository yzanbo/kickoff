import { projectNoteFolder } from "@shared/notes/names";
import type { NewProjectNoteDir } from "@shared/foundation/apiTypes";
import { api } from "@/foundation/ui/api";
import { useQuery } from "@/foundation/ui/query";
import { useProjects } from "@/features/projects/ui/stores/projects";
import { useAppSettings } from "@/features/settings/ui/stores/settings";
import { Field } from "@/foundation/ui/kit/Field";
import { NoteOverlapNotice } from "@/features/notes/ui/NoteOverlapNotice";

/**
 * 新しいプロジェクト・取り込むプロジェクトのノートの保存先を送る形。手で決めた場所（custom）があれば別の場所（note_dir）、
 * なければ base（フォルダ名）から設定の親フォルダの下の名前（note_folder。コアが重ならない名前にする）。base がまだなければ送らない（初めてノートを使ったときに決める）
 */
export function noteDirBody(base: string, custom: string | null): NewProjectNoteDir {
  if (custom?.trim()) return { note_dir: custom.trim() };
  return base.trim() ? { note_folder: base.trim() } : {};
}

/**
 * 「ノートの保存先」の欄。ふだんは保存先・フォルダから自動で決まる場所（設定の親フォルダ / フォルダ名。ほかのプロジェクトと重なれば「名前-2」）を見せるだけで、
 * 「変更…」で手で決められる（絶対パス・「選択…」・「自動に戻す」）。custom が null なら自動
 */
export function NoteDirField({ base, custom, onCustom }: { base: string; custom: string | null; onCustom: (next: string | null) => void }) {
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
        {window.kickoff && (
          <button
            type="button"
            className="btn"
            onClick={async () => {
              const picked = await window.kickoff?.dialog.pickFolder("ノートの保存先を選択");
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
  const defaults = useQuery("NoteDirField.defaults", () => api.noteDefaults());
  const { projects } = useProjects();
  const root = settings?.notes_dir ?? defaults.data?.default_dir;
  if (!root || !base.trim()) return undefined;
  return `${root.replace(/\/+$/, "")}/${projectNoteFolder(base.trim(), projects)}`;
}
