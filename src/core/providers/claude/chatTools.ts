import { createSdkMcpServer, tool, type McpSdkServerConfigWithInstance } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { AI_LIST_FAMILY_TOOL, AI_UPDATE_CHAT_TOOL } from "@shared/chat/aiChatEdit";
import { AI_CHILD_CHAT_TOOL } from "@shared/chat/aiChildChat";
import { AI_ADD_DRAFT_TOOL, AI_OPEN_CHAT_TOOL, AI_OPEN_DIFF_TOOL, AI_OPEN_FILE_TOOL, AI_OPEN_MEMO_TOOL, AI_OPEN_SQL_TOOL } from "@shared/chat/aiOpen";
import { AI_ADD_SNIPPET_TOOL, AI_MOVE_MEMO_TOOL } from "@shared/chat/aiProject";
import { AI_LIST_PROJECT_CHATS_TOOL, AI_READ_CHAT_TOOL, AI_USAGE_TOOL } from "@shared/chat/aiRead";
import { AI_LIST_TERMINALS_TOOL, AI_READ_TERMINAL_TOOL } from "@shared/chat/aiTerminal";
import { AI_SHOW_VISUAL_TOOL, AI_UPDATE_VISUAL_TOOL, AI_VISUAL_GUIDE_TOOL } from "@shared/chat/aiVisual";
import { CHAT_TITLE_MAX } from "@shared/types";
import type { AiChatEditTools } from "../../chat/aiChatEdit.js";
import type { AiChatReadTools } from "../../chat/aiChatRead.js";
import type { AiChildChatDecision, AiChildChatTools } from "../../chat/aiChildChat.js";
import type { AiOpenTools } from "../../chat/aiOpen.js";
import type { AiProjectTools } from "../../chat/aiProject.js";
import type { AiTerminalTools } from "../../chat/aiTerminal.js";
import type { AiVisualTools } from "../../chat/aiVisual.js";
import type { ProviderCallbacks } from "../types.js";
import { failure, text } from "./chatToolResult.js";
import { OPEN_INSTRUCTIONS, openTools } from "./chatOpenTools.js";
import { PROJECT_INSTRUCTIONS, projectTools } from "./chatProjectTools.js";
import { READ_INSTRUCTIONS, readTools } from "./chatReadTools.js";
import { TERMINAL_INSTRUCTIONS, terminalTools } from "./chatTerminalTools.js";
import { VISUAL_INSTRUCTIONS, visualTools } from "./chatVisualTools.js";

/** Kickoff のチャットを AI が操作するツールをまとめた MCP サーバーの名前（ツールの名前は mcp__kickoff_chat__…） */
export const CHAT_SERVER = "kickoff_chat";

/** 1 回の実行に渡すチャットのツールの中身（子チャットを作るのは設定と深さで、ターミナルはメインプロセスがないと渡さないことがある。ほかはどのチャットにも渡す） */
export interface ChatTools {
  childChat: AiChildChatTools | null;
  chatEdit: AiChatEditTools | null;
  open: AiOpenTools | null;
  read: AiChatReadTools | null;
  project: AiProjectTools | null;
  terminal: AiTerminalTools | null;
  visual: AiVisualTools | null;
}

/**
 * allowedTools に足す名前（渡すツールだけ）。子チャットの承認（設定が「毎回聞く」のとき）はツールの中で行うので、
 * 権限モードにかかわらず同じに効く（Auto mode でも承認を飛ばさない）。名前・固定・グループは聞かずに変える
 */
export const chatToolNames = (tools: ChatTools) => [
  ...(tools.childChat ? [AI_CHILD_CHAT_TOOL] : []),
  ...(tools.chatEdit ? [AI_LIST_FAMILY_TOOL, AI_UPDATE_CHAT_TOOL] : []),
  ...(tools.open ? [AI_OPEN_MEMO_TOOL, AI_OPEN_CHAT_TOOL, AI_OPEN_FILE_TOOL, AI_OPEN_DIFF_TOOL, AI_OPEN_SQL_TOOL, AI_ADD_DRAFT_TOOL] : []),
  ...(tools.read ? [AI_LIST_PROJECT_CHATS_TOOL, AI_READ_CHAT_TOOL, AI_USAGE_TOOL] : []),
  ...(tools.project ? [AI_ADD_SNIPPET_TOOL, AI_MOVE_MEMO_TOOL] : []),
  ...(tools.terminal ? [AI_LIST_TERMINALS_TOOL, AI_READ_TERMINAL_TOOL] : []),
  ...(tools.visual ? [AI_VISUAL_GUIDE_TOOL, AI_SHOW_VISUAL_TOOL, AI_UPDATE_VISUAL_TOOL] : []),
];

