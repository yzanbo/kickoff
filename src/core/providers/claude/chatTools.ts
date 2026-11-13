import { createSdkMcpServer, tool, type McpSdkServerConfigWithInstance } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { AI_LIST_FAMILY_TOOL, AI_UPDATE_CHAT_TOOL } from "@shared/chat/aiChatEdit";
import { AI_CHILD_CHAT_TOOL } from "@shared/chat/aiChildChat";
import { AI_OPEN_CHAT_TOOL, AI_OPEN_MEMO_TOOL } from "@shared/chat/aiOpen";
import { errorMessage } from "@shared/errors";
import { CHAT_TITLE_MAX, OPEN_PLACES } from "@shared/types";
import type { AiChatEditTools } from "../../chat/aiChatEdit.js";
import type { AiChildChatDecision, AiChildChatTools } from "../../chat/aiChildChat.js";
import type { AiOpenTools } from "../../chat/aiOpen.js";
import type { ProviderCallbacks } from "../types.js";

/** Kickoff のチャットを AI が操作するツールをまとめた MCP サーバーの名前（ツールの名前は mcp__kickoff_chat__…） */
export const CHAT_SERVER = "kickoff_chat";

/** 1 回の実行に渡すチャットのツールの中身（子チャットを作るのは設定と深さで渡さないことがある。名前・固定・グループと開くのはどのチャットにも渡す） */
export interface ChatTools {
  childChat: AiChildChatTools | null;
  chatEdit: AiChatEditTools | null;
  open: AiOpenTools | null;
}

/**
 * allowedTools に足す名前（渡すツールだけ）。子チャットの承認（設定が「毎回聞く」のとき）はツールの中で行うので、
 * 権限モードにかかわらず同じに効く（Auto mode でも承認を飛ばさない）。名前・固定・グループは聞かずに変える
 */
export const chatToolNames = (tools: ChatTools) => [
  ...(tools.childChat ? [AI_CHILD_CHAT_TOOL] : []),
  ...(tools.chatEdit ? [AI_LIST_FAMILY_TOOL, AI_UPDATE_CHAT_TOOL] : []),
  ...(tools.open ? [AI_OPEN_MEMO_TOOL, AI_OPEN_CHAT_TOOL] : []),
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
  "利用者が「タイトルに【済】を付けて」「このチャットを固定して」のように頼んだときに使う。頼まれていないのに名前などを変えない。",
];

/** メモ・家系のチャットを開くツールの使い方 */
const OPEN_INSTRUCTIONS = [
  "open_memo は、このプロジェクトのメモ（メモのフォルダの .md・.html）を Kickoff の画面に開く。path はメモのフォルダからの相対パスか、メモのフォルダの中の絶対パス。",
  "open_chat は、このチャットと同じ家系のチャット（list_family_chats の一覧）を Kickoff の画面に開く。子チャット・孫チャットは右の欄か別ウィンドウ、いちばん上の親チャットはチャットのパネルに開く。",
  "place は side（いちばん上の親チャットの画面の右の欄。子チャットの中からでも親の右の欄に開く）か window（別ウィンドウ）。利用者が「右で」「右の欄で」「サイドで」と言ったら side、「別ウィンドウで」「新しいウィンドウで」と言ったら window。場所を言われなければ省く（利用者の設定の開き方になる）。",
  "どちらも開くだけで何も変えないので、聞かずに開く。利用者が「開いて」「見せて」と頼んだときに使い、頼まれていないのに開かない。開けたかは返らない（画面に頼むだけ）。",
];

/** 渡すツールに合わせた使い方 */
const instructionsFor = (tools: ChatTools) =>
  [
    "Kickoff（このチャットを動かしているアプリ）のチャットを操作するツール。",
    ...(tools.childChat ? CHILD_INSTRUCTIONS : []),
    ...(tools.chatEdit ? EDIT_INSTRUCTIONS : []),
    ...(tools.open ? OPEN_INSTRUCTIONS : []),
  ].join("\n");

const text = (s: string) => ({ content: [{ type: "text" as const, text: s }] });
const failure = (e: unknown) => ({ content: [{ type: "text" as const, text: errorMessage(e) }], isError: true });

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
      "同じ家系のチャットの名前・固定・グループを変える（聞かずに変える。省いた項目は変えない）",
      {
        chat_id: z.number().int().describe("変えるチャットの ID（必須。自分のチャットでも書く。分からなければ list_family_chats で確かめる）"),
        title: z.string().min(1).max(CHAT_TITLE_MAX).optional().describe("新しい名前（省くと変えない）"),
        pinned: z.boolean().optional().describe("固定する（true）・外す（false）。省くと変えない"),
        group_id: z.number().int().nullable().optional().describe("入れるグループの ID（list_family_chats の groups から）。null でグループから外す。省くと変えない"),
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

/** メモ・家系のチャットを開くツール（聞かずに画面に頼む） */
function openTools(open: AiOpenTools) {
  const place = z.enum(OPEN_PLACES).optional().describe("side = 右の欄（いちばん上の親チャットの画面）/ window = 別ウィンドウ。利用者が場所を言わなければ省く（設定の開き方）");
  return [
    tool(
      "open_memo",
      "このプロジェクトのメモを Kickoff の画面（右の欄・別ウィンドウ）に開く（開くだけ）",
      { path: z.string().min(1).describe("メモのフォルダからの相対パス（「機能の仕様/図.html」）か、メモのフォルダの中の絶対パス"), place },
      async (args) => {
        try {
          return text(await open.openMemo(args));
        } catch (e) {
          return failure(e);
        }
      },
    ),
    tool(
      "open_chat",
      "同じ家系のチャット（子チャット・孫チャット・親など）を Kickoff の画面に開く（開くだけ）",
      { chat_id: z.number().int().describe("開くチャットの ID（分からなければ list_family_chats で確かめる）"), place },
      async (args) => {
        try {
          return text(open.openChat(args));
        } catch (e) {
          return failure(e);
        }
      },
    ),
  ];
}

/** 1 回の実行に渡す、チャットを操作するツールの MCP サーバー（渡すツールがなければ null） */
export function chatMcpServer(tools: ChatTools, cb: Pick<ProviderCallbacks, "requestApproval">, signal: AbortSignal): McpSdkServerConfigWithInstance | null {
  if (!tools.childChat && !tools.chatEdit && !tools.open) return null;
  return createSdkMcpServer({
    name: CHAT_SERVER,
    version: "1.0.0",
    instructions: instructionsFor(tools),
    tools: [
      ...(tools.childChat ? [childChatTool(tools.childChat, cb, signal)] : []),
      ...(tools.chatEdit ? chatEditTools(tools.chatEdit) : []),
      ...(tools.open ? openTools(tools.open) : []),
    ],
  });
}
