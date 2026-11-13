import type { Hono } from "hono";
import { z } from "zod";
import type { PortStopBody, PortStopResult } from "@shared/types";
import type { ServerDeps } from "../server.js";
import { jsonBody, queryOf } from "../input.js";
import { localOnly } from "../thisMac.js";

const stopBody = z.object({
  pid: z.number().int().positive(),
  command: z.string().max(100_000),
  force: z.boolean().optional(),
}) satisfies z.ZodType<PortStopBody>;

/** ポートを使っているプロセス（この Mac からだけ。コマンドの全文を返し、プロセスを止められるため） */
export function portsRoutes(app: Hono, { ports }: ServerDeps) {
  app.use("/api/ports", localOnly("ポートを使っているプロセスは、この Mac からだけ見られます"));
  app.use("/api/ports/*", localOnly("ポートを使っているプロセスは、この Mac からだけ見られます"));

  // 調べる（窓を開いた・↻。調べたら SSE の ports_changed でほかの窓に知らせる）。?cached=1 は最後に調べた一覧（知らせを受けた・起動したとき）
  app.get("/api/ports", async (c) => c.json({ processes: queryOf(c, "cached") === "1" ? await ports.latest() : await ports.check() }));

  // 止める（SIGTERM。force なら SIGKILL）。少し待って終わったかを返す
  app.post("/api/ports/stop", async (c) => {
    const body = stopBody.parse(await jsonBody(c));
    const stopped = await ports.stop(body.pid, body.command, body.force ?? false);
    return c.json({ stopped } satisfies PortStopResult);
  });
}
