import type { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { z } from "zod";
import { DOCKER_ACTIONS, type DockerActionBody, type DockerBrewStopBody } from "@shared/docker/types";
import type { ChatStoreDeps } from "@/features/chat/core/index";
import type { Bus } from "@/foundation/core/bus";
import type { DockerParts } from "@/features/docker/core/index";
import { jsonBody, queryOf } from "@/foundation/core/http/input";
import { lookups } from "@/foundation/core/http/lookups";
import { Invalid } from "@/foundation/core/errors";
import { systemClock } from "@/foundation/core/clock";

const actionBody = z.object({
  action: z.enum([...DOCKER_ACTIONS, "cancel", "dismiss"]),
  compose: z.string().min(1).max(4000),
  service: z.string().max(200).optional(),
  container: z.string().max(200).optional(),
  confirm_shared: z.boolean().optional(),
}) satisfies z.ZodType<DockerActionBody>;

/** ログの「さらに前を読む」のクエリ（compose の見出しのキー・コンテナの ID・この時刻より前） */
const logsBeforeQuery = z.object({
  compose: z.string().min(1).max(4000),
  container: z.string().regex(/^[0-9a-f]{12,64}$/),
  until: z.string().regex(/^\d{4}-\d\d-\d\dT[\d:.]+Z$/),
});

const brewStopBody = z.object({ name: z.string().regex(/^[\w@.+-]{1,200}$/) }) satisfies z.ZodType<DockerBrewStopBody>;

/** Docker タブ（端末には開かない = http/deviceAccess.ts。スマホの画面にはタブを出さない） */
export interface DockerRouteDeps {
  store: Pick<ChatStoreDeps, "projects" | "chats" | "groups">;
  parts: DockerParts;
  bus: Bus;
}

export function dockerRoutes(app: Hono, { store, parts: { lister, operations, watch }, bus }: DockerRouteDeps) {
  const { withProject } = lookups(store);

  // 一覧（?refresh=1 は覚えた compose の設定を捨てて取り直す ［↻］）
  app.get("/api/projects/:id/docker", withProject, async (c) => {
    const refresh = queryOf(c, "refresh") === "1";
    if (refresh) lister.refresh();
    return c.json(await lister.list(c.var.project));
  });

  // 見ています（画面が 20 秒ごとに送る。docker events を立て、今の一覧を返す）
  app.post("/api/projects/:id/docker/watch", withProject, async (c) => c.json(await watch.watch(c.var.project)));

  // 操作（待たずに始める。様子は SSE の docker_changed。cancel・dismiss は 204）
  app.post("/api/projects/:id/docker/actions", withProject, async (c) => {
    const body = actionBody.parse(await jsonBody(c));
    await operations.act(c.var.project, body);
    if (body.action === "cancel" || body.action === "dismiss") return c.body(null, 204);
    // 始めたあとの一覧を返す（動いている操作が入っている。画面は届いた一覧をそのまま出す）
    return c.json(await lister.list(c.var.project), 202);
  });

  // ログの画面（SSE。compose のコンテナごとの docker logs を 1 本にまとめる。止まった・起動し直したら区切り。閉じたら止める）
  app.get("/api/projects/:id/docker/logs", withProject, (c) => {
    const project = c.var.project;
    const compose = z.string().min(1).max(4000).parse(queryOf(c, "compose"));
    return streamSSE(c, async (stream) => {
      const session = watch.logSession(project, compose, (event) => void stream.writeSSE({ data: JSON.stringify(event) }));
      const unsubscribe = bus.subscribe((event) => {
        if (event.type === "docker_changed" && event.project_id === project.id) void session.sync();
      });
      const closed = new Promise<void>((resolve) => stream.onAbort(resolve));
      await stream.writeSSE({ event: "ping", data: "" });
      void session.sync();
      const ping = systemClock.setInterval(() => void stream.writeSSE({ event: "ping", data: "" }), 25_000);
      await closed;
      systemClock.clearInterval(ping);
      unsubscribe();
      session.close();
    });
  });

  // ログの「さらに前を読む」（until より前の 500 行。この compose のコンテナだけ）
  app.get("/api/projects/:id/docker/logs/before", withProject, async (c) => {
    const { compose, container, until } = logsBeforeQuery.parse({ compose: queryOf(c, "compose"), container: queryOf(c, "container"), until: queryOf(c, "until") });
    return c.json({ lines: await lister.logsBefore(c.var.project, compose, container, until) });
  });

  // 静かなぶつかりの［Docker の db を使う］: 相手の Homebrew のサービスを止める（いまぶつかっている相手の名前だけ受ける）
  app.post("/api/projects/:id/docker/brew-stop", withProject, async (c) => {
    const { name } = brewStopBody.parse(await jsonBody(c));
    return c.json({ message: await operations.stopBrewService(c.var.project, name) });
  });

  // エンジンが止まっているときの「OrbStack を開く」など（開くアプリは context の名前から決める。本文では受けない）
  app.post("/api/projects/:id/docker/open-engine", withProject, async (c) => {
    const starter = lister.engine.starterOf(await lister.cli.context());
    if (starter?.kind !== "open") throw new Invalid("開くアプリが分かりません。Docker のアプリを起動してください");
    // 起きるまでは待たない（画面が 2 秒ごとに調べ直す）
    await lister.engine.start(starter);
    return c.body(null, 204);
  });
}
