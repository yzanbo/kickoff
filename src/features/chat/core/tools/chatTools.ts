// kickoff_chat の組（チャットを AI が操作するツール）の並び（order）。chat のツールは定義ごと家系（aiChatEdit.ts）・開く（open.ts）・読む（read.ts）・消す（remove.ts）、
// まだ持ち主の機能へ移していないもの（ノート・ターミナル）は各機能の chat…Tools.ts。
// 砂場の診断（guard。order 10）・通知の notify_user（order 100）・使用枠の get_usage（ai。order 50）のように、機能が CoreFeature.aiTools で出す組もレジストリが同じ並びに入れる（同じ order ならここの組が先）
import type { AiToolDef, AiToolGroup, AiTurn } from "@/foundation/core/aiTools/tool";
import type { ExecutionDeps } from "@/features/chat/core/turn";
import { familyToolGroup } from "./aiChatEdit";
import { readToolGroup } from "./read";
import { removeToolGroup } from "./remove";
import { chatOpenTools } from "./open";
import { createAiOpenTools } from "./aiOpen";
import { createAiProjectTools } from "./aiProject";
import { createAiTerminalTools } from "@/features/terminal/core/aiTerminal";
import { OPEN_INSTRUCTIONS, openTools } from "./chatOpenTools";
import { PROJECT_INSTRUCTIONS, projectTools } from "./chatProjectTools";
import { TERMINAL_INSTRUCTIONS, terminalTools } from "@/features/terminal/core/chatTerminalTools";

/** kickoff_chat の使い方の頭の 1 文 */
export const CHAT_TOOLS_HEAD = "Kickoff（このチャットを動かしているアプリ）のチャットなどを操作するツール。";

/** kickoff_chat の 1 つの組（open は作業ごとに中身を作り、出さないなら null） */
const chatGroup = (order: number, instructions: readonly string[], open: (turn: AiTurn) => AiToolDef[] | null): AiToolGroup => ({ server: "kickoff_chat", order, instructions, open });

/**
 * 1 回の実行に渡す、チャットを操作するツールの組（order は使い方の文とツールの並び。どれも聞かずに使わせる）。
 * 中身は作業ごとに作り（1 回の作業の上限はその中で数える）、口がないもの（バス・ターミナル・後始末など）は出さない
 */
export function chatToolGroups(deps: ExecutionDeps): AiToolGroup[] {
  const { store } = deps;
  const isBusy = deps.isBusy ?? (() => false);
  return [
    // 同じ家系のチャットの名前・固定・グループを変える（孫チャット・子チャットを作らせない設定のときも出す）
    familyToolGroup({ store, isBusy }),
    // このプロジェクトのノート・同じ家系のチャットを画面に開く（画面に頼む口（バス）があるときだけ）
    chatGroup(40, OPEN_INSTRUCTIONS, ({ chatId }) => {
      const { bus, noteDirOf, databases } = deps;
      if (!bus) return null;
      const publish = (e: Parameters<typeof bus.publish>[0]) => bus.publish(e);
      return openTools(createAiOpenTools({ store, publish, noteDirOf, dbConnectionsOf: (id) => databases?.stores.dbConnections.list(id) ?? [] }, chatId), chatOpenTools({ store, publish }, chatId));
    }),
    // 同じプロジェクトのチャットの一覧・会話を読む（使用枠の get_usage は ai の組）
    readToolGroup({ store, approvals: deps.approvals, attachments: deps.attachments }),
    // このプロジェクトの定型文に足す・ノートの名前を変える／移す
    chatGroup(60, PROJECT_INSTRUCTIONS, ({ chatId }) => projectTools(createAiProjectTools({ store, notes: deps.notes }, chatId))),
    // このプロジェクトの内蔵ターミナルの出力を読む（メインプロセスが口を渡したときだけ）
    chatGroup(70, TERMINAL_INSTRUCTIONS, ({ chatId }) => (deps.terminals ? terminalTools(createAiTerminalTools({ store, terminals: deps.terminals }, chatId)) : null)),
    // チャットをアーカイブする・消す（同じプロジェクトのチャットを子孫ごと。自分・自分の祖先は作業の終わりに行う予約）
    removeToolGroup(() => deps.chatRemover),
  ];
}
