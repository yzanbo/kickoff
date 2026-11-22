// 子チャットが実行に足すもの: AI のツール create_chat（kickoff_chat の order 20。中身は aiCreateChat.ts）と、
// 家系の文脈（このチャットの名前と親チャットなど。contributor "childChats"・turnContext の order 10）
import { z } from "zod";
import { defineAiTool, type AiToolDef, type AiToolGroup } from "@/foundation/core/aiTools/tool";
import { AI_CHAT_RELATION_LABELS, AI_CHAT_RELATIONS, AI_CREATE_CHAT_TOOL } from "@shared/chat/aiCreateChat";
import { CHAT_TITLE_MAX } from "@shared/chat/types";
import { PROVIDER_IDS, PROVIDER_LABELS } from "@shared/settings/types";
import type { TurnContributor, ChatStoreDeps } from "@/features/chat/core/index";
import { canCreateChat, createAiCreateChatTools, type AiCreateChatDeps, type AiCreateChatRequest, type AiCreateChatTools } from "./aiCreateChat";
import { chatContextNote, chatContextOf } from "./context";

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

/**
 * チャット（子・兄弟・親のないチャット）を作るツールの組（設定で止めていない・AI が作った世代の上限に達していないときだけ出す）
 */
export function createChatToolGroup(deps: AiCreateChatDeps): AiToolGroup {
  return {
    server: "kickoff_chat",
    order: 20,
    instructions: CREATE_INSTRUCTIONS,
    open: ({ chatId }) => {
      const chat = deps.store.chats.get(chatId);
      if (!chat || !canCreateChat(deps.store, chat)) return null;
      return [createChatTool(createAiCreateChatTools(deps, chatId))];
    },
  };
}

/** 指示に添える家系の文脈（送るたびに。移動の知らせ・一度だけ添える知らせより前） */
export function childChatTurnParts(store: Pick<ChatStoreDeps, "chats" | "events" | "settings" | "projects" | "snippets">): TurnContributor {
  return { name: "childChats", order: 10, contribute: ({ chat }) => ({ turnContext: chatContextNote(chatContextOf(store, chat)) }) };
}
