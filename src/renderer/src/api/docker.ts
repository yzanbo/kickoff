import type { DockerActionBody, DockerBrewStopBody, DockerList, DockerLogLine } from "@shared/types";
import { request, withQuery } from "./http";

/** Docker タブ（プロジェクトの compose の一覧・操作。コアの routes/docker.ts。この Mac のアプリの中だけ） */
export const dockerApi = {
  /** 一覧（refresh = 覚えた compose の設定を捨てて取り直す ［↻］） */
  dockerList: (projectId: number, refresh = false) => request<DockerList>("GET", `/api/projects/${projectId}/docker${refresh ? "?refresh=1" : ""}`),
  /** 見ています（20 秒ごと。docker events を立て、今の一覧を返す） */
  dockerWatch: (projectId: number) => request<DockerList>("POST", `/api/projects/${projectId}/docker/watch`),
  /** 操作（待たずに始まり、始めたあとの一覧を返す。cancel・dismiss は何も返さない。別の作業場所と同じ組になる起動は 409・code docker_shared_project） */
  dockerAction: (projectId: number, body: DockerActionBody) => request<DockerList | undefined>("POST", `/api/projects/${projectId}/docker/actions`, body),
  /** エンジンを開く（OrbStack・Docker Desktop。開くアプリは context の名前からコアが決める） */
  /** ログの画面の流れ（SSE の URL。EventSource でつなぐ。中身は DockerLogEvent） */
  dockerLogsUrl: (projectId: number, compose: string) => withQuery(`/api/projects/${projectId}/docker/logs`, { compose }),
  /** ログの「さらに前を読む」（until より前の 500 行。この compose のコンテナだけ） */
  dockerLogsBefore: (projectId: number, compose: string, container: string, until: string) =>
    request<{ lines: DockerLogLine[] }>("GET", withQuery(`/api/projects/${projectId}/docker/logs/before`, { compose, container, until })),
  /** 静かなぶつかりの相手の Homebrew のサービスを止める（応答は戻し方を添えた文） */
  dockerBrewStop: (projectId: number, name: string) => request<{ message: string }>("POST", `/api/projects/${projectId}/docker/brew-stop`, { name } satisfies DockerBrewStopBody),
  dockerOpenEngine: (projectId: number) => request<void>("POST", `/api/projects/${projectId}/docker/open-engine`),
};
