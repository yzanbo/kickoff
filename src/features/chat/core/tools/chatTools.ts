import { z } from "zod";
import { defineTool as tool, type ToolServer } from "@/foundation/core/aiTools/tool";
import { AI_LIST_FAMILY_TOOL, AI_UPDATE_CHAT_TOOL } from "@shared/chat/aiChatEdit";
import { AI_CHAT_RELATION_LABELS, AI_CHAT_RELATIONS, AI_CREATE_CHAT_TOOL } from "@shared/chat/aiCreateChat";
import { AI_ADD_DRAFT_TOOL, AI_OPEN_CHAT_TOOL, AI_OPEN_DIFF_TOOL, AI_OPEN_FILE_TOOL, AI_OPEN_NOTE_TOOL, AI_OPEN_SQL_TOOL } from "@shared/chat/aiOpen";
import { AI_ADD_SNIPPET_TOOL, AI_MOVE_NOTE_TOOL } from "@shared/chat/aiProject";
import { AI_LIST_PROJECT_CHATS_TOOL, AI_READ_CHAT_TOOL, AI_USAGE_TOOL } from "@shared/chat/aiRead";
import { AI_LIST_TERMINALS_TOOL, AI_READ_TERMINAL_TOOL } from "@shared/terminal/aiTerminal";
import { AI_SHOW_VISUAL_TOOL, AI_UPDATE_VISUAL_TOOL, AI_VISUAL_GUIDE_TOOL } from "@shared/visuals/aiVisual";
import { AI_FINISH_WORKTREE_TOOL } from "@shared/worktrees/aiWorktree";
import { AI_NOTIFY_USER_TOOL } from "@shared/notifications/tools";
import { AI_GET_USER_VIEW_TOOL } from "@shared/userView/tools";
import { AI_ARCHIVE_CHAT_TOOL, AI_DELETE_CHAT_TOOL } from "@shared/chat/aiChatRemove";
import { AI_CANCEL_WORKPLACE_MOVE_TOOL, AI_MOVE_WORKPLACE_TOOL } from "@shared/workplaceMove/aiWorkplace";
import { CHAT_TITLE_MAX, PROVIDER_IDS, PROVIDER_LABELS } from "@shared/types";
import type { AiChatEditTools } from "./aiChatEdit";
import type { AiChatReadTools } from "./aiChatRead";
import type { AiCreateChatDecision, AiCreateChatRequest, AiCreateChatTools } from "@/features/childChats/core/aiCreateChat";
import type { AiOpenTools } from "./aiOpen";
import type { AiProjectTools } from "./aiProject";
import type { AiTerminalTools } from "@/features/terminal/core/aiTerminal";
import type { AiVisualTools } from "@/features/visuals/core/aiVisual";
import type { AiWorktreeTools } from "@/features/worktrees/core/aiWorktree";
import type { AiNotifyTools } from "@/features/notifications/core/aiNotify";
import type { AiUserViewTools } from "@/features/userView/core/aiUserView";
import type { AiChatRemoveTools } from "./aiChatRemove";
import type { AiWorkplaceTools } from "@/features/workplaceMove/core/aiWorkplace";
import type { ProviderCallbacks } from "@/features/ai/core/providers/types";
import { failure, text } from "@/foundation/core/aiTools/chatToolResult";
import { OPEN_INSTRUCTIONS, openTools } from "./chatOpenTools";
import { PROJECT_INSTRUCTIONS, projectTools } from "./chatProjectTools";
import { READ_INSTRUCTIONS, readTools } from "./chatReadTools";
import { TERMINAL_INSTRUCTIONS, terminalTools } from "@/features/terminal/core/chatTerminalTools";
import { VISUAL_INSTRUCTIONS, visualTools } from "@/features/visuals/core/chatVisualTools";
import { WORKTREE_INSTRUCTIONS, worktreeTools } from "@/features/worktrees/core/chatWorktreeTools";
import { NOTIFY_INSTRUCTIONS, notifyTools } from "@/features/notifications/core/chatNotifyTools";
import { USER_VIEW_INSTRUCTIONS, userViewTools } from "@/features/userView/core/chatUserViewTools";
import { REMOVE_INSTRUCTIONS, removeTools } from "./chatRemoveTools";
import { WORKPLACE_INSTRUCTIONS, workplaceTools } from "@/features/workplaceMove/core/chatWorkplaceTools";
import { DIAGNOSTIC_INSTRUCTIONS, diagnosticTools } from "@/features/guard/core/chatDiagnosticTools";
import type { AiSandboxDiagnostics } from "@/features/guard/core/sandboxDiagnostics";
import { AI_START_SANDBOX_DIAGNOSTICS_TOOL, AI_READ_SANDBOX_DENIALS_TOOL } from "@shared/guard/aiSandboxDiagnostics";

