// チャットの実行の殻（run/）が使う、上の機能（圧縮・AI の切り替え・作業場所の移動）の中身を 1 か所から渡す仮の口。
// 殻のどのファイルも上の機能を直に読まず、ここだけを読む（上の機能を読む辺をこのファイルに閉じ込める）。
// 上の機能が実行に足すものを登録する形（P5-4 の TurnContributor・P5-5 の withIdleChat・reserveAtTurnEnd）に替えたら消す
export { preCompactPromptOf } from "@/features/compact/core/preCompact";
export { prepareAndCommitProviderSwitch, retryProviderHandoffPreparation } from "@/features/providerSwitch/core/providerSwitch";
export { moveChatWorkplace, type WorkplaceMoveInput, type WorkplaceMoveSteps } from "@/features/workplaceMove/core/workplaceMove";
export { WorkplaceReservations, cancelledNote, notMovedNotice, runReservedMove, type WorkplaceMovePlan } from "@/features/workplaceMove/core/workplaceReservation";
