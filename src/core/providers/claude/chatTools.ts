import { createSdkMcpServer, tool, type McpSdkServerConfigWithInstance } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { AI_CHILD_CHAT_TOOL } from "@shared/chat/aiChildChat";
import { errorMessage } from "@shared/errors";
import type { AiChildChatDecision, AiChildChatTools } from "../../chat/aiChildChat.js";
import type { ProviderCallbacks } from "../types.js";

/** Kickoff のチャットを AI が操作するツールをまとめた MCP サーバーの名前（ツールの名前は mcp__kickoff_chat__…） */
export const CHAT_SERVER = "kickoff_chat";

/**
 * allowedTools に足す名前。承認（設定が「毎回聞く」のとき）はツールの中で行うので、
 * 権限モードにかかわらず同じに効く（Auto mode でも承認を飛ばさない）
 */
export const chatToolNames = () => [AI_CHILD_CHAT_TOOL];

/** このツールの使い方（MCP の instructions として AI に渡す） */
const INSTRUCTIONS = [
  "Kickoff（このチャットを動かしているアプリ）のチャットを操作するツール。",
  "create_child_chat は、このチャットの子チャット（Kickoff の画面で、このチャットにぶら下がる別のチャット）を作り、最初の依頼を送る。作れるのはこのチャットの子チャットだけ。",
  "利用者が「子チャットを作って」「子チャットで調べて」と頼んだとき、または本筋と別に並行して進めたい寄り道を、利用者と相談のうえで切り出すときに使う。自分で片付く調べものにはサブエージェント（Agent ツール）を使う。",
  "子チャットの答えはこのツールには返らない（作るだけ）。利用者が子チャットを開いて見る。答えを待たずに、いまの作業を続ける。",
  "inherit（既定 true）は、このチャットの会話を引き継ぐか。引き継げるのは、いまの作業より前に終わったところまで。いまの作業で分かったこと・頼む理由は text に書く。",
  "利用者の設定によっては、作る前に利用者に承認を聞く。断られたら、同じ依頼で何度も頼まない。",
].join("\n");

const text = (s: string) => ({ content: [{ type: "text" as const, text: s }] });
const failure = (e: unknown) => ({ content: [{ type: "text" as const, text: errorMessage(e) }], isError: true });

/** 利用者の回答を、子チャットを作るかの答えにする（「常に許可」は次から聞かない） */
function toDecision(decision: Awaited<ReturnType<ProviderCallbacks["requestApproval"]>>): AiChildChatDecision {
  if (decision.action === "allow" || decision.action === "allow_always") return { action: decision.action };
  return { action: "deny", message: decision.action === "deny" ? (decision.message ?? null) : null };
}

/** 1 回の実行に渡す、チャットを操作するツールの MCP サーバー（設定が「毎回聞く」なら requestApproval で利用者に聞く） */
export function chatMcpServer(tools: AiChildChatTools, cb: Pick<ProviderCallbacks, "requestApproval">, signal: AbortSignal): McpSdkServerConfigWithInstance {
  return createSdkMcpServer({
    name: CHAT_SERVER,
    version: "1.0.0",
    instructions: INSTRUCTIONS,
    tools: [
      tool(
        "create_child_chat",
        "このチャットの子チャットを作り、最初の依頼を送る（作るだけで、子チャットの答えは返らない）",
        {
          text: z.string().min(1).describe("子チャットに送る最初の依頼（そのまま子チャットの AI への指示になる。頼む理由・前提も書く）"),
          title: z.string().max(100).optional().describe("子チャットの名前（省くと依頼の文から付ける）"),
          inherit: z.boolean().optional().describe("このチャットの会話を引き継ぐか（既定 true）"),
        },
        async (args) => {
          try {
            return text(
              await tools.create(args, async (request) =>
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
      ),
    ],
  });
}
