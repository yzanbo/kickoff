// AI の Docker の守りが見る Docker の様子（docker ps・compose の組の名前・ボリューム）。どれも 3 秒で打ち切り、答えなければ通す側に倒す
import type { Project } from "@shared/types";
import { judgeDockerCommand, type DockerGuard, type DockerGuardFacts } from "../chat/guard/dockerGuard.js";
import { realPathOrSelf } from "../system/paths.js";
import { PS_FORMAT, parseComposeConfig, parsePs } from "./parse.js";
import type { DockerService } from "./service.js";

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

/** チャットの実行 1 回分の守り（作業場所 workdir のチャット）。docker の文がなければ何も問い合わせない */
export function createDockerGuard(docker: DockerService, project: Project, workdir: string): DockerGuard {
  const cli = docker.cli;
  const facts: DockerGuardFacts = {
    workdir: realPathOrSelf(workdir),
    // 作業場所が分からなければ、チャットの作業場所の中のものだけを自分のものとみなす（dockerGuard の isMine）
    workplaces: () => within(docker.workplacesOf(project), []),
    containers: async () => {
      try {
        const out = await cli.run(["ps", "-a", "--format", PS_FORMAT], { timeout: GUARD_TIMEOUT_MS });
        return parsePs(out).map((c) => ({ ...c, dir: c.dir ? realPathOrSelf(c.dir) : null }));
      } catch {
        return null;
      }
    },
    composeProject: async (intent) => {
      if (intent.cwd === null) return null;
      try {
        const out = await cli.run(["compose", ...intent.options, "config", "--format", "json"], { cwd: intent.cwd, timeout: GUARD_TIMEOUT_MS, env: intent.env });
        return parseComposeConfig(out)?.name ?? null;
      } catch {
        return null;
      }
    },
    volumes: async () => {
      try {
        const out = await cli.run(["volume", "ls", "--format", '{{.Name}}\t{{.Label "com.docker.compose.project"}}'], { timeout: GUARD_TIMEOUT_MS });
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
    composeNames: () => within(docker.composeNames(project), []),
  };
  return { check: (command) => judgeDockerCommand(command, facts) };
}
