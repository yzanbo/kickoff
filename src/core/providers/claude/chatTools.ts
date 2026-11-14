import { createSdkMcpServer, tool, type McpSdkServerConfigWithInstance } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { AI_LIST_FAMILY_TOOL, AI_UPDATE_CHAT_TOOL } from "@shared/chat/aiChatEdit";
import { AI_CHAT_RELATION_LABELS, AI_CHAT_RELATIONS, AI_CREATE_CHAT_TOOL } from "@shared/chat/aiCreateChat";
import { AI_ADD_DRAFT_TOOL, AI_OPEN_CHAT_TOOL, AI_OPEN_DIFF_TOOL, AI_OPEN_FILE_TOOL, AI_OPEN_MEMO_TOOL, AI_OPEN_SQL_TOOL } from "@shared/chat/aiOpen";
import { AI_ADD_SNIPPET_TOOL, AI_MOVE_MEMO_TOOL } from "@shared/chat/aiProject";
import { AI_LIST_PROJECT_CHATS_TOOL, AI_READ_CHAT_TOOL, AI_USAGE_TOOL } from "@shared/chat/aiRead";
import { AI_LIST_TERMINALS_TOOL, AI_READ_TERMINAL_TOOL } from "@shared/chat/aiTerminal";
import { AI_SHOW_VISUAL_TOOL, AI_UPDATE_VISUAL_TOOL, AI_VISUAL_GUIDE_TOOL } from "@shared/chat/aiVisual";
import { AI_FINISH_WORKTREE_TOOL } from "@shared/chat/aiWorktree";
import { AI_NOTIFY_USER_TOOL } from "@shared/chat/aiNotify";
import { CHAT_TITLE_MAX } from "@shared/types";
import type { AiChatEditTools } from "../../chat/aiChatEdit.js";
import type { AiChatReadTools } from "../../chat/aiChatRead.js";
import type { AiCreateChatDecision, AiCreateChatRequest, AiCreateChatTools } from "../../chat/aiCreateChat.js";
import type { AiOpenTools } from "../../chat/aiOpen.js";
import type { AiProjectTools } from "../../chat/aiProject.js";
import type { AiTerminalTools } from "../../chat/aiTerminal.js";
import type { AiVisualTools } from "../../chat/aiVisual.js";
import type { AiWorktreeTools } from "../../chat/aiWorktree.js";
import type { AiNotifyTools } from "../../chat/aiNotify.js";
import type { ProviderCallbacks } from "../types.js";
import { failure, text } from "./chatToolResult.js";
import { OPEN_INSTRUCTIONS, openTools } from "./chatOpenTools.js";
import { PROJECT_INSTRUCTIONS, projectTools } from "./chatProjectTools.js";
import { READ_INSTRUCTIONS, readTools } from "./chatReadTools.js";
import { TERMINAL_INSTRUCTIONS, terminalTools } from "./chatTerminalTools.js";
import { VISUAL_INSTRUCTIONS, visualTools } from "./chatVisualTools.js";
import { WORKTREE_INSTRUCTIONS, worktreeTools } from "./chatWorktreeTools.js";
import { NOTIFY_INSTRUCTIONS, notifyTools } from "./chatNotifyTools.js";

/** Kickoff のチャットを AI が操作するツールをまとめた MCP サーバーの名前（ツールの名前は mcp__kickoff_chat__…） */
export const CHAT_SERVER = "kickoff_chat";

/** 1 回の実行に渡すチャットのツールの中身（チャットを作るのは設定と世代で、ターミナルはメインプロセスがないと渡さないことがある。ほかはどのチャットにも渡す） */
export interface ChatTools {
  createChat: AiCreateChatTools | null;
  chatEdit: AiChatEditTools | null;
  open: AiOpenTools | null;
  read: AiChatReadTools | null;
  project: AiProjectTools | null;
  terminal: AiTerminalTools | null;
  visual: AiVisualTools | null;
  worktree: AiWorktreeTools | null;
  notify: AiNotifyTools | null;
}

