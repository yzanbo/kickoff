// プロバイダーに渡す指定（作業場所・指示・権限・砂場）と、守りの門の材料を組み立てる（P5-4 で TurnContributor の登録に分ける）
import path from "node:path";
import { realPathOrSelf } from "@/foundation/core/system/paths";
import { workplacesOf } from "@/foundation/core/workplace/worktrees";
import { buildSystemPrompt } from "@/features/chat/core/prompt/system";
import type { GuardMaterials, SandboxPlan } from "@/features/ai/core/index";
import type { Chat } from "@shared/chat/types";
import type { Project } from "@shared/projects/types";
import { readOnlyReferences, referenceDirectories } from "@/features/chat/core/turnFolders";
import { chatContextNote, chatContextOf, joinContexts, sandboxPromptLines, workplaceMoveContext, type ExecutionDeps, type ProviderTurnParams } from "@/features/chat/core/turn";

/** プロバイダーに渡すもの（作業場所・指示・権限） */
export function buildTurnParams(
  deps: ExecutionDeps,
  chat: Chat,
  project: Project,
  { cwd, noteDir, sandbox }: TurnPlace,
  prompt: string,
  promptId?: string,
  note: string | null = null,
): Omit<ProviderTurnParams, "compact" | "gate"> {
  // ノートのフォルダ（executeTurn がまだなければ作る: ノートのタブで最初のノートを作るのと同じ場所）も読み書きできる場所に足し、どのチャットでも「ノート」が「ノート」タブのノートのことだと伝える
  // （入力欄にノートを添付して続きを頼む・「ノートに書いて」と頼めるように）。ノートのチャットは、どのノートについての会話かも伝える（作業場所はプロジェクトのまま。コードも読める）
  return {
    cwd,
    prompt,
    ...(promptId ? { promptId } : {}),
    systemPrompt: buildSystemPrompt(project, cwd, noteDir ? { dir: noteDir, file: chat.note_path ? path.join(noteDir, chat.note_path) : null } : undefined, {
      trash: deps.trashCommand !== undefined,
      sandboxLines: sandbox ? sandboxPromptLines(sandbox.unsandboxedCommands, chat.edit_scope_enabled || chat.untracked_only) : undefined,
      editScopeEnabled: chat.edit_scope_enabled || chat.untracked_only,
      browser: deps.browser ? deps.store.settings.get().link_open_in : undefined,
    }),
    turnContext: joinContexts(chatContextNote(chatContextOf(deps.store, chat)), workplaceMoveContext(deps.store.events.pendingWorkplaceMove(chat.id)), note),
    resumeSessionId: chat.session_id,
    model: chat.model,
    effort: chat.effort,
    permissionMode: chat.permission_mode,
    fastMode: chat.fast_mode,
    autoCompactPct: deps.store.settings.get().auto_compact_pct,
    // 添付ファイルの保存先と参照資料を読めるようにし、リポジトリの外の参照資料には書き込ませない
    additionalDirectories: [...(deps.uploads ? [deps.uploads.dir] : []), ...referenceDirectories(project), ...(noteDir ? [noteDir] : [])],
    sandbox,
    sandboxOff: !chat.sandbox_enabled && chat.permission_mode !== "plan" && !chat.untracked_only,
  };
}

/** 実行の場所（作業フォルダ・ノートのフォルダ・Bash の砂場） */
export type TurnPlace = { cwd: string; noteDir: string | null; sandbox: SandboxPlan | null };

/** 守りの門の材料（プロバイダーには渡さず、門だけを渡す） */
export function guardMaterialsOf(deps: ExecutionDeps, chat: Chat, project: Project, { cwd, noteDir, sandbox }: TurnPlace, writeAllowed: Set<string>): GuardMaterials {
  return {
    cwd,
    permissionMode: chat.permission_mode,
    project,
    // 作業場所の外の参照資料は読むだけ（ワークツリーのチャットからは、本体の中の資料も読むだけ）
    readOnlyPaths: readOnlyReferences(project, cwd),
    // ［AI で整える］のチャットは、Git で管理していないファイルだけを書ける（続きの指示でも）
    untrackedOnly: chat.untracked_only,
    // ファイルを書き換えるツールの先は、作業場所・ノートのフォルダ・OS の一時フォルダ・決まりの例外だけ（同じリポジトリのほかの作業場所は断り、それ以外の外は承認カードで聞く。
    // 一時フォルダは Bash の砂場でも書けるので、Write で一時ファイルを置くたびに聞かない。［AI で整える］のチャットは上の守りがもっと狭く絞るので付けない）
    writeScope: chat.untracked_only || !chat.edit_scope_enabled
      ? null
      : { writableDirs: [...(noteDir ? [realPathOrSelf(noteDir)] : []), ...(deps.bashSandbox?.rules.tempDirs ?? [])], workplaces: () => workplacesOf(project.repo_path), allowed: writeAllowed },
    // rm・git clean などでファイルを消す Bash は断り、kickoff-trash を使わせる（どこのファイルでも）
    deleteGuard: deps.trashCommand !== undefined,
    sandbox,
    // その AI の CLI の決まりでいつも書ける場所（Claude Code の計画とメモリ）
    writeExceptions: deps.providers[chat.provider].writeExceptions,
  };
}
