import type { ProviderTurnParams } from "@/features/ai/core/providers/types";
import { realPathOrSelf } from "@/foundation/core/system/paths";
import { evaluateCompileCacheEnv } from "./compileCacheGuard";
import { evaluateDeleteCommand } from "./deleteGuard";
import { DOCKER_GUARD_DENIED } from "@/features/docker/core/guard/dockerGuard";
import { evaluateGitHookBypass } from "./gitHookGuard";
import { evaluateHiddenDbAccess } from "@/features/database/core/guard/hiddenDb";
import { evaluateReferenceWrite, evaluateUntrackedWrite, writeTargetOf } from "./scope";
import { evaluateSelfProtection, type SelfInfo } from "./selfProtection";
import { judgeFileWrite } from "./writeScope";
import type { DenyVerdict, GuardVerdict } from "@/features/guard/core/rules";

/*
 * Kickoff の守りを、ツールの呼び出しの形によらずまとめて当てる（プロバイダー非依存）。
 * Claude Code は PreToolUse のフックで 1 つずつ当てる（providers/claude/policy.ts）。フックを持たず、承認の頼みで聞いてくる CLI
 * （Copilot・ACP など）と、Codex の PreToolUse のフック（providers/codex/preToolUse.ts）は、聞かれたコマンド・書く先をここで判定する（判定の形は rules.ts の GuardVerdict）
 */

/** 判定に使うもの（実行に渡されたもの） */
export interface GuardContext {
  params: Pick<ProviderTurnParams, "cwd" | "readOnlyPaths" | "untrackedOnly" | "hiddenDb" | "deleteGuard" | "dockerGuard" | "writeScope">;
  self?: SelfInfo;
}

const firstDeny = (verdicts: DenyVerdict[]): GuardVerdict | null => verdicts.find((v) => v.kind === "deny") ?? null;

/** シェルのコマンドを流す前の判定（自分を守る・［AI で整える］・見せない DB・消すコマンド・git のフックを飛ばすコマンド・NODE_COMPILE_CACHE を設定するコマンドは断り、ほかの作業場所の Docker は聞く） */
export async function judgeCommand(ctx: GuardContext, command: string): Promise<GuardVerdict> {
  const { params, self } = ctx;
  const input = { command };
  const denied = firstDeny([
    ...(self ? [evaluateSelfProtection(self, "Bash", input)] : []),
    ...(params.untrackedOnly ? [await evaluateUntrackedWrite(params.cwd, "Bash", input)] : []),
    ...(params.hiddenDb?.length ? [evaluateHiddenDbAccess(params.hiddenDb, "Bash", input)] : []),
    ...(params.deleteGuard ? [evaluateDeleteCommand("Bash", input)] : []),
    evaluateGitHookBypass("Bash", input),
    evaluateCompileCacheEnv("Bash", input),
  ]);
  if (denied) return denied;
  if (params.dockerGuard) {
    // 判定に失敗したら（docker が答えないなど）通す（守りはうっかりを防ぐもので、AI の作業を止めない）
    const ask = await params.dockerGuard.check(command).catch(() => null);
    if (ask) return { kind: "ask", title: ask.title, description: ask.description, deniedReason: DOCKER_GUARD_DENIED };
  }
  return { kind: "pass" };
}

/** ファイルを書く前の判定（自分を守る・参照資料・［AI で整える］・見せない DB は断り、書き込み先の守りはほかの作業場所を断り外を聞く） */
export async function judgeWritePath(ctx: GuardContext, filePath: string): Promise<GuardVerdict> {
  const { params, self } = ctx;
  const input = { file_path: filePath };
  const denied = firstDeny([
    ...(self ? [evaluateSelfProtection(self, "Write", input)] : []),
    ...(params.readOnlyPaths?.length ? [evaluateReferenceWrite(params.cwd, params.readOnlyPaths, "Write", input)] : []),
    ...(params.untrackedOnly ? [await evaluateUntrackedWrite(params.cwd, "Write", input)] : []),
    ...(params.hiddenDb?.length ? [evaluateHiddenDbAccess(params.hiddenDb, "Write", input)] : []),
  ]);
  if (denied) return denied;
  const scope = params.writeScope;
  if (!scope) return { kind: "pass" };
  const target = writeTargetOf(params.cwd, "Write", input);
  if (target === null || scope.allowed.has(target)) return { kind: "pass" };
  return judgeFileWrite(target, {
    workdir: realPathOrSelf(params.cwd),
    writableDirs: scope.writableDirs,
    memoryParents: [],
    workplaces: scope.workplaces,
  });
}

/** ファイルを読む前の判定（自分の保存先・見せない DB の SQLite のファイルは断る。読むことはほかに絞らない）。聞いてくる CLI（Copilot の read の承認）だけが使う */
export function judgeReadPath(ctx: GuardContext, filePath: string): GuardVerdict {
  const { params, self } = ctx;
  const input = { file_path: filePath };
  return (
    firstDeny([
      ...(self ? [evaluateSelfProtection(self, "Read", input)] : []),
      ...(params.hiddenDb?.length ? [evaluateHiddenDbAccess(params.hiddenDb, "Read", input)] : []),
    ]) ?? { kind: "pass" }
  );
}

/** 断られたときに AI に返す文（利用者の言葉があれば添える） */
export function deniedWithWords(reason: string, words: string | undefined): string {
  return words ? `${reason}（利用者の言葉: ${words}）` : reason;
}