/** Kickoff のチャットを AI が操作するツールをまとめた MCP サーバーの名前（ツールの名前は mcp__kickoff_chat__…） */
const CHAT_SERVER = "kickoff_chat";

/** 1 回の実行に渡すチャットのツールの中身（チャットを作るのは設定と世代で、ターミナルはメインプロセスがないと渡さないことがある。ほかはどのチャットにも渡す） */
export interface ChatTools {
  diagnostics?: AiSandboxDiagnostics | null;
  createChat: AiCreateChatTools | null;
  chatEdit: AiChatEditTools | null;
  open: AiOpenTools | null;
  read: AiChatReadTools | null;
  project: AiProjectTools | null;
  terminal: AiTerminalTools | null;
  visual: AiVisualTools | null;
  worktree: AiWorktreeTools | null;
  notify: AiNotifyTools | null;
  userView: AiUserViewTools | null;
  remove: AiChatRemoveTools | null;
  workplace: AiWorkplaceTools | null;
}

/**
 * 聞かずに使わせるツールの名前（渡すツールだけ）。チャットを作る承認（設定が「毎回聞く」のとき）はツールの中で行うので、
 * 権限モードにかかわらず同じに効く（Auto mode でも承認を飛ばさない）。名前・固定・グループは聞かずに変える
 */
const chatToolNames = (tools: ChatTools) => [
  ...(tools.diagnostics ? [AI_START_SANDBOX_DIAGNOSTICS_TOOL, AI_READ_SANDBOX_DENIALS_TOOL] : []),
  ...(tools.createChat ? [AI_CREATE_CHAT_TOOL] : []),
  ...(tools.chatEdit ? [AI_LIST_FAMILY_TOOL, AI_UPDATE_CHAT_TOOL] : []),
  ...(tools.open ? [AI_OPEN_NOTE_TOOL, AI_OPEN_CHAT_TOOL, AI_OPEN_FILE_TOOL, AI_OPEN_DIFF_TOOL, AI_OPEN_SQL_TOOL, AI_ADD_DRAFT_TOOL] : []),
  ...(tools.read ? [AI_LIST_PROJECT_CHATS_TOOL, AI_READ_CHAT_TOOL, AI_USAGE_TOOL] : []),
  ...(tools.project ? [AI_ADD_SNIPPET_TOOL, AI_MOVE_NOTE_TOOL] : []),
  ...(tools.terminal ? [AI_LIST_TERMINALS_TOOL, AI_READ_TERMINAL_TOOL] : []),
  ...(tools.visual ? [AI_VISUAL_GUIDE_TOOL, AI_SHOW_VISUAL_TOOL, AI_UPDATE_VISUAL_TOOL] : []),
  ...(tools.worktree ? [AI_FINISH_WORKTREE_TOOL] : []),
  ...(tools.notify ? [AI_NOTIFY_USER_TOOL] : []),
  ...(tools.userView ? [AI_GET_USER_VIEW_TOOL] : []),
  ...(tools.remove ? [AI_ARCHIVE_CHAT_TOOL, AI_DELETE_CHAT_TOOL] : []),
  ...(tools.workplace ? [AI_MOVE_WORKPLACE_TOOL, AI_CANCEL_WORKPLACE_MOVE_TOOL] : []),
];

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

/** 名前・固定・グループを変えるツールの使い方 */
const EDIT_INSTRUCTIONS = [
  "list_family_chats は、このチャットと同じ家系のチャット（いちばん上の親チャットから下にぶら下がるチャット: 自分・親・祖父母・兄弟・子・孫など）の一覧（ID・名前・関係・固定・グループ）と、同じプロジェクトのグループの一覧を返す。",
  "update_chat は、同じ家系のチャットの名前（title）・固定（pinned）・グループ（group_id）を、利用者に聞かずに変える（利用者はいつでも戻せる）。名前（title）だけは、家系の外でも同じプロジェクトのチャットなら変えられる。chat_id は必ず書く（自分のチャットでも。自分の ID は指示に添えた文脈にある）。兄弟などの ID が分からなければ、先に list_family_chats（家系の外は list_project_chats）で確かめる。",
  "省いた項目は変わらない。頼まれた項目だけを渡す。group_id: null はグループから外す。グループは作れず、選べるのは list_family_chats の groups だけ。子チャットはグループに入らない。家系の外のチャットは名前しか変えられない（固定・グループ・親から外すは断る）。",
  "parent_id は子チャットを親から外す: null で親のないチャット（サイドバーの一覧・グループに並ぶチャット。group_id を一緒に渡せばそのグループへ）、自分の先祖（親の親より上）の ID でその子に上げる。ほかのチャットの下へは付け替えられない。外したら親の下へは戻せないので、利用者に「親から外して」「親のないチャットにして」などと頼まれたときだけ使う。作業中のチャットは外せない。",
  "利用者が「タイトルに【済】を付けて」「このチャットを固定して」のように頼んだときに使う。頼まれていないのに名前などを変えない。",
];

