// Docker の取り決め（プロジェクトの Docker タブ。受け口は src/features/docker/core/routes/docker.ts。この Mac のアプリの中だけで、端末には開かない）。
// 「DB で開く」の GET …/docker/db は database の取り決めの外の受け口（database の routes/dockerDb.ts）
import { empty, route, sse, type Contract } from "@shared/foundation/contract";
import type { DockerActionBody, DockerBrewStopBody, DockerList, DockerLogEvent, DockerLogLine } from "./types";

/** ログの「さらに前を読む」のクエリ（compose の見出しのキー・コンテナの ID・この時刻より前） */
export interface DockerLogsBeforeQuery {
  compose: string;
  container: string;
  until: string;
}

export const dockerContract = {
  /** 一覧（refresh = "1" は覚えた compose の設定を捨てて取り直す ［↻］） */
  "GET /api/projects/:projectId/docker": route<never, DockerList, { refresh?: "0" | "1" }>(),
  /** 見ています（画面が 20 秒ごとに送る。docker events を立て、今の一覧を返す） */
  "POST /api/projects/:projectId/docker/watch": route<never, DockerList>(),
  /** 操作（待たずに始め、始めたあとの一覧を 202 で返す。cancel・dismiss は 204。別の作業場所と同じ組になる起動は 409・code docker_shared_project） */
  "POST /api/projects/:projectId/docker/actions": route<DockerActionBody, DockerList | undefined>({ status: 202, alsoStatus: 204 }),
  /** ログの画面の流れ（compose のコンテナごとの docker logs を 1 本にまとめる。止まった・起動し直したら区切り） */
  "GET /api/projects/:projectId/docker/logs": sse<DockerLogEvent, { compose: string }>(),
  /** ログの「さらに前を読む」（until より前の 500 行。この compose のコンテナだけ） */
  "GET /api/projects/:projectId/docker/logs/before": route<never, { lines: DockerLogLine[] }, DockerLogsBeforeQuery>(),
  /** 静かなぶつかりの相手の Homebrew のサービスを止める（応答は戻し方を添えた文） */
  "POST /api/projects/:projectId/docker/brew-stop": route<DockerBrewStopBody, { message: string }>(),
  /** エンジンを開く（OrbStack・Docker Desktop。開くアプリは context の名前からコアが決める。起きるまでは待たない） */
  "POST /api/projects/:projectId/docker/open-engine": empty(),
} as const satisfies Contract;
