import { AI_WRITE_OTHER_PROJECTS_MODE_LABELS, AI_WRITE_MODES, type AiWriteMode } from "@shared/settings/types";
import { AI_WRITE_SETTING_LABELS } from "@shared/chat/aiWritePolicy";
import { applySettings, useAppSettings } from "@/foundation/ui/settings/appSettings";
import { ChoiceField } from "@/foundation/ui/kit/ChoiceField";

/**
 * 設定の「チャット」の「共通のチャットがほかのプロジェクトに書くとき」（毎回聞く / 聞かずに書く / 書かせない。選んだらすぐ保存する）。
 * 承認カードの「常に許可」でも変わるので、いまの設定をそのまま出す。どの設定が効くかの決まりは @shared/chat/aiWritePolicy
 */
export function AiWriteOtherProjectsField() {
  const value = useAppSettings().data?.ai_write_other_projects;
  if (!value) return null;
  return (
    <ChoiceField<AiWriteMode>
      label={AI_WRITE_SETTING_LABELS.ai_write_other_projects}
      help="共通のチャットの AI が、頼まれてプロジェクトにチャットを作って頼む・プロジェクトのチャットの名前 / 固定 / グループを変える・プロジェクトのノートを書く / 動かす・自分をプロジェクトへ移すときの扱いです（選んだらすぐ反映。権限モード・Auto mode によらず効きます）。共通の中と、プロジェクトのチャットが自分のプロジェクトの中で作るときは「AI がチャットを作るとき」に従います。毎回聞くときは承認カードを出し、「常に許可」で「聞かずに書く」に変わります。「AI がチャットを作るとき」が「作らせない」なら、ここによらずプロジェクトにもチャットを作りません。"
      value={value}
      onChange={(next) => applySettings({ ai_write_other_projects: next })}
      options={AI_WRITE_MODES.map((mode) => ({ value: mode, label: AI_WRITE_OTHER_PROJECTS_MODE_LABELS[mode] }))}
    />
  );
}
