import type { Hono } from "hono";
import { z } from "zod";
import { DOCKER_ACTIONS, type DockerActionBody } from "@shared/types";
import type { ServerDeps } from "../server.js";
import { jsonBody, queryOf } from "../input.js";
import { lookups } from "../lookups.js";
import { localOnly } from "../thisMac.js";
import { Invalid } from "../errors.js";
import { findOrb } from "../../docker/cli.js";
import { starterOf } from "../../docker/parse.js";
import { runCommand } from "../../system/exec.js";

const actionBody = z.object({
  action: z.enum([...DOCKER_ACTIONS, "cancel", "dismiss"]),
  compose: z.string().min(1).max(4000),
  service: z.string().max(200).optional(),
  container: z.string().max(200).optional(),
  confirm_shared: z.boolean().optional(),
}) satisfies z.ZodType<DockerActionBody>;

/** Docker タブ（この Mac からだけ。スマホの画面にはタブを出さない） */
export function dockerRoutes(app: Hono, { store, docker }: ServerDeps) {
  const { withProject } = lookups(store);
  app.use("/api/projects/:id/docker", localOnly("Docker タブは、この Mac からだけ使えます"));
  app.use("/api/projects/:id/docker/*", localOnly("Docker タブは、この Mac からだけ使えます"));

  // 一覧（?refresh=1 は覚えた compose の設定を捨てて取り直す ［↻］）
  app.get("/api/projects/:id/docker", withProject, async (c) => {
    const refresh = queryOf(c, "refresh") === "1";
    return c.json(refresh ? await docker.refresh(c.var.project) : await docker.list(c.var.project));
  });

  // 見ています（画面が 20 秒ごとに送る。docker events を立て、今の一覧を返す）
  app.post("/api/projects/:id/docker/watch", withProject, async (c) => c.json(await docker.watch(c.var.project)));

  // 操作（待たずに始める。様子は SSE の docker_changed。cancel・dismiss は 204）
  app.post("/api/projects/:id/docker/actions", withProject, async (c) => {
    const body = actionBody.parse(await jsonBody(c));
    await docker.act(c.var.project, body);
    if (body.action === "cancel" || body.action === "dismiss") return c.body(null, 204);
    // 始めたあとの一覧を返す（動いている操作が入っている。画面は届いた一覧をそのまま出す）
    return c.json(await docker.list(c.var.project), 202);
  });

  // エンジンが止まっているときの「OrbStack を開く」など（開くアプリは context の名前から決める。本文では受けない）
  app.post("/api/projects/:id/docker/open-engine", withProject, async (c) => {
    const starter = starterOf(await docker.cli.context());
    if (starter?.kind !== "open") throw new Invalid("開くアプリが分かりません。Docker のアプリを起動してください");
    await runCommand("open", ["-a", starter.app]);
    // OrbStack はアプリが開いたままエンジンだけ止まっていることがある（open -a では起きない）。orb start は起きるまで待つので待たずに流し、画面が 2 秒ごとに調べ直す
    const orb = starter.app === "OrbStack" ? findOrb() : null;
    if (orb) void runCommand(orb, ["start"], { timeout: 120_000 }).catch(() => {});
    return c.body(null, 204);
  });
}
