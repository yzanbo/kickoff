// 作業場所の土台の登録先（Kernel.workplace）。上の機能が登録する口を 1 つに持つ（モジュールの変数に登録を持たない。
// テストは同じプロセスでファイルを続けて流すので、前のテストの登録が残らないように）

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

export interface WorkplaceKit {
  readonly projectScopes: ProjectScopes;
}

export function createWorkplaceKit(): WorkplaceKit {
  const scopes: ProjectScope[] = [];
  return {
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
