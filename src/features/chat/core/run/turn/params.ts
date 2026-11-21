// 1 回の実行の指定を組み立てる: 登録した contributor（TurnContributor）が出したものを order の順に集め（collectTurnParts）、プロバイダーに渡す形にする（toProviderParams）。
// まだ機能へ分けていない組み立ては 1 つの contributor（legacyTurnParts）に入れてあり、P5-4 の単位ごとに各機能の contributor へ移す
import path from "node:path";
import { realPathOrSelf } from "@/foundation/core/system/paths";
import { workplacesOf } from "@/foundation/core/workplace/worktrees";
import { browserSection, noteSection, sandboxSection, VISUAL_SECTION } from "@/features/chat/core/prompt/system";
import { joinSections, type PromptSection } from "@/features/chat/core/prompt/sections";
import { appendSections } from "@/features/chat/core/prompt/compose";
import { permissionOnlyGate, type GuardMaterials, type PreCompactRequest, type ProviderCallbacks, type ProviderTurnResult, type SandboxPlan, type ToolGate } from "@/features/ai/core/index";
import type { ChatEvent } from "@shared/chat/chatEvent";
import type { Chat } from "@shared/chat/types";
import type { Project } from "@shared/projects/types";
import { ensureDir, readOnlyReferences } from "@/features/chat/core/turnFolders";
import { preCompactSent } from "@/features/chat/core/run/machine/marks";
import type { ChatRun } from "@/features/chat/core/run/chatRun";
import {
  autoPreCompactParams,
  bashSandboxFor,
  chatContextNote,
  chatContextOf,
  githubEnvForGit,
  runAsGitHubAccount,
  sandboxPromptLines,
  workplaceMoveContext,
  type ExecutionDeps,
  type ProviderTurnParams,
} from "@/features/chat/core/turn";
import type { TurnContext, TurnContributor, TurnEndInfo, TurnParts } from "./contributor";

/** contributor が出したものを集めた答え */
export interface CollectedParts {
  env: Record<string, string>;
  readableDirs: string[];
  readOnlyDirs: string[];
  writableDirs: string[];
  systemPrompt: string;
  turnContext: string | null;
  gate: ToolGate | null;
  sandbox: SandboxPlan | null;
  sandboxOff: boolean;
  preCompact: PreCompactRequest | null;
  /** プロバイダーを動かすところを包む（先の order が外側。なければそのまま動かす） */
  around(run: () => Promise<ProviderTurnResult>): Promise<ProviderTurnResult>;
  onRecord: ((event: ChatEvent) => void)[];
  afterTurn: ((end: TurnEndInfo) => Promise<void>)[];
}

/** 1 つだけが出せる欄（2 つ出たら実行を失敗で止める） */
const SINGLE = ["gate", "sandbox", "sandboxOff", "preCompact"] as const satisfies readonly (keyof TurnParts)[];

/**
 * contributor を order の順（同じ order は登録の順）に呼んで集める: env は後が上書き、フォルダは重なりを除いてつなぐ、節は order で並べて 1 つの文に、
 * 文脈はつなぐ、門・砂場・圧縮前指示は 1 つだけ、包みは外側から順に、記録と作業の終わりの口は全部
 */
export async function collectTurnParts(contributors: readonly TurnContributor[], ctx: TurnContext): Promise<CollectedParts> {
  const given: { name: string; parts: TurnParts }[] = [];
  for (const c of [...contributors].sort((a, b) => a.order - b.order)) {
    const parts = await c.contribute(ctx);
    if (parts) given.push({ name: c.name, parts });
  }
  const single = <K extends (typeof SINGLE)[number]>(key: K): TurnParts[K] | undefined => {
    const from = given.filter((g) => g.parts[key] !== undefined);
    if (from.length > 1) throw new Error(`実行の ${key} を ${from.map((g) => g.name).join(" と ")} が出しました（1 つの機能だけが出せます）`);
    return from[0]?.parts[key];
  };
  const dirs = (key: "readableDirs" | "readOnlyDirs" | "writableDirs") => [...new Set(given.flatMap((g) => g.parts[key] ?? []))];
  const arounds = given.flatMap((g) => (g.parts.around ? [g.parts.around] : []));
  return {
    env: Object.assign({}, ...given.map((g) => g.parts.env ?? {})) as Record<string, string>,
    readableDirs: dirs("readableDirs"),
    readOnlyDirs: dirs("readOnlyDirs"),
    writableDirs: dirs("writableDirs"),
    systemPrompt: joinSections(given.flatMap((g) => g.parts.promptSections ?? [])),
    turnContext: appendSections(null, ...given.map((g) => g.parts.turnContext ?? null)),
    gate: single("gate") ?? null,
    sandbox: single("sandbox") ?? null,
    sandboxOff: single("sandboxOff") ?? false,
    preCompact: single("preCompact") ?? null,
    around: (run) => arounds.reduceRight<() => Promise<ProviderTurnResult>>((inner, wrap) => () => wrap(inner), run)(),
    onRecord: given.flatMap((g) => (g.parts.onRecord ? [g.parts.onRecord] : [])),
    afterTurn: given.flatMap((g) => (g.parts.afterTurn ? [g.parts.afterTurn] : [])),
  };
}


