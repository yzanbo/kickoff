import { projectMemoFolder } from "@shared/memo/names";
import type { NewProjectMemoDir } from "@shared/types";
import { api } from "@/api";
import { useAsync } from "@/hooks/useAsync";
import { useProjects } from "@/stores/projects";
import { useAppSettings } from "@/stores/settings";
import { Field } from "@/ui/Field";
import { MemoOverlapNotice } from "@/features/memo/MemoOverlapNotice";

/**
 * 新しいプロジェクト・取り込むプロジェクトのメモの保存先を送る形。手で決めた場所（custom）があれば別の場所（memo_path）、
 * なければ base（フォルダ名）から設定の親フォルダの下の名前（memo_folder。コアが重ならない名前にする）。base がまだなければ送らない（今までどおり、初めてメモを使ったときに決める）
 */
export function memoDirBody(base: string, custom: string | null): NewProjectMemoDir {
  if (custom?.trim()) return { memo_path: custom.trim() };
  return base.trim() ? { memo_folder: base.trim() } : {};
}

/**
 * 「メモの保存先」の欄。ふだんは保存先・フォルダから自動で決まる場所（設定の親フォルダ / フォルダ名。ほかのプロジェクトと重なれば「名前-2」）を見せるだけで、
 * 「変更…」で手で決められる（絶対パス・「選択…」・「自動に戻す」）。custom が null なら自動
 */
export function MemoDirField({ base, custom, onCustom }: { base: string; custom: string | null; onCustom: (next: string | null) => void }) {
  const auto = useAutoMemoDir(base);
  const label = "メモの保存先";
  if (custom === null) {
    return (
      <Field as="div" label={label} help="「メモ」タブのメモを置くフォルダです（アプリの設定の「メモ」の親フォルダの下に、フォルダ名で作ります）。">
        <div className="input-row">
          <input type="text" aria-label={label} value={auto ?? ""} placeholder="フォルダを選ぶと決まります" readOnly className="memo-dir-auto" title={auto} />
          <button type="button" className="btn" onClick={() => onCustom(auto ?? "")}>
            変更…
          </button>
        </div>
        <MemoOverlapNotice dir={auto} />
      </Field>
    );
  }
  return (
    <Field as="div" label={label} help="このプロジェクトだけ、指定した場所にメモを置きます（/ か ~ から始まる場所。あとからプロジェクトの設定でも変えられます）。">
      <div className="input-row">
        <input type="text" aria-label={label} value={custom} required autoFocus placeholder={auto ?? "/Users/you/memos/my-app"} onChange={(e) => onCustom(e.target.value)} />
        {window.kickoff && (
          <button
            type="button"
            className="btn"
            onClick={async () => {
              const picked = await window.kickoff?.dialog.pickFolder("メモの保存先を選択");
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
      <MemoOverlapNotice dir={custom} />
    </Field>
  );
}

/** 自動で決まるメモのフォルダ（base がなければ undefined。親フォルダが分かるまでも undefined） */
function useAutoMemoDir(base: string): string | undefined {
  const settings = useAppSettings().data;
  const defaults = useAsync(() => api.memoDefaults());
  const { projects } = useProjects();
  const root = settings?.memos_dir ?? defaults.data?.default_dir;
  if (!root || !base.trim()) return undefined;
  return `${root.replace(/\/+$/, "")}/${projectMemoFolder(base.trim(), projects)}`;
}
