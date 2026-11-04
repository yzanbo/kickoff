import { useSetting } from "@/hooks/useSetting";
import { CHAT_CLOSE_ACTION } from "@/lib/storageKeys";
import { CHAT_CLOSE_ACTION_LABELS, CHAT_CLOSE_ACTIONS, type ChatCloseAction } from "@/features/chat/closeChat";
import { CheckField, Field } from "@/ui/Field";
import { Segmented } from "@/ui/Segmented";
import { SaveActions } from "@/ui/SaveActions";
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

/** 設定: チャットの扱い（完了したチャットの自動のアーカイブ・通信が切れて止まったときの自動の再開・✕ を押したときの扱い） */
export function ChatSettings() {
  const { draft, setDraft, dirty, save, saveFields } = useSettingsDraft();
  // ✕ を押したときの扱い（この Mac の画面の設定なので、選んだらすぐ反映する）
  const [closeAction, setCloseAction] = useSetting(CHAT_CLOSE_ACTION);
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
            value={draft.auto_archive_days ?? ""}
            onChange={(e) => setDraft({ ...draft, auto_archive_days: e.target.value ? Number(e.target.value) : null })}
          >
            {ARCHIVE_CHOICES.map((c) => (
              <option key={c.label} value={c.value ?? ""}>
                {c.value === null ? c.label : `完了から ${c.label}たったら`}
              </option>
            ))}
          </select>
        </Field>
        <CheckField
          label="通信が切れて止まったら、つながったときに自動で再開する"
          help="作業中に Wi-Fi が切れるなどして止まったチャットに、つながったら「続けて」を送ります。続けて 3 回止まったら、再開するかをチャットの中で聞きます。止まっている間、送信待ちの指示は送らずに止めておきます。"
          checked={draft.auto_resume_on_reconnect}
          onChange={(on) => setDraft({ ...draft, auto_resume_on_reconnect: on })}
        />
      </div>
      <SaveActions
        save={save}
        disabled={!dirty}
        onSave={() => saveFields({ auto_archive_days: draft.auto_archive_days, auto_resume_on_reconnect: draft.auto_resume_on_reconnect })}
      />
      <div className="form">
        <Field
          label="チャットの ✕ を押したとき"
          help="チャットのタブの × に効きます（選んだらすぐ反映）。毎回聞くときは、表示だけ消す・アーカイブ・削除から選び、「次からはこれにする」でここを変えられます。削除は取り消せないので、既定にしても毎回確かめます。"
        >
          <Segmented<ChatCloseAction>
            className="segmented theme-switch"
            label="チャットの ✕ を押したとき"
            value={closeAction}
            onChange={setCloseAction}
            options={CHAT_CLOSE_ACTIONS.map((value) => ({ value, label: CHAT_CLOSE_ACTION_LABELS[value] }))}
          />
        </Field>
      </div>
    </section>
  );
}
