// チャットの実行の殻（run/）が使う、上の機能（AI の切り替え・作業場所の移動）の中身を 1 か所から渡す仮の口。
// 殻のどのファイルも上の機能を直に読まず、ここだけを読む（上の機能を読む辺をこのファイルに閉じ込める）。
// 上の機能が withIdleChat を呼ぶ形（P5-5e・f）に替えたら消す
export { prepareAndCommitProviderSwitch, retryProviderHandoffPreparation } from "@/features/providerSwitch/core/providerSwitch";
export { moveChatWorkplace, type WorkplaceMoveInput, type WorkplaceMoveSteps } from "@/features/workplaceMove/core/workplaceMove";
