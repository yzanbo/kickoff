import { AI_CREATE_CHAT_MODE_LABELS, AI_CREATE_CHAT_MODES, type AiCreateChatMode } from "@shared/settings/types";
import { applySettings, useAppSettings } from "@/foundation/ui/settings/appSettings";
import { ChoiceField } from "@/foundation/ui/kit/ChoiceField";

/**
 * 設定の「チャット」の「AI がチャットを作るとき」（毎回聞く / 聞かずに作る / 作らせない。選んだらすぐ保存する）。
 * 承認カードの「常に許可」でも変わるので、いまの設定をそのまま出す
 */
export function AiCreateChatField() {
  const value = useAppSettings().data?.ai_create_chat;
  if (!value) return null;
  return (
    <ChoiceField<AiCreateChatMode>
      label="AI がチャットを作るとき"
      help="チャットの AI が、頼まれて子チャット・兄弟チャット・親のないチャット（ワークツリーでも）を作り、依頼を送るときの扱いです（選んだらすぐ反映。権限モード・Auto mode によらず効きます）。作れるのはこのプロジェクトの中だけで、子チャットは孫チャットまで、AI が作ったチャットから作れるのは 2 世代目まで、1 回の作業で 5 つまでです。毎回聞くときは承認カードを出し、「常に許可」で「聞かずに作る」に変わります。作らせないにすると、AI にこのツールを渡しません。"
      value={value}
      onChange={(next) => applySettings({ ai_create_chat: next })}
      options={AI_CREATE_CHAT_MODES.map((mode) => ({ value: mode, label: AI_CREATE_CHAT_MODE_LABELS[mode] }))}
    />
  );
}
