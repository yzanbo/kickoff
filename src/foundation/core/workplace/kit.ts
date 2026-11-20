// 作業場所の土台の登録先（Kernel.workplace）。上の機能が登録する口を 1 つに持つ（モジュールの変数に登録を持たない。
// テストは同じプロセスでファイルを続けて流すので、前のテストの登録が残らないように）
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

export interface WorkplaceKit {
  /** 登録された環境変数を足す git（fetch・push・pull・ls-remote） */
  readonly git: RemoteGit;
  /** git に足す環境変数の出どころ（github が登録: プロジェクトの GitHub のアカウントのトークン。取れなくても手元の操作は止めないよう、出どころが失敗を握る） */
  readonly gitEnv: { register(source: () => Promise<NodeJS.ProcessEnv>): void };
  readonly projectScopes: ProjectScopes;
}

export function createWorkplaceKit(): WorkplaceKit {
  const scopes: ProjectScope[] = [];
  const envSources: (() => Promise<NodeJS.ProcessEnv>)[] = [];
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
  };
}
