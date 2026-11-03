import { Field } from "../Field";
import { SaveActions } from "../SaveActions";
import { useSettingsDraft } from "./useSettingsDraft";

/** 自動のアーカイブで選べる日数（null はしない） */
const ARCHIVE_CHOICES: { value: number | null; label: string }[] = [
  { value: null, label: "しない" },
  { value: 1, label: "1 日" },
  { value: 3, label: "3 日" },
  { value: 7, label: "7 日" },
  { value: 14, label: "14 日" },
  { value: 30, label: "30 日" },
];

/** 設定: チャットの扱い（完了したチャットの自動のアーカイブ・通信が切れて止まったときの自動の再開） */
export function ChatSettings() {
  const { draft, setDraft, dirty, save, saveFields } = useSettingsDraft();
  if (!draft) return null;
  return (
    <section className="section">
      <h2>チャット</h2>
      <div className="form">
        <Field
          label="完了したチャットを自動でアーカイブ"
          help="終わって既読になったチャットを、最後に動いてからこの日数がたったら、一覧からしまいます。未読・回答待ち・作業中・失敗した・固定したチャットはしまいません。会話の記録は残り、アーカイブ済みから戻せます。"
        >
          <select
            value={draft.autoArchiveDays ?? ""}
            onChange={(e) => setDraft({ ...draft, autoArchiveDays: e.target.value ? Number(e.target.value) : null })}
          >
            {ARCHIVE_CHOICES.map((c) => (
              <option key={c.label} value={c.value ?? ""}>
                {c.value === null ? c.label : `完了から ${c.label}たったら`}
              </option>
            ))}
          </select>
        </Field>
        <label className="check">
          <input
            type="checkbox"
            checked={draft.autoResumeOnReconnect}
            onChange={(e) => setDraft({ ...draft, autoResumeOnReconnect: e.target.checked })}
          />
          <span>
            通信が切れて止まったら、つながったときに自動で再開する
            <span className="field-help">
              作業中に Wi-Fi が切れるなどして止まったチャットに、つながったら「続けて」を送ります。続けて 3 回止まったら、再開するかをチャットの中で聞きます。止まっている間、送信待ちの指示は送らずに止めておきます。
            </span>
          </span>
        </label>
      </div>
      <SaveActions
        save={save}
        disabled={!dirty}
        onSave={() => saveFields({ autoArchiveDays: draft.autoArchiveDays, autoResumeOnReconnect: draft.autoResumeOnReconnect })}
      />
    </section>
  );
}
