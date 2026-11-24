// AI の Docker の守りが見る Docker の様子（docker ps・compose の組の名前・ボリューム）。どれも 3 秒で打ち切り、答えなければ通す側に倒す
import type { Project } from "@shared/projects/types";
import { dockerRule, judgeDockerCommand, type DockerGuardFacts } from "@/features/docker/core/guard/dockerGuard";
import type { GuardRuleSource } from "@/features/guard/core/index";
import { realPathOrSelf } from "@/foundation/core/system/paths";
import type { DockerLister } from "./list";

/** 守りの問い合わせの待ち時間（Docker が答えないときは、AI のコマンドもどうせ失敗するので通す） */
const GUARD_TIMEOUT_MS = 3_000;

/** 3 秒で答えなければ fallback（守りの問い合わせは待たせない） */
async function within<T>(work: Promise<T>, fallback: T): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const late = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), GUARD_TIMEOUT_MS);
  });
  try {
    return await Promise.race([work.catch(() => fallback), late]);
  } finally {
    clearTimeout(timer);
  }
}

/** 作業場所 workdir のチャットの守りが見る様子。docker の文がなければ何も問い合わせない */
export function dockerFacts(lister: DockerLister, project: Project, workdir: string): DockerGuardFacts {
  return {
    workdir: realPathOrSelf(workdir),
    // 作業場所が分からなければ、チャットの作業場所の中のものだけを自分のものとみなす（dockerGuard の isMine）
    workplaces: () => within(lister.workplaces(project), []),
    containers: () => lister.containers({ timeoutMs: GUARD_TIMEOUT_MS }).catch(() => null),
    composeProject: async (intent) => (intent.cwd === null ? null : lister.configs.projectName({ cwd: intent.cwd, options: intent.options, env: intent.env }, GUARD_TIMEOUT_MS)),
    volumes: async () => {
      try {
        const out = await lister.cli.run(["volume", "ls", "--format", '{{.Name}}\t{{.Label "com.docker.compose.project"}}'], { timeout: GUARD_TIMEOUT_MS });
        return out
          .split("\n")
          .filter(Boolean)
          .map((line) => {
            const [name, label] = line.split("\t");
            return { name, project: label || null };
          });
      } catch {
        return null;
      }
    },
    // compose の設定を覚えていなければ compose に聞く（20 秒まで待つ）ので、守りでは 3 秒で打ち切る
    composeNames: () => within(lister.composeNames(project), []),
  };
}

/** Docker の守りを出す口（createDocker が guard に登録する。実行のたびにプロジェクトと作業フォルダの守りを作る） */
export function dockerRuleSource(facts: (project: Project, cwd: string) => DockerGuardFacts): GuardRuleSource {
  return {
    name: "docker",
    rulesFor: (m) => {
      const known = facts(m.project, m.cwd);
      return [dockerRule({ check: (command) => judgeDockerCommand(command, known) })];
    },
  };
}
