// kickoff_chat の組（チャットを AI が操作するツール）の並び（order）。chat のツールは定義ごと家系（aiChatEdit.ts）・開く（open.ts）・読む（read.ts）・消す（remove.ts）、
// まだ持ち主の機能へ移していないもの（作る・ノート・ターミナル・図・ワークツリー・利用者の画面・作業場所）は各機能の chat…Tools.ts。
// 通知の notify_user（order 100）・使用枠の get_usage（ai。order 50）のように、機能が CoreFeature.aiTools で出す組もレジストリが同じ並びに入れる（同じ order ならここの組が先）
import { z } from "zod";
import { defineAiTool, type AiToolDef, type AiToolGroup, type AiTurn } from "@/foundation/core/aiTools/tool";
import { AI_CHAT_RELATION_LABELS, AI_CHAT_RELATIONS, AI_CREATE_CHAT_TOOL } from "@shared/chat/aiCreateChat";
import { CHAT_TITLE_MAX } from "@shared/chat/types";
import { PROVIDER_IDS, PROVIDER_LABELS } from "@shared/settings/types";
import type { ExecutionDeps } from "@/features/chat/core/turn";
import { familyToolGroup } from "./aiChatEdit";
import { readToolGroup } from "./read";
import { removeToolGroup } from "./remove";
import { chatOpenTools } from "./open";
import { canCreateChat, createAiCreateChatTools, type AiCreateChatRequest, type AiCreateChatTools } from "@/features/childChats/core/aiCreateChat";
import { createAiOpenTools } from "./aiOpen";
import { createAiProjectTools } from "./aiProject";
import { createAiTerminalTools } from "@/features/terminal/core/aiTerminal";
import { createAiVisualTools } from "@/features/visuals/core/aiVisual";
import { createAiWorktreeTools } from "@/features/worktrees/core/aiWorktree";
import { createAiUserViewTools } from "@/features/userView/core/aiUserView";
import { createAiWorkplaceTools } from "@/features/workplaceMove/core/aiWorkplace";
import { OPEN_INSTRUCTIONS, openTools } from "./chatOpenTools";
import { PROJECT_INSTRUCTIONS, projectTools } from "./chatProjectTools";
import { TERMINAL_INSTRUCTIONS, terminalTools } from "@/features/terminal/core/chatTerminalTools";
import { VISUAL_INSTRUCTIONS, visualTools } from "@/features/visuals/core/chatVisualTools";
import { WORKTREE_INSTRUCTIONS, worktreeTools } from "@/features/worktrees/core/chatWorktreeTools";
import { USER_VIEW_INSTRUCTIONS, userViewTools } from "@/features/userView/core/chatUserViewTools";
import { WORKPLACE_INSTRUCTIONS, workplaceTools } from "@/features/workplaceMove/core/chatWorkplaceTools";
import { DIAGNOSTIC_INSTRUCTIONS, diagnosticTools } from "@/features/guard/core/chatDiagnosticTools";
import type { AiSandboxDiagnostics } from "@/features/guard/core/sandboxDiagnostics";

/** kickoff_chat の使い方の頭の 1 文 */
export const CHAT_TOOLS_HEAD = "Kickoff（このチャットを動かしているアプリ）のチャットなどを操作するツール。";

/** チャットを作るツールの使い方（MCP の instructions として AI に渡す） */
const CREATE_INSTRUCTIONS = [
  "create_chat は、このプロジェクトに新しいチャットを作り、最初の依頼を送る。relation で作る場所を選ぶ: child = このチャットの子チャット（Kickoff の画面で、このチャットにぶら下がる）、sibling = このチャットと同じ親の子（兄弟チャット。子チャット・孫チャットからだけ）、root = 親のないチャット（サイドバーの一覧に並ぶふつうのチャット。group_id でグループに入れられる）。",
  "使うのは、利用者がチャットの中で頼んだときだけ（「子チャットで」「新しいチャットで」「兄弟チャットを作って」「ワークツリーで子チャットを作って」など）。自分の判断で作業を分けるときは、チャットを作らずに Claude Code のサブエージェント（Agent ツール。書き換えを並行させるならワークツリーの isolation）を使う。",
  "worktree_branch を渡すと、その名前の新しいブランチのワークツリーを、このチャットの作業場所のいまのコミットから作り、作ったチャットはそこで動く（書き換える作業を並行して頼めるように）。このチャットのまだコミットしていない変更は入らない（要るなら先にコミットする）。省けば、child と sibling はこのチャットと同じ作業場所、root はプロジェクトの本体。",
  "作ったチャットの答えはこのツールには返らない（作るだけ）。利用者がそのチャットを開いて見る。答えを待たずに、いまの作業を続ける。",
  "inherit は、このチャットの会話を引き継ぐか（既定は child が引き継ぐ、sibling・root は引き継がない）。引き継げるのは、いまの作業より前に終わったところまで。引き継がないときや、いまの作業で分かったこと・頼む理由は text に書く。",
  "provider は、利用者が別の AI（Codex・Copilot・Cursor など）で頼んだときだけ渡す。違う AI には会話を引き継げないので、経緯と頼む理由は text に書く。",
  "利用者の設定によっては、作る前に利用者に承認を聞く。断られたら、同じ依頼で何度も頼まない。root で作ったチャットはこのチャットの家系の外なので、作ったあと open_chat では開けず、update_chat では名前だけ変えられる。",
];

