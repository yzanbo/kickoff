// kickoff_chat の組（チャットを AI が操作するツール）の並び（order）。chat のツールは定義ごと家系（aiChatEdit.ts）・開く（open.ts）・読む（read.ts）・消す（remove.ts）、
// 画面に頼む組は chatOpenTools.ts。
// 砂場の診断（guard。order 10）・開く組のノート 40・共通のチャットのノートの場所 41・ファイル 42・差分 43・SQL 45・定型文 60・ノートを動かす 61・ターミナル 70・通知の notify_user（order 100）・使用枠の get_usage（ai。order 50）のように、機能が CoreFeature.aiTools で出す組もレジストリが同じ並びに入れる（同じ order ならここの組が先）
import type { AiToolGroup } from "@/foundation/core/aiTools/tool";
import type { Bus } from "@/foundation/core/bus";
import type { ApprovalCenter } from "@/features/chat/core/approvals";
import type { ChatAttachments, ChatDetachPort } from "@/features/chat/core/ports";
import type { ChatStoreDeps } from "@/features/chat/core/stores";
import type { ChatRemover } from "./aiChatRemove";
import { commonFamilyToolGroup, familyToolGroup } from "./aiChatEdit";
import { commonReadToolGroup, readToolGroup } from "./read";
import { removeToolGroup } from "./remove";
import { chatOpenToolGroups } from "./chatOpenTools";

/** kickoff_chat の使い方の頭の 1 文 */
export const CHAT_TOOLS_HEAD = "Kickoff（このチャットを動かしているアプリ）のチャットなどを操作するツール。";

/**
 * 1 回の実行に渡す、チャットを操作するツールの組（order は使い方の文とツールの並び。どれも聞かずに使わせる）。
 * 中身は作業ごとに作り（1 回の作業の上限はその中で数える）、口がないもの（バス・ターミナル・後始末など）は出さない
 */
export function chatToolGroups(deps: { store: Pick<ChatStoreDeps, "chats" | "events" | "settings" | "projects" | "groups">; approvals: ApprovalCenter; bus?: Bus; attachments?: ChatAttachments; detach?: ChatDetachPort; chatRemover?: ChatRemover }): AiToolGroup[] {
  const { store } = deps;
  return [
    // 同じ家系のチャットの名前・固定・グループを変え、子チャットを親から外す（孫チャット・子チャットを作らせない設定のときも出す）
    familyToolGroup({ store, detach: deps.detach }),
    // 共通のチャットにだけ、ほかのプロジェクトのチャットを変える使い方を足す
    commonFamilyToolGroup({ store }),
    // 同じ家系のチャットを画面に開く・下書きを入れる（画面に頼む口（バス）があるときだけ）
    ...chatOpenToolGroups({ store, publish: deps.bus ? (e) => deps.bus!.publish(e) : null }),
    // 同じプロジェクトのチャットの一覧・会話を読む（使用枠の get_usage は ai の組）
    readToolGroup({ store, approvals: deps.approvals, attachments: deps.attachments }),
    // 共通のチャットにだけ、ほかのプロジェクトのチャットを読む使い方を足す
    commonReadToolGroup({ store }),
    // チャットをアーカイブする・消す（同じプロジェクトのチャットを子孫ごと。自分・自分の祖先は作業の終わりに行う予約）
    removeToolGroup(() => deps.chatRemover),
  ];
}
