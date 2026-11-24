// Docker タブの受け口（取り決め @shared/docker/contract.ts。端末には開かない。スマホの画面にはタブを出さない）
import { z } from "zod";
import { dockerContract } from "@shared/docker/contract";
import { DOCKER_ACTIONS, type DockerActionBody, type DockerBrewStopBody } from "@shared/docker/types";
import type { Project } from "@shared/projects/types";
import type { Bus } from "@/foundation/core/bus";
import type { Clock } from "@/foundation/core/clock";
import { Invalid } from "@/foundation/core/errors";
import { implement, type Param } from "@/foundation/core/http/implement";
import { sseStream } from "@/foundation/core/http/sseStream";
import { flag } from "@/foundation/core/http/zodParts";
import type { DockerParts } from "@/features/docker/core/index";

/** compose の見出しのキー */
const composeKey = z.string().min(1).max(4000);

const actionBody = z.object({
  action: z.enum([...DOCKER_ACTIONS, "cancel", "dismiss"]),
  compose: composeKey,
  service: z.string().max(200).optional(),
  container: z.string().max(200).optional(),
  confirm_shared: z.boolean().optional(),
}) satisfies z.ZodType<DockerActionBody>;

/** ログの「さらに前を読む」のクエリ（compose の見出しのキー・コンテナの ID・この時刻より前） */
const logsBeforeQuery = z.object({
  compose: composeKey,
  container: z.string().regex(/^[0-9a-f]{12,64}$/),
  until: z.string().regex(/^\d{4}-\d\d-\d\dT[\d:.]+Z$/),
});

const brewStopBody = z.object({ name: z.string().regex(/^[\w@.+-]{1,200}$/) }) satisfies z.ZodType<DockerBrewStopBody>;

export interface DockerRouteDeps {
  projectParam: Param<Project>;
  parts: DockerParts;
  bus: Bus;
  clock: Pick<Clock, "setInterval" | "clearInterval">;
}

export function dockerRoutes({ projectParam, parts: { lister, operations, watch }, bus, clock }: DockerRouteDeps) {
  return implement(dockerContract, {
    context: { projectId: projectParam },
    // 一覧（?refresh=1 は覚えた compose の設定を捨てて取り直す ［↻］）
    "GET /api/projects/:projectId/docker": {
      query: z.object({ refresh: flag.optional() }),
      run: ({ projectId: project, query }) => {
        if (query.refresh === "1") lister.refresh();
        return lister.list(project);
      },
    },
    // 見ています（画面が 20 秒ごとに送る。docker events を立て、今の一覧を返す）
    "POST /api/projects/:projectId/docker/watch": { run: ({ projectId: project }) => watch.watch(project) },
    // 操作（待たずに始める。様子は SSE の docker_changed。cancel・dismiss は 204）
    "POST /api/projects/:projectId/docker/actions": {
      body: actionBody,
      run: async ({ projectId: project, body }) => {
        await operations.act(project, body);
        if (body.action === "cancel" || body.action === "dismiss") return undefined;
        // 始めたあとの一覧を返す（動いている操作が入っている。画面は届いた一覧をそのまま出す）
        return lister.list(project);
      },
    },
    // ログの画面（compose のコンテナごとの docker logs を 1 本にまとめる。止まった・起動し直したら区切り。閉じたら止める）
    "GET /api/projects/:projectId/docker/logs": {
      query: z.object({ compose: composeKey }),
      run: ({ projectId: project, query }) =>
        sseStream(clock, async (stream, _finish, send) => {
          const session = watch.logSession(project, query.compose, (event) => send({ data: JSON.stringify(event) }));
          const unsubscribe = bus.subscribe((event) => {
            if (event.type === "docker_changed" && event.project_id === project.id) void session.sync();
          });
          await stream.writeSSE({ event: "ping", data: "" });
          void session.sync();
          return () => {
            unsubscribe();
            session.close();
          };
        }),
    },
    "GET /api/projects/:projectId/docker/logs/before": {
      query: logsBeforeQuery,
      run: async ({ projectId: project, query: { compose, container, until } }) => ({ lines: await lister.logsBefore(project, compose, container, until) }),
    },
    // 静かなぶつかりの［Docker の db を使う］: 相手の Homebrew のサービスを止める（いまぶつかっている相手の名前だけ受ける）
    "POST /api/projects/:projectId/docker/brew-stop": {
      body: brewStopBody,
      run: async ({ projectId: project, body }) => ({ message: await operations.stopBrewService(project, body.name) }),
    },
    // エンジンが止まっているときの「OrbStack を開く」など（開くアプリは context の名前から決める。本文では受けない）
    "POST /api/projects/:projectId/docker/open-engine": {
      run: async () => {
        const starter = lister.engine.starterOf(await lister.cli.context());
        if (starter?.kind !== "open") throw new Invalid("開くアプリが分かりません。Docker のアプリを起動してください");
        // 起きるまでは待たない（画面が 2 秒ごとに調べ直す）
        await lister.engine.start(starter);
      },
    },
  });
}
