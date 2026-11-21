// AI の書き込み先の守り（プロバイダー非依存）: ファイルを書き換えるツール（Write・Edit・MultiEdit・NotebookEdit）の書く先を、
// 作業場所・ノートのフォルダ・決まりの例外だけにする。同じリポジトリのほかの作業場所（本体・ほかのワークツリー）は断り、それ以外の外は承認カードで聞く
// （聞くのはプロバイダーのフック。権限モードに関係なく、Auto mode でも聞く）。読むことは絞らない。Bash は見ない（Bash の砂場 sandbox/bashSandbox.ts で止める）
import os from "node:os";
import path from "node:path";
import { workplaceText } from "@shared/foundation/workplace";
import { deepestWorkplace, type Workplace } from "@/foundation/core/workplace/worktrees";
import { isInside } from "@/foundation/core/system/paths";
import type { GuardVerdict } from "@/features/guard/core/rules";

/** 判定に使う様子（パスはどれも実体のパス = realpath） */
export interface WriteScopeFacts {
  /** チャットの作業場所 */
  workdir: string;
  /** いつも書けるフォルダ（ノートのフォルダ・プロバイダーの決まりの例外。Claude Code の計画 ~/.claude/plans など） */
  writableDirs: string[];
  /** この下の「<名前>/memory」の中を書けるフォルダ（Claude Code のメモリ ~/.claude/projects/<プロジェクト>/memory） */
  memoryParents: string[];
  /** プロジェクトの本体とワークツリー */
  workplaces(): Promise<Workplace[]>;
}

/** チャットの実行がプロバイダーに渡すもの（プロバイダーが自分の決まりの例外を足して WriteScopeFacts にする） */
export interface WriteScopeParams {
  /** いつも書けるフォルダ（ノートのフォルダ。実体のパス） */
  writableDirs: string[];
  /** プロジェクトの本体とワークツリー */
  workplaces(): Promise<Workplace[]>;
  /** 承認カードの「このチャットでは許可」で許したファイル（実体のパス。チャットごとに作業をまたいで持つ。保存しない） */
  allowed: Set<string>;
}

/** 利用者がカードで断ったとき AI に返す文 */
export const WRITE_SCOPE_DENIED = "利用者が拒否しました（作業場所の外への書き込み）。そのファイルは書き込まずに進めるか、利用者に代わりの方法を聞いてください";

const PASS: GuardVerdict = { kind: "pass" };

/** Claude Code のサブエージェントのワークツリー（isolation: "worktree"。<リポジトリ>/.claude/worktrees/<名前>）か */
const isSubagentWorktree = (dir: string) => dir.includes(`${path.sep}.claude${path.sep}worktrees${path.sep}`);

/** parent/<名前>/memory の中か */
function isMemoryOf(parent: string, target: string): boolean {
  if (!isInside(parent, target)) return false;
  const parts = path.relative(parent, target).split(path.sep);
  return parts.length >= 3 && parts[1] === "memory";
}

/** 画面・AI に見せるパス（ホームフォルダの下は ~/…） */
function shown(p: string): string {
  const home = os.homedir();
  return isInside(home, p) ? path.join("~", path.relative(home, p)) : p;
}

/** 同じリポジトリのほかの作業場所に書こうとしたときの断る文（AI が自分でチャットを作らず、利用者に提案するよう案内する） */
function otherWorkplaceReason(target: string, owner: Workplace, mine: string): string {
  const where = owner.worktree_path === null ? "本体" : `そのワークツリー（${owner.branch ?? path.basename(owner.path)}）`;
  return (
    `${shown(target)} は同じリポジトリの別の作業場所（${workplaceText(owner.worktree_path === null ? null : owner.path, owner.branch)}）のファイルなので、このチャットからは書き換えられません（このチャットの作業場所は ${shown(mine)}）。読むのはかまいません。` +
    `その作業場所での書き換えが要るなら、自分でチャットを作らずに、利用者に「${where}のチャットで行うか、${where}で子チャットを作るか」を提案してください`
  );
}

/**
 * 書く先（実体のパス）を判定する。書ける = 作業場所・ノートのフォルダ・決まりの例外（Claude Code のメモリと計画・サブエージェントのワークツリー）。
 * 同じリポジトリのほかの作業場所は断り、それ以外の外は聞く。どの作業場所のものかは、いちばん深く入る作業場所で決める
 * （本体の中に置いたワークツリーは、本体ではなくそのワークツリーのもの）。作業場所の一覧が取れなければ、作業場所の中かだけで見る。
 * 聞くときは、断られたら AI に返す文と「このチャットでは許可」で覚える書く先（target）を添える
 */
export async function judgeFileWrite(target: string, facts: WriteScopeFacts): Promise<GuardVerdict> {
  if (facts.writableDirs.some((dir) => isInside(dir, target))) return PASS;
  if (facts.memoryParents.some((dir) => isMemoryOf(dir, target))) return PASS;
  const workplaces = await facts.workplaces();
  const mine = deepestWorkplace(facts.workdir, workplaces)?.path ?? facts.workdir;
  const owner = deepestWorkplace(target, workplaces);
  if (owner) {
    if (owner.path === mine || isSubagentWorktree(owner.path)) return PASS;
    return { kind: "deny", reason: otherWorkplaceReason(target, owner, mine) };
  }
  if (isInside(facts.workdir, target)) return PASS;
  return {
    kind: "ask",
    title: `作業場所の外のファイルに書き込もうとしています: ${shown(target)}`,
    description: `このチャットの作業場所（${shown(mine)}）とノートのフォルダの外です。Kickoff の AI の守りが、作業場所の外への書き込みを流す前に確かめています。`,
    deniedReason: WRITE_SCOPE_DENIED,
    rememberTarget: target,
  };
}
