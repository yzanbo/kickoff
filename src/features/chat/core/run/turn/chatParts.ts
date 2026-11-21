// チャット自身が 1 回の実行に足すもの（contributor "chat"・order 30）: システムプロンプトのプロジェクト・作業の進め方・ゴミ箱の行・参照資料の節、
// kickoff-trash の環境変数、一度だけ添える知らせ、読めるフォルダ（添付の保存先・参照資料）、作業の終わりの会話記録の乗り換え
import { errorMessage } from "@shared/foundation/errors";
import { trashCommandEnv } from "@/features/trash/core/index";
import { projectSection, referenceSection, TRASH_SECTION, WORK_SECTION } from "@/features/chat/core/prompt/system";
import { switchAfterCompact } from "@/features/chat/core/sessionSwitch";
import { referenceDirectories } from "@/features/chat/core/turnFolders";
import type { ExecutionDeps } from "@/features/chat/core/turn";
import type { ChatRun } from "@/features/chat/core/run/chatRun";
import type { TurnContributor } from "./contributor";

export function chatTurnParts(deps: ExecutionDeps, runtime: ChatRun): TurnContributor {
  return {
    name: "chat",
    order: 30,
    contribute({ chat, project, cwd, kind }) {
      // 次に送るものに一度だけ添える知らせ（利用者が作業場所を移す予約を取り消したときなど）。手で圧縮する実行には添えず、取り出したら外す
      const note = kind === "compact" ? null : runtime.pendingNote;
      if (kind !== "compact") runtime.pendingNote = null;
      const references = referenceSection(project);
      return {
        // rm の代わりに Kickoff のゴミ箱へ入れる kickoff-trash を PATH に足す（どこで消しても、どのチャットが消したか分かるようにチャットの ID も）
        ...(deps.trashCommand ? { env: trashCommandEnv(deps.trashCommand, chat.id) } : {}),
        // 添付ファイルの保存先と参照資料を読めるようにする
        readableDirs: [...(deps.attachments ? [deps.attachments.dir] : []), ...referenceDirectories(project)],
        promptSections: [projectSection(project, cwd, chat.edit_scope_enabled || chat.untracked_only), WORK_SECTION, ...(deps.trashCommand ? [TRASH_SECTION] : []), ...(references ? [references] : [])],
        turnContext: note,
        // 圧縮した作業が最後まで終わったら、直近の区切りだけの新しいセッションに乗り換える（会話記録が大きくなり続けないように。失敗しても作業は止めない）
        afterTurn: async (end) => {
          if (end.status !== "completed") return;
          await switchAfterCompact({ store: deps.store, provider: deps.providers[chat.provider], trash: deps.sessionTrash }, end.chatId, end.cwd, end.since).catch((e: unknown) =>
            console.warn(`[session] 会話記録を乗り換えられませんでした: ${errorMessage(e)}`),
          );
        },
      };
    },
  };
}
