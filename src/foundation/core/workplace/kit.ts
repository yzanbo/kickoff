// 作業場所の土台の登録先（Kernel.workplace）。上の機能が登録する口を 1 つに持つ（モジュールの変数に登録を持たない。
// テストは同じプロセスでファイルを続けて流すので、前のテストの登録が残らないように）
import { Conflict } from "@/foundation/core/errors";
import { git, type Git } from "./git";

/** 包む先のプロジェクト（使う欄だけ） */
export interface ScopedProject {
  id: number;
  github_account: string | null;
}

/** プロジェクトの頼みを包む（github が登録: プロジェクトの GitHub のアカウントで動かす） */
export type ProjectScope = <T>(project: ScopedProject, run: () => Promise<T>) => Promise<T>;

export interface ProjectScopes {
  add(scope: ProjectScope): void;
  /** 登録した包みを、足した順に外から当てて run を流す */
  run<T>(project: ScopedProject, run: () => Promise<T>): Promise<T>;
}

/** 登録された環境変数を足す git（remote に触る操作が使う。Kernel.workplace.git） */
export type RemoteGit = (cwd: string, opts?: { timeout?: number }) => Git;

/** 作業場所を作る人（worktrees が登録する） */
export interface WorkplaceCreator {
  /** いまのコミット（fromDir）から、新しいブランチのワークツリーを作る。実行環境の用意（ポートの帯など）もここで */
  createWorktree(target: { projectId: number; repoPath: string }, branch: string, fromDir: string): Promise<{ folder: string }>;
}

export interface WorkplaceKit {
  /** 登録された環境変数を足す git（fetch・push・pull・ls-remote） */
  readonly git: RemoteGit;
  /** git に足す環境変数の出どころ（github が登録: プロジェクトの GitHub のアカウントのトークン。取れなくても手元の操作は止めないよう、出どころが失敗を握る） */
  readonly gitEnv: { register(source: () => Promise<NodeJS.ProcessEnv>): void };
  readonly projectScopes: ProjectScopes;
  /** 作る人を登録する（worktrees が createWorktrees の中で呼ぶ） */
  provideCreator(creator: WorkplaceCreator): void;
  /** 登録された作る人（なければ Conflict） */
  creator(): WorkplaceCreator;
}

export function createWorkplaceKit(): WorkplaceKit {
  const scopes: ProjectScope[] = [];
  const envSources: (() => Promise<NodeJS.ProcessEnv>)[] = [];
  let made: WorkplaceCreator | null = null;
  const gitEnv = async (): Promise<NodeJS.ProcessEnv> => Object.assign({}, ...(await Promise.all(envSources.map((source) => source()))));
  return {
    git: (cwd, opts) => git(cwd, { timeout: opts?.timeout, env: gitEnv }),
    gitEnv: { register: (source) => void envSources.push(source) },
    projectScopes: {
      add: (scope) => void scopes.push(scope),
      run: (project, run) => {
        let wrapped = run;
        for (const scope of [...scopes].reverse()) {
          const inner = wrapped;
          wrapped = () => scope(project, inner);
        }
        return wrapped();
      },
    },
    provideCreator: (creator) => void (made = creator),
    creator: () => {
      if (!made) throw new Conflict("ワークツリーは作れません");
      return made;
    },
  };
}
