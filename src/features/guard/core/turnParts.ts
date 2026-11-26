// 守りが 1 回の実行に足すもの（contributor "guard"・order 0）: 守りの門・Bash の砂場・砂場なしの印・システムプロンプトの砂場の行（作業の進め方の続き 220）と、
// 砂場の診断（OS の拒否ログ。診断できる AI だけ。作業ごとに作り、終わり・失敗・中断で必ず閉じる）。門と砂場は、ほかの contributor が出したフォルダを読んでから組む
import { realPathOrSelf } from "@/foundation/core/system/paths";
import { isCommonProject, isUserProject } from "@shared/projects/kinds";
import type { Project } from "@shared/projects/types";
import { turnRestrictions } from "@shared/chat/restrictionNotice";
import { workplacesOf } from "@/foundation/core/workplace/worktrees";
import { providerCan } from "@shared/ai/providers";
import type { ProviderId } from "@shared/settings/types";
import type { AgentProvider, GuardMaterials, ToolGateFactory } from "@/features/ai/core/index";
import { readOnlyReferences, type TurnContributor } from "@/features/chat/core/index";
import { bashSandboxFor, sandboxPromptLines, type BashSandboxDeps } from "./sandbox/bashSandbox";
import { TurnSandboxDiagnostics } from "./sandboxDiagnostics";
import type { SandboxDiagnosticsPlatform } from "./sandboxDiagnosticsPlatform";
import { DIAGNOSTICS_KEY } from "./tools";

export interface GuardTurnDeps {
  /** 実行ごとの守りの門を作る口 */
  toolGate: ToolGateFactory;
  /** AI の Bash の砂場（なければ砂場にかけない（テスト）） */
  bashSandbox?: BashSandboxDeps;
  /** OS の拒否ログを読む口（なければ診断しない） */
  diagnostics?: SandboxDiagnosticsPlatform;
  /** kickoff-trash を置いたか（置いていれば rm・git clean などでファイルを消す Bash を断り、kickoff-trash を使わせる） */
  deleteGuard: boolean;
  /** その AI の CLI の決まりでいつも書ける場所（Claude Code の計画とメモリ）を引く */
  providers: Record<ProviderId, Pick<AgentProvider, "writeExceptions">>;
  /** すべてのプロジェクト（共通のチャットで、利用者のプロジェクトのフォルダへの書き込みを断る。なければ断らない（テスト）） */
  projects?: () => Project[];
}

/** 共通のチャットが利用者のプロジェクトのフォルダ・ノートのフォルダに書こうとしたとき AI に返す文 */
const COMMON_DENIED = "共通のチャットからは、利用者のプロジェクトのフォルダ（コード）とノートのフォルダは書き換えられません（読むのはかまいません）。コードを変えたいときは、kickoff_chat の create_chat に project を渡してそのプロジェクトにチャットを作って頼み、ノートは write_project_note で書いてください";

/**
 * 守りの contributor。書き込み先の守りの承認カードで「このチャットでは許可」を選んだファイル（実体のパス）はチャットごとに作業をまたいで持ち、
 * 保存しない（アプリを終えたら聞き直す）。消したチャットの分は forget で捨てる
 */