/** 渡すツールに合わせた使い方 */
const instructionsFor = (tools: ChatTools) =>
  [
    "Kickoff（このチャットを動かしているアプリ）のチャットなどを操作するツール。",
    ...(tools.diagnostics ? DIAGNOSTIC_INSTRUCTIONS : []),
    ...(tools.createChat ? CREATE_INSTRUCTIONS : []),
    ...(tools.chatEdit ? EDIT_INSTRUCTIONS : []),
    ...(tools.open ? OPEN_INSTRUCTIONS : []),
    ...(tools.read ? READ_INSTRUCTIONS : []),
    ...(tools.project ? PROJECT_INSTRUCTIONS : []),
    ...(tools.terminal ? TERMINAL_INSTRUCTIONS : []),
    ...(tools.visual ? VISUAL_INSTRUCTIONS : []),
    ...(tools.worktree ? WORKTREE_INSTRUCTIONS : []),
    ...(tools.notify ? NOTIFY_INSTRUCTIONS : []),
    ...(tools.userView ? USER_VIEW_INSTRUCTIONS : []),
    ...(tools.remove ? REMOVE_INSTRUCTIONS : []),
    ...(tools.workplace ? WORKPLACE_INSTRUCTIONS : []),
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
  const ai = request.provider ? `AI は ${PROVIDER_LABELS[request.provider]} で、` : "";
  return {
    title: request.title ? `${label}「${request.title}」を作ろうとしています` : `${label}を作ろうとしています`,
    description: `作業場所は${request.workplace}です。${ai}${place}${request.inherit ? "このチャットの会話を引き継いで" : "会話を引き継がずに"}、下の依頼を送ります。「常に許可」にすると、次からは聞かずに作ります（設定の「チャット」の「AI がチャットを作るとき」で戻せます）。`,
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
      provider: z.enum(PROVIDER_IDS).optional().describe("動かす AI（利用者が「Codex で」「Copilot の子チャットで」などと頼んだときだけ。省くとこのチャットと同じ AI。違う AI には会話を引き継げない）"),
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
      "同じ家系のチャットの名前・固定・グループを変え、子チャットを親から外す（家系の外でも同じプロジェクトなら名前だけ変えられる。聞かずに変える。省いた項目は変えない。親から外すのは利用者に頼まれたときだけ）",
      {
        // 省いたら自分、にしない（書き忘れで黙って自分の名前が変わる）
        chat_id: z.number().int().describe("変えるチャットの ID（必須。自分のチャットでも書く。分からなければ list_family_chats・list_project_chats で確かめる）"),
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
export function chatToolServer(tools: ChatTools, cb: Pick<ProviderCallbacks, "requestApproval">, signal: AbortSignal): ToolServer | null {
  if (!tools.diagnostics && !tools.createChat && !tools.chatEdit && !tools.open && !tools.read && !tools.project && !tools.terminal && !tools.visual && !tools.worktree && !tools.notify && !tools.userView && !tools.remove && !tools.workplace) return null;
  return {
    name: CHAT_SERVER,
    // 画面と記録が見分けに使う名前は Claude Code の見え方（mcp__kickoff_chat__…）なので、頭を外してツールの名前にする
    autoAllow: chatToolNames(tools).map((name) => name.replace(`mcp__${CHAT_SERVER}__`, "")),
    instructions: instructionsFor(tools),
    tools: [
      ...(tools.diagnostics ? diagnosticTools(tools.diagnostics) : []),
      ...(tools.createChat ? [createChatTool(tools.createChat, cb, signal)] : []),
      ...(tools.chatEdit ? chatEditTools(tools.chatEdit) : []),
      ...(tools.open ? openTools(tools.open) : []),
      ...(tools.read ? readTools(tools.read) : []),
      ...(tools.project ? projectTools(tools.project) : []),
      ...(tools.terminal ? terminalTools(tools.terminal) : []),
      ...(tools.visual ? visualTools(tools.visual) : []),
      ...(tools.worktree ? worktreeTools(tools.worktree) : []),
      ...(tools.notify ? notifyTools(tools.notify) : []),
      ...(tools.userView ? userViewTools(tools.userView) : []),
      ...(tools.remove ? removeTools(tools.remove) : []),
      ...(tools.workplace ? workplaceTools(tools.workplace, cb, signal) : []),
    ],
  };
}
