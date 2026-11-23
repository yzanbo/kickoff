import { DB_NOTE_DIR } from "@/features/database/ui/connection/dbFailure";
import type { DbConnection } from "@shared/database/types";
import { useNoteList } from "@/features/notes/ui/stores/notes";
import { Field } from "@/foundation/ui/kit/Field";
import { createDbNoteFile, noteChoices } from "./dbNote";

/**
 * 接続のダイアログの「手順ノート」: ノートのフォルダのノートから選ぶ（なし・DB/ の下を先に）か、「新しく作る…」で DB/ の下にひな形から作って選ぶ
 * （名前は入力中のつなぎ方 from からすすめる。保存するまで接続には結ばない）。
 * 選んでいるノートがもうないときも、その名前を「（見つかりません）」で残す（消したときに勝手に外さない）
 */
export function ConnectionNoteField({
  projectId,
  value,
  from,
  onChange,
}: {
  projectId: number;
  value: string;
  from: Pick<DbConnection, "engine" | "environment" | "host">;
  onChange: (path: string) => void;
}) {
  const list = useNoteList(projectId);
  const choices = noteChoices(list.data?.entries ?? []);
  const missing = value !== "" && list.data !== undefined && !choices.includes(value);
  return (
    <Field
      as="div"
      label="手順ノート"
      help={`つなぐ前にやること・つながらないときの直し方を書いたノート。「新しく作る…」・接続の右クリックの「手順ノートを作る…」で、ノートのフォルダの「${DB_NOTE_DIR}/」の下にひな形から作れます`}
    >
      <div className="db-note-field">
        <select value={value} aria-label="手順ノート" onChange={(e) => onChange(e.target.value)}>
          <option value="">なし</option>
          {missing && <option value={value}>{value}（見つかりません）</option>}
          {/* 一覧が届く前は、いまの値だけを出しておく */}
          {!list.data && value !== "" && <option value={value}>{value}</option>}
          {choices.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <button type="button" className="btn" data-size="sm" onClick={() => void createDbNoteFile(projectId, from, "この接続").then((path) => path && onChange(path))}>
          新しく作る…
        </button>
      </div>
    </Field>
  );
}
