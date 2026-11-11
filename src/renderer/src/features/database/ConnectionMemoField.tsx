import { DB_MEMO_DIR } from "@shared/database/dbFailure";
import { useMemoList } from "@/stores/memos";
import { Field } from "@/ui/Field";
import { memoChoices } from "./dbMemo";

/**
 * 接続のダイアログの「手順メモ」: メモのフォルダのメモから選ぶ（なし・DB/ の下を先に）。
 * 選んでいるメモがもうないときも、その名前を「（見つかりません）」で残す（消したときに勝手に外さない）
 */
export function ConnectionMemoField({ projectId, value, onChange }: { projectId: number; value: string; onChange: (path: string) => void }) {
  const list = useMemoList(projectId);
  const choices = memoChoices(list.data?.entries ?? []);
  const missing = value !== "" && list.data !== undefined && !choices.includes(value);
  return (
    <Field
      label="手順メモ"
      help={`つなぐ前にやること・つながらないときの直し方を書いたメモ。接続の右クリックの「手順メモを作る…」で、メモのフォルダの「${DB_MEMO_DIR}/」の下にひな形から作れます`}
    >
      <select value={value} onChange={(e) => onChange(e.target.value)}>
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
    </Field>
  );
}
