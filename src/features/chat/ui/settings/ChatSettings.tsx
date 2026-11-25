import { useSetting } from "@/foundation/ui/hooks/useSetting";
import { storage } from "@/features/chat/ui/storage";
import { CHAT_CLOSE_ACTION_LABELS, CHAT_CLOSE_ACTIONS, type ChatCloseAction } from "@/features/chat/ui/closeChat";
import { BUSY_WORKPLACE_ACTION_LABELS, BUSY_WORKPLACE_ACTIONS, type BusyWorkplaceAction } from "@/features/chat/ui/workplace/busyWorkplace";
import { CheckField, Field } from "@/foundation/ui/kit/Field";
import { ChoiceField } from "@/foundation/ui/kit/ChoiceField";
import { applySettings, useAppSettings } from "@/foundation/ui/settings/appSettings";
import { AiCreateChatField } from "./AiCreateChatField";
import { AiWriteOtherProjectsField } from "./AiWriteOtherProjectsField";
import { ReadTimingField } from "./ReadTimingField";
import { settingsItemsOf } from "@/features/settings/ui";

/** 自動のアーカイブで選べる日数（null はしない） */
const ARCHIVE_CHOICES: { value: number | null; label: string }[] = [
  { value: null, label: "しない" },
  { value: 1, label: "1 日" },
  { value: 3, label: "3 日" },
  { value: 7, label: "7 日" },
  { value: 14, label: "14 日" },
  { value: 30, label: "30 日" },
];

/** 設定: チャットの扱い（既読にするタイミング・完了したチャットの自動のアーカイブ・上の機能の欄（自動圧縮を始める量）・通信が切れて止まったときの自動の再開・✕ を押したときの扱い・作業中の作業場所で始めるときの扱い・AI が子チャットを作るとき。変えたらすぐ保存する） */
export function ChatSettings() {
  const settings = useAppSettings().data;
  // ✕ を押したときの扱い（この Mac の画面の設定）
  const [closeAction, setCloseAction] = useSetting(storage.settings.closeAction);
  // ほかのチャットが作業中の作業場所へ新しいチャットを送るとき（これもこの Mac の画面の設定）
  const [busyAction, setBusyAction] = useSetting(storage.settings.busyWorkplaceAction);
  if (!settings) return null;
  return (
    <section className="section">
      <h2>チャット</h2>
      <div className="form">
        <ReadTimingField />
        <Field
          label="完了したチャットを自動でアーカイブ"
          help="終わって既読になったチャットを、最後に動いてからこの日数がたったら、一覧からしまいます。未読・回答待ち・作業中・失敗した・固定したチャットはしまいません。会話の記録は残り、アーカイブ済みから戻せます。"
        >
          <select
            value={settings.auto_archive_days ?? ""}
            onChange={(e) => applySettings({ auto_archive_days: e.target.value ? Number(e.target.value) : null })}
          >
            {ARCHIVE_CHOICES.map((c) => (
              <option key={c.label} value={c.value ?? ""}>
                {c.value === null ? c.label : `完了から ${c.label}たったら`}
              </option>
            ))}
          </select>
        </Field>
        {/* 上の機能の欄（自動圧縮を始める量は compact） */}
        {settingsItemsOf("chats").map(({ id, Component }) => (
          <Component key={id} />
        ))}
        <CheckField
          label="通信が切れて止まったら、つながったときに自動で再開する"
          help="作業中に Wi-Fi が切れるなどして止まったチャットに、つながったら「続けて」を送ります。続けて 3 回止まったら、再開するかをチャットの中で聞きます。止まっている間、送信待ちの指示は送らずに止めておきます。"
          checked={settings.auto_resume_on_reconnect}
          onChange={(on) => applySettings({ auto_resume_on_reconnect: on })}
        />
        <ChoiceField<ChatCloseAction>
          label="チャットの ✕ を押したとき"
          help="チャットのタブの × に効きます（選んだらすぐ反映）。毎回聞くときは、表示だけ消す・アーカイブ・削除から選び、「次からはこれにする」でここを変えられます。削除は取り消せないので、既定にしても毎回確かめます。"
          value={closeAction}
          onChange={setCloseAction}
          options={CHAT_CLOSE_ACTIONS.map((value) => ({ value, label: CHAT_CLOSE_ACTION_LABELS[value] }))}
        />
        <ChoiceField<BusyWorkplaceAction>
          label="ほかのチャットが作業中の作業場所で、新しいチャットを始めるとき"
          help="同じ作業場所（本体・ワークツリー）でほかのチャットが作業中のときに、新しいチャットを送ったときの扱いです（選んだらすぐ反映）。毎回聞くときは確かめのダイアログを出し、「次からはこれにする」でここを変えられます。新しいワークツリーで始めるときは、ブランチ名を聞いてから作ります。"
          value={busyAction}
          onChange={setBusyAction}
          options={BUSY_WORKPLACE_ACTIONS.map((value) => ({ value, label: BUSY_WORKPLACE_ACTION_LABELS[value] }))}
        />
        <AiCreateChatField />
        <AiWriteOtherProjectsField />
      </div>
    </section>
  );
}
