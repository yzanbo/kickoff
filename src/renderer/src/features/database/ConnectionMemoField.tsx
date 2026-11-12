import { DB_MEMO_DIR } from "@shared/database/dbFailure";
import type { DbConnection } from "@shared/types";
import { useMemoList } from "@/stores/memos";
import { Field } from "@/ui/Field";
import { createDbMemoFile, memoChoices } from "./dbMemo";

/**
 * 接続のダイアログの「手順メモ」: メモのフォルダのメモから選ぶ（なし・DB/ の下を先に）か、「新しく作る…」で DB/ の下にひな形から作って選ぶ
 * （名前は入力中のつなぎ方 from からすすめる。保存するまで接続には結ばない）。
 * 選んでいるメモがもうないときも、その名前を「（見つかりません）」で残す（消したときに勝手に外さない）
 */
export function ConnectionMemoField({
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
  const list = useMemoList(projectId);
  const choices = memoChoices(list.data?.entries ?? []);
  const missing = value !== "" && list.data !== undefined && !choices.includes(value);
  return (
    <Field
      as="div"
      label="手順メモ"
      help={`つなぐ前にやること・つながらないときの直し方を書いたメモ。「新しく作る…」・接続の右クリックの「手順メモを作る…」で、メモのフォルダの「${DB_MEMO_DIR}/」の下にひな形から作れます`}
    >
      <div className="db-memo-field">
        <select value={value} aria-label="手順メモ" onChange={(e) => onChange(e.target.value)}>
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
        <button type="button" className="btn btn-sm" onClick={() => void createDbMemoFile(projectId, from, "この接続").then((path) => path && onChange(path))}>
          新しく作る…
        </button>
      </div>
    </Field>
  );
}