/** プロバイダーに渡す指定（集めたものと、チャットの選択・送る指示から。門がなければ権限モードだけで答える門） */
export function toProviderParams(
  chat: Chat,
  parts: CollectedParts,
  run: { cwd: string; prompt: string; promptId?: string; model: string | null; compact: boolean; autoCompactPct: number | null; auth: NonNullable<ProviderTurnParams["auth"]>; cb: Pick<ProviderCallbacks, "requestApproval">; signal: AbortSignal },
): ProviderTurnParams {
  return {
    cwd: run.cwd,
    prompt: run.prompt,
    ...(run.promptId ? { promptId: run.promptId } : {}),
    systemPrompt: parts.systemPrompt,
    turnContext: parts.turnContext,
    resumeSessionId: chat.session_id,
    model: run.model,
    effort: chat.effort,
    permissionMode: chat.permission_mode,
    fastMode: chat.fast_mode,
    autoCompactPct: run.autoCompactPct,
    additionalDirectories: parts.readableDirs,
    sandbox: parts.sandbox,
    sandboxOff: parts.sandboxOff,
    compact: run.compact,
    preCompact: parts.preCompact,
    env: parts.env,
    auth: run.auth,
    gate: parts.gate ?? permissionOnlyGate({ permissionMode: chat.permission_mode, cb: run.cb, signal: run.signal }),
  };
}

/**
 * まだ機能へ分けていない組み立て（order 0）: 環境変数（ワークツリーの PORT → GitHub のアカウント）・Bash の砂場・ノートのフォルダ・
 * システムプロンプトの砂場・ブラウザ・図・ノートの節・添える文脈（家系・作業場所の移動の知らせ）・守りの門・圧縮前指示
 */
export function legacyTurnParts(deps: ExecutionDeps, runtime: ChatRun, preCompactText: string | null): TurnContributor {
  return {
    name: "legacy",
    order: 0,
    async contribute({ chat, project, cwd, signal, requestApproval }) {
      // プロジェクトで GitHub のアカウントを選んでいれば、AI が動かす gh・git もそのアカウントにする（gh にそのアカウントがなければ、gh で有効なもののまま）
      // 作業場所がポートの帯を持つワークツリーなら、開発サーバーの番号（PORT=帯+00）も渡す
      const env = {
        ...(deps.worktreeEnvs?.envFor(cwd) ?? {}),
        ...(project.github_account ? await runAsGitHubAccount(project.github_account, githubEnvForGit) : {}),
      };
      // Bash の砂場（書ける場所を作業場所・ノートのフォルダ・決まりの例外だけにする。読めるフォルダに足した添付・作業場所の外の参照資料は書かせない）
      const noteDir = deps.noteDirOf ? ensureDir(deps.noteDirOf(project)) : null;
      // 計画モードと「AI で整える」の専用の保護は、アプリの既定にかかわらず維持する
      const useSandbox = chat.sandbox_enabled || chat.permission_mode === "plan" || chat.untracked_only;
      const sandbox = useSandbox && deps.bashSandbox
        ? await bashSandboxFor(deps.bashSandbox, { workdir: cwd, noteDir, readOnlyDirs: [...(deps.uploads ? [deps.uploads.dir] : []), ...readOnlyReferences(project, cwd)] })
        : null;
      const place: TurnPlace = { cwd, noteDir, sandbox };
      return {
        env,
        readableDirs: noteDir ? [noteDir] : [],
        promptSections: legacySections(deps, chat, place),
        turnContext: appendSections(null, chatContextNote(chatContextOf(deps.store, chat)), workplaceMoveContext(deps.store.events.pendingWorkplaceMove(chat.id))),
        sandbox,
        sandboxOff: !chat.sandbox_enabled && chat.permission_mode !== "plan" && !chat.untracked_only,
        preCompact: autoPreCompactParams(preCompactText, chat, preCompactSent(runtime.marks)) ?? null,
        // 守りの門（この単位では chat が実行の材料から作る。守りの口がなければ toProviderParams が権限モードだけで答える門にする）
        ...(deps.toolGate ? { gate: deps.toolGate(guardMaterialsOf(deps, chat, project, place, runtime.writeAllowed), { requestApproval }, signal) } : {}),
      };
    },
  };
}

/**
 * まだ機能へ分けていない節: 砂場の行（guard）・ブラウザ（埋め込みブラウザがあるとき）・図と数式・ノート。ノートのフォルダ（なければ作る: ノートのタブで最初のノートを作るのと同じ場所）も
 * 読み書きできる場所に足し、どのチャットでも「ノート」が「ノート」タブのノートのことだと伝える（入力欄にノートを添付して続きを頼む・「ノートに書いて」と頼めるように）。
 * ノートのチャットは、どのノートについての会話かも伝える（作業場所はプロジェクトのまま。コードも読める）
 */
function legacySections(deps: ExecutionDeps, chat: Chat, { noteDir, sandbox }: TurnPlace): PromptSection[] {
  return [
    ...(sandbox ? [sandboxSection(sandboxPromptLines(sandbox.unsandboxedCommands, chat.edit_scope_enabled || chat.untracked_only))] : []),
    ...(deps.browser ? [browserSection(deps.store.settings.get().link_open_in)] : []),
    VISUAL_SECTION,
    ...(noteDir ? [noteSection({ dir: noteDir, file: chat.note_path ? path.join(noteDir, chat.note_path) : null })] : []),
  ];
}

/** 実行の場所（作業フォルダ・ノートのフォルダ・Bash の砂場） */
type TurnPlace = { cwd: string; noteDir: string | null; sandbox: SandboxPlan | null };

/** 守りの門の材料（プロバイダーには渡さず、門だけを渡す） */
function guardMaterialsOf(deps: ExecutionDeps, chat: Chat, project: Project, { cwd, noteDir, sandbox }: TurnPlace, writeAllowed: Set<string>): GuardMaterials {
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