/**
 * allowedTools に足す名前（渡すツールだけ）。チャットを作る承認（設定が「毎回聞く」のとき）はツールの中で行うので、
 * 権限モードにかかわらず同じに効く（Auto mode でも承認を飛ばさない）。名前・固定・グループは聞かずに変える
 */
export const chatToolNames = (tools: ChatTools) => [
  ...(tools.createChat ? [AI_CREATE_CHAT_TOOL] : []),
  ...(tools.chatEdit ? [AI_LIST_FAMILY_TOOL, AI_UPDATE_CHAT_TOOL] : []),
  ...(tools.open ? [AI_OPEN_MEMO_TOOL, AI_OPEN_CHAT_TOOL, AI_OPEN_FILE_TOOL, AI_OPEN_DIFF_TOOL, AI_OPEN_SQL_TOOL, AI_ADD_DRAFT_TOOL] : []),
  ...(tools.read ? [AI_LIST_PROJECT_CHATS_TOOL, AI_READ_CHAT_TOOL, AI_USAGE_TOOL] : []),
  ...(tools.project ? [AI_ADD_SNIPPET_TOOL, AI_MOVE_MEMO_TOOL] : []),
  ...(tools.terminal ? [AI_LIST_TERMINALS_TOOL, AI_READ_TERMINAL_TOOL] : []),
  ...(tools.visual ? [AI_VISUAL_GUIDE_TOOL, AI_SHOW_VISUAL_TOOL, AI_UPDATE_VISUAL_TOOL] : []),
  ...(tools.worktree ? [AI_FINISH_WORKTREE_TOOL] : []),
  ...(tools.notify ? [AI_NOTIFY_USER_TOOL] : []),
];

/** チャットを作るツールの使い方（MCP の instructions として AI に渡す） */
const CREATE_INSTRUCTIONS = [
  "create_chat は、このプロジェクトに新しいチャットを作り、最初の依頼を送る。relation で作る場所を選ぶ: child = このチャットの子チャット（Kickoff の画面で、このチャットにぶら下がる）、sibling = このチャットと同じ親の子（兄弟チャット。子チャット・孫チャットからだけ）、root = 親のないチャット（サイドバーの一覧に並ぶふつうのチャット。group_id でグループに入れられる）。",
  "使うのは、利用者がチャットの中で頼んだときだけ（「子チャットで」「新しいチャットで」「兄弟チャットを作って」「ワークツリーで子チャットを作って」など）。自分の判断で作業を分けるときは、チャットを作らずに Claude Code のサブエージェント（Agent ツール。書き換えを並行させるならワークツリーの isolation）を使う。",
  "worktree_branch を渡すと、その名前の新しいブランチのワークツリーを、このチャットの作業場所のいまのコミットから作り、作ったチャットはそこで動く（書き換える作業を並行して頼めるように）。このチャットのまだコミットしていない変更は入らない（要るなら先にコミットする）。省けば、child と sibling はこのチャットと同じ作業場所、root はプロジェクトの本体。",
  "作ったチャットの答えはこのツールには返らない（作るだけ）。利用者がそのチャットを開いて見る。答えを待たずに、いまの作業を続ける。",
  "inherit は、このチャットの会話を引き継ぐか（既定は child が引き継ぐ、sibling・root は引き継がない）。引き継げるのは、いまの作業より前に終わったところまで。引き継がないときや、いまの作業で分かったこと・頼む理由は text に書く。",
  "利用者の設定によっては、作る前に利用者に承認を聞く。断られたら、同じ依頼で何度も頼まない。root で作ったチャットはこのチャットの家系の外なので、作ったあと open_chat・update_chat では触れない。",
];

