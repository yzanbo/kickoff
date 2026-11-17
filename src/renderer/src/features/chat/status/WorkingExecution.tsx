import { EFFORT_LABELS, PERMISSION_LABELS, PROVIDER_LABELS, type Chat, type ChatEvent, type EffortLevel, type PermissionMode } from "@shared/types";
import { useModels } from "@/stores/providers";
import { modelDisplayName } from "@/features/chat/options/models";
import { ProviderIcon } from "@/features/chat/provider/ProviderIcon";
import { workingExecutionOf, type WorkingExecutionOptions } from "./executionSettings";

/** 作業中の行に、いまの実行に使われた選択を添える（入力欄の次回の選択とは分ける）。 */
export function WorkingExecution({ chat, events }: { chat: Chat; events: readonly ChatEvent[] }) {
  const models = useModels(chat.provider);
  const execution = workingExecutionOf(chat, events);
  const model = execution.model ? modelDisplayName(models, execution.model) : "既定";
  return <WorkingExecutionBadges execution={execution} model={model} />;
}

/** モデル一覧がまだない場合もモデル ID のまま出し、既定で実際の値が不明なら推測しない。 */
export function WorkingExecutionBadges({ execution, model }: { execution: WorkingExecutionOptions; model: string }) {
  const effort = execution.effort ? (EFFORT_LABELS[execution.effort as EffortLevel] ?? execution.effort) : "既定";
  const permission = PERMISSION_LABELS[execution.permission as PermissionMode] ?? execution.permission;
  return (
    <span className="working-execution" role="group" aria-label="今回の実行設定">
      <span className="working-execution-item" title="AI">
        <ProviderIcon provider={execution.provider} size={12} /> {PROVIDER_LABELS[execution.provider]}
      </span>
      <span className="working-execution-item" title={execution.model ? `モデル: ${execution.model}（プロバイダーの通知または送信時の指定）` : "モデル: プロバイダーの既定（実際のモデルは未通知）"}>モデル: {model}</span>
      <span className="working-execution-item" title={execution.effort ? `推論の深さ: ${effort}（プロバイダーの通知または送信時の指定）` : "推論の深さ: 既定（実際の値は未通知）"}>推論: {effort}</span>
      <span className="working-execution-item" title={`権限モード: ${permission}`}>権限: {permission}</span>
      <span className="working-execution-item" title="ファストモードの指定。実際に適用されたかは作業中に分からないことがあります">
        {execution.fastRequested ? "Fast 指定" : "Fast 指定なし"}
      </span>
    </span>
  );
}