/** 子チャットを作るツールの使い方（MCP の instructions として AI に渡す） */
const CHILD_INSTRUCTIONS = [
  "create_child_chat は、このチャットの子チャット（Kickoff の画面で、このチャットにぶら下がる別のチャット）を作り、最初の依頼を送る。作れるのはこのチャットの子チャットだけ。",
  "利用者が「子チャットを作って」「子チャットで調べて」と頼んだとき、または本筋と別に並行して進めたい寄り道を、利用者と相談のうえで切り出すときに使う。自分で片付く調べものにはサブエージェント（Agent ツール）を使う。",
  "子チャットの答えはこのツールには返らない（作るだけ）。利用者が子チャットを開いて見る。答えを待たずに、いまの作業を続ける。",
  "inherit（既定 true）は、このチャットの会話を引き継ぐか。引き継げるのは、いまの作業より前に終わったところまで。いまの作業で分かったこと・頼む理由は text に書く。",
  "利用者の設定によっては、作る前に利用者に承認を聞く。断られたら、同じ依頼で何度も頼まない。",
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
    ...(tools.childChat ? CHILD_INSTRUCTIONS : []),
    ...(tools.chatEdit ? EDIT_INSTRUCTIONS : []),
    ...(tools.open ? OPEN_INSTRUCTIONS : []),
    ...(tools.read ? READ_INSTRUCTIONS : []),
    ...(tools.project ? PROJECT_INSTRUCTIONS : []),
    ...(tools.terminal ? TERMINAL_INSTRUCTIONS : []),
    ...(tools.visual ? VISUAL_INSTRUCTIONS : []),
  ].join("\n");

/** 利用者の回答を、子チャットを作るかの答えにする（「常に許可」は次から聞かない） */
function toDecision(decision: Awaited<ReturnType<ProviderCallbacks["requestApproval"]>>): AiChildChatDecision {
  if (decision.action === "allow" || decision.action === "allow_always") return { action: decision.action };
  return { action: "deny", message: decision.action === "deny" ? (decision.message ?? null) : null };
}

/** 子チャットを作るツール（設定が「毎回聞く」なら requestApproval で利用者に聞く） */
function childChatTool(childChat: AiChildChatTools, cb: Pick<ProviderCallbacks, "requestApproval">, signal: AbortSignal) {
  return tool(
        "create_child_chat",
        "このチャットの子チャットを作り、最初の依頼を送る（作るだけで、子チャットの答えは返らない）",
        {
          text: z.string().min(1).describe("子チャットに送る最初の依頼（そのまま子チャットの AI への指示になる。頼む理由・前提も書く）"),
          title: z.string().max(CHAT_TITLE_MAX).optional().describe("子チャットの名前（省くと依頼の文から付ける）"),
          inherit: z.boolean().optional().describe("このチャットの会話を引き継ぐか（既定 true）"),
        },
        async (args) => {
          try {
            return text(
              await childChat.create(args, async (request) =>
                toDecision(
                  await cb.requestApproval(
                    {
                      kind: "permission",
                      toolName: AI_CHILD_CHAT_TOOL,
                      input: { ...request },
                      title: request.title ? `子チャット「${request.title}」を作ろうとしています` : "子チャットを作ろうとしています",
                      description: `${request.inherit ? "このチャットの会話を引き継いで" : "会話を引き継がずに"}、下の依頼を送ります。「常に許可」にすると、次からは聞かずに作ります（設定の「チャット」の「AI が子チャットを作るとき」で戻せます）。`,
                      canRemember: true,
                    },
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
  if (!tools.childChat && !tools.chatEdit && !tools.open && !tools.read && !tools.project && !tools.terminal && !tools.visual) return null;
  return createSdkMcpServer({
    name: CHAT_SERVER,
    version: "1.0.0",
    instructions: instructionsFor(tools),
    tools: [
      ...(tools.childChat ? [childChatTool(tools.childChat, cb, signal)] : []),
      ...(tools.chatEdit ? chatEditTools(tools.chatEdit) : []),
      ...(tools.open ? openTools(tools.open) : []),
      ...(tools.read ? readTools(tools.read) : []),
      ...(tools.project ? projectTools(tools.project) : []),
      ...(tools.terminal ? terminalTools(tools.terminal) : []),
      ...(tools.visual ? visualTools(tools.visual) : []),
    ],
  });
}