/** 名前・固定・グループを変えるツールの使い方 */
const EDIT_INSTRUCTIONS = [
  "list_family_chats は、このチャットと同じ家系のチャット（いちばん上の親チャットから下にぶら下がるチャット: 自分・親・祖父母・兄弟・子・孫など）の一覧（ID・名前・関係・固定・グループ）と、同じプロジェクトのグループの一覧を返す。",
  "update_chat は、同じ家系のチャットの名前（title）・固定（pinned）・グループ（group_id）を、利用者に聞かずに変える（利用者はいつでも戻せる）。chat_id は必ず書く（自分のチャットでも。自分の ID は指示に添えた文脈にある）。兄弟などの ID が分からなければ、先に list_family_chats で確かめる。",
  "省いた項目は変わらない。頼まれた項目だけを渡す。group_id: null はグループから外す。グループは作れず、選べるのは list_family_chats の groups だけ。子チャットはグループに入らない。家系の外のチャットは変えられない。",
  "parent_id は子チャットを親から外す: null で親のないチャット（サイドバーの一覧・グループに並ぶチャット。group_id を一緒に渡せばそのグループへ）、自分の先祖（親の親より上）の ID でその子に上げる。ほかのチャットの下へは付け替えられない。外したら親の下へは戻せないので、利用者に「親から外して」「親のないチャットにして」などと頼まれたときだけ使う。作業中のチャットは外せない。",
  "利用者が「タイトルに【済】を付けて」「このチャットを固定して」のように頼んだときに使う。頼まれていないのに名前などを変えない。",
];

/** 渡すツールに合わせた使い方 */
const instructionsFor = (tools: ChatTools) =>
  [
    "Kickoff（このチャットを動かしているアプリ）のチャットなどを操作するツール。",
    ...(tools.createChat ? CREATE_INSTRUCTIONS : []),
    ...(tools.chatEdit ? EDIT_INSTRUCTIONS : []),
    ...(tools.open ? OPEN_INSTRUCTIONS : []),
    ...(tools.read ? READ_INSTRUCTIONS : []),
    ...(tools.project ? PROJECT_INSTRUCTIONS : []),
    ...(tools.terminal ? TERMINAL_INSTRUCTIONS : []),
    ...(tools.visual ? VISUAL_INSTRUCTIONS : []),
    ...(tools.worktree ? WORKTREE_INSTRUCTIONS : []),
    ...(tools.notify ? NOTIFY_INSTRUCTIONS : []),
  ].join("\n");

/** 利用者の回答を、チャットを作るかの答えにする（「常に許可」は次から聞かない） */
function toDecision(decision: Awaited<ReturnType<ProviderCallbacks["requestApproval"]>>): AiCreateChatDecision {
  if (decision.action === "allow" || decision.action === "allow_always") return { action: decision.action };
  return { action: "deny", message: decision.action === "deny" ? (decision.message ?? null) : null };
}

/** 承認カードの見出しと説明（何を作るか・名前・作業場所・引き継ぐか） */
function approvalText(request: AiCreateChatRequest) {
  const label = AI_CHAT_RELATION_LABELS[request.relation];
  const place = request.group ? `グループ「${request.group}」に入れ、` : "";
  return {
    title: request.title ? `${label}「${request.title}」を作ろうとしています` : `${label}を作ろうとしています`,
    description: `作業場所は${request.workplace}です。${place}${request.inherit ? "このチャットの会話を引き継いで" : "会話を引き継がずに"}、下の依頼を送ります。「常に許可」にすると、次からは聞かずに作ります（設定の「チャット」の「AI がチャットを作るとき」で戻せます）。`,
  };
}

