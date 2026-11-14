import { AI_CREATE_CHAT_MODE_LABELS, AI_CREATE_CHAT_MODES, type AiCreateChatMode } from "@shared/types";
import { api } from "@/api";
import { settingsStore, useAppSettings } from "@/stores/settings";
import { reportFailure } from "@/ui/dialogs";
import { Field } from "@/ui/Field";
import { Segmented } from "@/ui/Segmented";

/**
 * 設定の「チャット」の「AI がチャットを作るとき」（毎回聞く / 聞かずに作る / 作らせない。選んだらすぐ保存する）。
 * 承認カードの「常に許可」でも変わるので、下書きにせずいまの設定をそのまま出す
 */
export function AiCreateChatField() {
  const value = useAppSettings().data?.ai_create_chat;
  if (!value) return null;
  const change = (next: AiCreateChatMode) => {
    void api
      .updateSettings({ ai_create_chat: next })
      .then((saved) => settingsStore.set(saved))
      .catch(reportFailure("設定を保存できませんでした"));
  };
  return (
    <Field
      label="AI がチャットを作るとき"
      help="チャットの AI が、頼まれて子チャット・兄弟チャット・親のないチャット（ワークツリーでも）を作り、依頼を送るときの扱いです（選んだらすぐ反映。権限モード・Auto mode によらず効きます）。作れるのはこのプロジェクトの中だけで、子チャットは孫チャットまで、AI が作ったチャットから作れるのは 2 世代目まで、1 回の作業で 5 つまでです。毎回聞くときは承認カードを出し、「常に許可」で「聞かずに作る」に変わります。作らせないにすると、AI にこのツールを渡しません。"
    >
      <Segmented<AiCreateChatMode>
        className="segmented theme-switch"
        label="AI がチャットを作るとき"
        value={value}
        onChange={change}
        options={AI_CREATE_CHAT_MODES.map((mode) => ({ value: mode, label: AI_CREATE_CHAT_MODE_LABELS[mode] }))}
      />
    </Field>
  );
}