export function guardTurnParts(d: GuardTurnDeps): TurnContributor & { forget(chatId: number): void } {
  const allowed = new Map<number, Set<string>>();
  const allowedIn = (chatId: number) => {
    let set = allowed.get(chatId);
    if (!set) allowed.set(chatId, (set = new Set()));
    return set;
  };
  return {
    name: "guard",
    order: 0,
    forget: (chatId) => void allowed.delete(chatId),
    contribute({ chat, signal, perTurn }) {
      if (!d.diagnostics || !providerCan(chat.provider, "sandbox_diagnostics")) return null;
      const diagnostics = perTurn(DIAGNOSTICS_KEY, () => new TurnSandboxDiagnostics(d.diagnostics!));
      return {
        onAgentSpawned: diagnostics.onSpawn,
        // 止めたら閉じる（終わり・失敗でも必ず閉じる）
        around: async (run) => {
          const close = () => diagnostics.close();
          signal.addEventListener("abort", close, { once: true });
          if (signal.aborted) close();
          try {
            return await run();
          } finally {
            signal.removeEventListener("abort", close);
            diagnostics.close();
          }
        },
      };
    },
    async contributeWithDirs({ chat, project, cwd, signal, requestApproval }, dirs) {
      // 共通のチャット（共通のノートのチャットも）は、コマンドのサンドボックスと編集先の制限をいつも入にする（プロジェクトのコードを直接書かせない。書けるのは作業フォルダと共通のノート）
      const common = isCommonProject(project);
      // 計画モードと「AI で整える」の専用の保護も入れた、実際にかける制限
      const { sandbox: useSandbox, editScope } = turnRestrictions(chat, common);
      // 共通のチャットが書かないフォルダ（利用者のプロジェクトの本体・読むだけで足したフォルダ。実体のパス）
      const deniedDirs = common ? [...(d.projects?.() ?? []).filter(isUserProject).map((p) => p.repo_path), ...dirs.readOnlyDirs].map(realPathOrSelf) : null;
      // Bash の砂場（書ける場所を作業場所・ノートのフォルダ・決まりの例外だけにする。読めるフォルダに足した添付・作業場所の外の参照資料は書かせない。
      // 共通のチャットは、一時フォルダなどに置いた利用者のプロジェクトも書かせない）
      const sandbox = useSandbox && d.bashSandbox ? await bashSandboxFor(d.bashSandbox, { workdir: cwd, writableDirs: dirs.writableDirs, readOnlyDirs: dirs.readOnlyDirs, deniedDirs: deniedDirs ?? [] }) : null;
      const materials: GuardMaterials = {
        cwd,
        permissionMode: chat.permission_mode,
        project,
        // 作業場所の外の参照資料は読むだけ（ワークツリーのチャットからは、本体の中の資料も読むだけ）
        readOnlyPaths: readOnlyReferences(project, cwd),
        // ［AI で整える］のチャットは、Git で管理していないファイルだけを書ける（続きの指示でも）
        untrackedOnly: chat.untracked_only,
        // ファイルを書き換えるツールの先は、作業場所・ノートのフォルダ・OS の一時フォルダ・決まりの例外だけ（同じリポジトリのほかの作業場所は断り、それ以外の外は承認カードで聞く。
        // 一時フォルダは Bash の砂場でも書けるので、Write で一時ファイルを置くたびに聞かない。［AI で整える］のチャットは上の守りがもっと狭く絞るので付けない）
        // 共通のチャットでは、利用者のプロジェクトの本体と、読むだけで足したフォルダ（ほかのプロジェクトのノートのフォルダ・添付・参照資料）は聞かずに断る（一時フォルダの中でも）
        writeScope: chat.untracked_only || !editScope
          ? null
          : {
              writableDirs: dirs.writableDirs.map(realPathOrSelf),
              exceptionDirs: d.bashSandbox?.rules.tempDirs ?? [],
              workplaces: () => workplacesOf(project.repo_path),
              allowed: allowedIn(chat.id),
              denied: deniedDirs ? { dirs: deniedDirs, reason: COMMON_DENIED } : null,
            },
        // rm・git clean などでファイルを消す Bash は断り、kickoff-trash を使わせる（どこのファイルでも）
        deleteGuard: d.deleteGuard,
        sandbox,
        writeExceptions: d.providers[chat.provider].writeExceptions,
      };
      return {
        sandbox,
        sandboxOff: !useSandbox,
        ...(sandbox ? { promptSections: [{ order: 220, heading: null, lines: sandboxPromptLines(sandbox.unsandboxedCommands, editScope) }] } : {}),
        gate: d.toolGate(materials, { requestApproval }, signal),
      };
    },
  };
}
