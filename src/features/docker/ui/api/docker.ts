import type { DockerActionBody } from "@shared/docker/types";
import { dockerContract } from "@shared/docker/contract";
import { client } from "@/foundation/ui/api/client";

/** Docker の呼び手（取り決めは @shared/docker/contract.ts） */
const docker = client(dockerContract);
const at = (projectId: number) => ({ params: { projectId } });

/** Docker タブ（プロジェクトの compose の一覧・操作。この Mac のアプリの中だけ） */
export const dockerApi = {
  /** 一覧（refresh = 覚えた compose の設定を捨てて取り直す ［↻］） */
  dockerList: (projectId: number, refresh = false) => docker("GET /api/projects/:projectId/docker", { ...at(projectId), query: refresh ? { refresh: "1" } : {} }),
  /** 見ています（20 秒ごと。docker events を立て、今の一覧を返す） */
  dockerWatch: (projectId: number) => docker("POST /api/projects/:projectId/docker/watch", at(projectId)),
  /** 操作（待たずに始まり、始めたあとの一覧を返す。cancel・dismiss は何も返さない。別の作業場所と同じ組になる起動は 409・code docker_shared_project） */
  dockerAction: (projectId: number, body: DockerActionBody) => docker("POST /api/projects/:projectId/docker/actions", { ...at(projectId), body }),
  /** ログの画面の流れ（SSE の URL。EventSource でつなぐ。中身は DockerLogEvent） */
  dockerLogsUrl: (projectId: number, compose: string) => docker.url("GET /api/projects/:projectId/docker/logs", { ...at(projectId), query: { compose } }),
  /** ログの「さらに前を読む」（until より前の 500 行。この compose のコンテナだけ） */
  dockerLogsBefore: (projectId: number, compose: string, container: string, until: string) =>
    docker("GET /api/projects/:projectId/docker/logs/before", { ...at(projectId), query: { compose, container, until } }),
  /** 静かなぶつかりの相手の Homebrew のサービスを止める（応答は戻し方を添えた文） */
  dockerBrewStop: (projectId: number, name: string) => docker("POST /api/projects/:projectId/docker/brew-stop", { ...at(projectId), body: { name } }),
  /** エンジンを開く（OrbStack・Docker Desktop。開くアプリは context の名前からコアが決める） */
  dockerOpenEngine: (projectId: number) => docker("POST /api/projects/:projectId/docker/open-engine", at(projectId)),
};