/** 承認カードの見出しと説明（何を作るか・名前・作業場所・引き継ぐか） */
function approvalText(request: AiCreateChatRequest) {
  const label = AI_CHAT_RELATION_LABELS[request.relation];
  const place = request.group ? `グループ「${request.group}」に入れ、` : "";
  const ai = request.provider ? `AI は ${PROVIDER_LABELS[request.provider]} で、` : "";
  return {
    title: request.title ? `${label}「${request.title}」を作ろうとしています` : `${label}を作ろうとしています`,
    description: `作業場所は${request.workplace}です。${ai}${place}${request.inherit ? "このチャットの会話を引き継いで" : "会話を引き継がずに"}、下の依頼を送ります。「常に許可」にすると、次からは聞かずに作ります（設定の「チャット」の「AI がチャットを作るとき」で戻せます）。`,
  };
}

/**
 * チャットを作るツール（設定が「毎回聞く」なら利用者に聞く）。チャットを作る承認はツールの中で行うので、
 * 権限モードにかかわらず同じに効く（Auto mode でも承認を飛ばさない）
 */
function createChatTool(createChat: AiCreateChatTools): AiToolDef {
  return defineAiTool({
    server: "kickoff_chat",
    name: "create_chat",
    description: "このプロジェクトに新しいチャット（子・兄弟・親のないチャット。ワークツリーでも）を作り、最初の依頼を送る（作るだけで、答えは返らない。利用者が頼んだときだけ使う）",
    input: {
      relation: z.enum(AI_CHAT_RELATIONS).describe("作る場所: child = このチャットの子 / sibling = このチャットと同じ親の子（兄弟） / root = 親のないチャット"),
      text: z.string().min(1).describe("作るチャットに送る最初の依頼（そのまま作ったチャットの AI への指示になる。頼む理由・前提も書く）"),
      title: z.string().max(CHAT_TITLE_MAX).optional().describe("名前（省くと依頼の文から付ける）"),
      group_id: z.number().int().optional().describe("入れるグループの ID（root のときだけ。list_family_chats の groups から）"),
      worktree_branch: z.string().min(1).max(200).optional().describe("新しく作るワークツリーのブランチの名前（省くと、child・sibling はこのチャットと同じ作業場所、root は本体）"),
      inherit: z.boolean().optional().describe("このチャットの会話を引き継ぐか（既定: child は true、sibling・root は false）"),
      provider: z.enum(PROVIDER_IDS).optional().describe("動かす AI（利用者が「Codex で」「Copilot の子チャットで」などと頼んだときだけ。省くとこのチャットと同じ AI。違う AI には会話を引き継げない）"),
    },
    run: (args, turn) => createChat.create(args, (request) => turn.ask({ toolName: AI_CREATE_CHAT_TOOL, input: { ...request }, ...approvalText(request), canRemember: true })),
  });
}

/** kickoff_chat の 1 つの組（open は作業ごとに中身を作り、出さないなら null） */
const chatGroup = (order: number, instructions: readonly string[], open: (turn: AiTurn) => AiToolDef[] | null): AiToolGroup => ({ server: "kickoff_chat", order, instructions, open });

/**
 * 1 回の実行に渡す、チャットを操作するツールの組（order は使い方の文とツールの並び。どれも聞かずに使わせる）。
 * 中身は作業ごとに作り（1 回の作業の上限はその中で数える）、口がないもの（バス・ターミナル・後始末など）は出さない。diagnostics はこの作業の砂場の診断
 */
export function chatToolGroups(deps: ExecutionDeps, diagnostics: AiSandboxDiagnostics | null): AiToolGroup[] {
  const { store } = deps;
  const isBusy = deps.isBusy ?? (() => false);
  return [
    chatGroup(10, DIAGNOSTIC_INSTRUCTIONS, () => (diagnostics ? diagnosticTools(diagnostics) : null)),
    // チャット（子・兄弟・親のないチャット）を作る（設定で止めていない・AI が作った世代の上限に達していないときだけ）
    chatGroup(20, CREATE_INSTRUCTIONS, ({ chatId }) => {
      const chat = store.chats.get(chatId);
      if (!deps.startChat || !chat || !canCreateChat(store, chat)) return null;
      return [createChatTool(createAiCreateChatTools({ store, startChat: deps.startChat, worktreeEnvs: deps.worktreeEnvs }, chatId))];
    }),
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
    // 返答の中に図（SVG・HTML・Mermaid）を描く（画面とスマホが記録から描く）
    chatGroup(80, VISUAL_INSTRUCTIONS, ({ chatId }) => visualTools(createAiVisualTools(store, chatId))),
    // ワークツリーを片付ける（本体のチャットはどのワークツリーでも、ワークツリーのチャットは自分のものだけ。後始末を渡してあるときだけ）
    chatGroup(90, WORKTREE_INSTRUCTIONS, ({ chatId }) => (deps.worktreeFinisher ? worktreeTools(createAiWorktreeTools(deps.worktreeFinisher, chatId)) : null)),
    // 利用者が見ているものを読む（画面の知らせを覚える所があるときだけ）
    chatGroup(110, USER_VIEW_INSTRUCTIONS, ({ chatId }) => (deps.userViews ? userViewTools(createAiUserViewTools({ store, userViews: deps.userViews }, chatId)) : null)),
    // チャットをアーカイブする・消す（同じプロジェクトのチャットを子孫ごと。自分・自分の祖先は作業の終わりに行う予約）
    removeToolGroup(() => deps.chatRemover),
    // 自分のチャットの作業場所を移す予約・取り消し（移せないチャットからは理由の文で断る。Runner が予約の口を渡したときだけ）
    chatGroup(130, WORKPLACE_INSTRUCTIONS, ({ chatId }) => {
      if (!deps.workplaceMoves) return null;
      return workplaceTools(createAiWorkplaceTools({ store, reservations: deps.workplaceMoves, isBusy, worktreeFinisher: deps.worktreeFinisher, terminals: deps.terminals }, chatId));
    }),
  ];
}
