import { AI_CHILD_CHAT_MODE_LABELS, AI_CHILD_CHAT_MODES, type AiChildChatMode } from "@shared/types";
import { api } from "@/api";
import { settingsStore, useAppSettings } from "@/stores/settings";
import { reportFailure } from "@/ui/dialogs";
import { Field } from "@/ui/Field";
import { Segmented } from "@/ui/Segmented";

/**
 * 設定の「チャット」の「AI が子チャットを作るとき」（毎回聞く / 聞かずに作る / 作らせない。選んだらすぐ保存する）。
 * 承認カードの「常に許可」でも変わるので、下書きにせずいまの設定をそのまま出す
 */
export function AiChildChatField() {
  const value = useAppSettings().data?.ai_child_chat;
  if (!value) return null;
  const change = (next: AiChildChatMode) => {
    void api
      .updateSettings({ ai_child_chat: next })
      .then((saved) => settingsStore.set(saved))
      .catch(reportFailure("設定を保存できませんでした"));
  };
  return (
    <Field
      label="AI が子チャットを作るとき"
      help="チャットの AI が、自分のチャットの子チャットを作って依頼を送るときの扱いです（選んだらすぐ反映。権限モード・Auto mode によらず効きます）。作れるのは自分のチャットの子チャットだけで、孫チャットより深くは作りません。毎回聞くときは承認カードを出し、「常に許可」で「聞かずに作る」に変わります。作らせないにすると、AI にこのツールを渡しません。"
    >
      <Segmented<AiChildChatMode>
        className="segmented theme-switch"
        label="AI が子チャットを作るとき"
        value={value}
        onChange={change}
        options={AI_CHILD_CHAT_MODES.map((mode) => ({ value: mode, label: AI_CHILD_CHAT_MODE_LABELS[mode] }))}
      />
    </Field>
  );
}