/** チャットを作るツール（設定が「毎回聞く」なら requestApproval で利用者に聞く） */
function createChatTool(createChat: AiCreateChatTools, cb: Pick<ProviderCallbacks, "requestApproval">, signal: AbortSignal) {
  return tool(
    "create_chat",
    "このプロジェクトに新しいチャット（子・兄弟・親のないチャット。ワークツリーでも）を作り、最初の依頼を送る（作るだけで、答えは返らない。利用者が頼んだときだけ使う）",
    {
      relation: z.enum(AI_CHAT_RELATIONS).describe("作る場所: child = このチャットの子 / sibling = このチャットと同じ親の子（兄弟） / root = 親のないチャット"),
      text: z.string().min(1).describe("作るチャットに送る最初の依頼（そのまま作ったチャットの AI への指示になる。頼む理由・前提も書く）"),
      title: z.string().max(CHAT_TITLE_MAX).optional().describe("名前（省くと依頼の文から付ける）"),
      group_id: z.number().int().optional().describe("入れるグループの ID（root のときだけ。list_family_chats の groups から）"),
      worktree_branch: z.string().min(1).max(200).optional().describe("新しく作るワークツリーのブランチの名前（省くと、child・sibling はこのチャットと同じ作業場所、root は本体）"),
      inherit: z.boolean().optional().describe("このチャットの会話を引き継ぐか（既定: child は true、sibling・root は false）"),
    },
    async (args) => {
      try {
        return text(
          await createChat.create(args, async (request) =>
            toDecision(
              await cb.requestApproval(
                { kind: "permission", toolName: AI_CREATE_CHAT_TOOL, input: { ...request }, ...approvalText(request), canRemember: true },
                signal,
              ),
            ),
          ),
        );
      } catch (e) {
        return failure(e);
      }
    },
  );
}

/** 家系のチャットの一覧と、名前・固定・グループを変えるツール（聞かずに変える） */
function chatEditTools(chatEdit: AiChatEditTools) {
  return [
    tool("list_family_chats", "このチャットと同じ家系のチャット（ID・名前・関係・固定・グループ）と、同じプロジェクトのグループの一覧", {}, async () => {
      try {
        return text(chatEdit.listFamily());
      } catch (e) {
        return failure(e);
      }
    }),
    tool(
      "update_chat",
      "同じ家系のチャットの名前・固定・グループを変え、子チャットを親から外す（聞かずに変える。省いた項目は変えない。親から外すのは利用者に頼まれたときだけ）",
      {
        chat_id: z.number().int().describe("変えるチャットの ID（必須。自分のチャットでも書く。分からなければ list_family_chats で確かめる）"),
        title: z.string().min(1).max(CHAT_TITLE_MAX).optional().describe("新しい名前（省くと変えない）"),
        pinned: z.boolean().optional().describe("固定する（true）・外す（false）。省くと変えない"),
        group_id: z.number().int().nullable().optional().describe("入れるグループの ID（list_family_chats の groups から）。null でグループから外す。省くと変えない"),
        parent_id: z
          .number()
          .int()
          .nullable()
          .optional()
          .describe("子チャットを親から外す: null で親のないチャットにする、自分の先祖の ID でその子に上げる。外したら戻せないので、利用者に頼まれたときだけ。省くと変えない"),
      },
      async (args) => {
        try {
          return text(chatEdit.update(args));
        } catch (e) {
          return failure(e);
        }
      },
    ),
  ];
}

/** 1 回の実行に渡す、チャットを操作するツールの MCP サーバー（渡すツールがなければ null） */
export function chatMcpServer(tools: ChatTools, cb: Pick<ProviderCallbacks, "requestApproval">, signal: AbortSignal): McpSdkServerConfigWithInstance | null {
  if (!tools.createChat && !tools.chatEdit && !tools.open && !tools.read && !tools.project && !tools.terminal && !tools.visual && !tools.worktree && !tools.notify) return null;
  return createSdkMcpServer({
    name: CHAT_SERVER,
    version: "1.0.0",
    instructions: instructionsFor(tools),
    tools: [
      ...(tools.createChat ? [createChatTool(tools.createChat, cb, signal)] : []),
      ...(tools.chatEdit ? chatEditTools(tools.chatEdit) : []),
      ...(tools.open ? openTools(tools.open) : []),
      ...(tools.read ? readTools(tools.read) : []),
      ...(tools.project ? projectTools(tools.project) : []),
      ...(tools.terminal ? terminalTools(tools.terminal) : []),
      ...(tools.visual ? visualTools(tools.visual) : []),
      ...(tools.worktree ? worktreeTools(tools.worktree) : []),
      ...(tools.notify ? notifyTools(tools.notify) : []),
    ],
  });
}
