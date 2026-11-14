import { randomUUID } from "node:crypto";
import type { Hono } from "hono";
import { upgradeWebSocket } from "@hono/node-server";
import { z } from "zod";
import type { TerminalClientMessage, TerminalCreateBody, TerminalCreated, TerminalServerMessage, TerminalTab } from "@shared/types";
import { callerOf, type Caller } from "../caller.js";
import { Invalid, NotFound } from "../errors.js";
import { jsonBody } from "../input.js";
import { lookups } from "../lookups.js";
import { requireWorktree } from "../workdir.js";
import type { ServerDeps } from "../server.js";

const size = z.number().int().min(2).max(1000);
const createSchema = z.object({ worktree_path: z.string().min(1).nullable(), cols: size, rows: size }) satisfies z.ZodType<TerminalCreateBody>;
const clientMessage = z.union([z.object({ type: z.literal("input"), data: z.string().max(100_000) }), z.object({ type: z.literal("resize"), cols: size, rows: size })]) satisfies z.ZodType<TerminalClientMessage>;

/** シェルの持ち主の印（この Mac の画面がメインプロセスの IPC から作ったものは、その画面の印） */
export const ownerOf = (caller: Caller) => (caller.kind === "device" ? `device:${caller.device.id}` : "host");

/** その呼び主が、そのシェルを止めてよいか（この Mac は何でも。端末は自分が作ったものだけ） */
const mayClose = (caller: Caller, owner: string | null) => caller.kind === "host" || owner === ownerOf(caller);

/**
 * 内蔵ターミナルを API から使う口（スマホのターミナル。2026-11-14 に利用者と決めた）。シェルはコアの TerminalSessions で動き、
 * この Mac の画面のタブ（IPC で作ったもの）にもつなげる。キーの入力・出力は WebSocket（細かく行き来するため。この口だけ）。
 * 見るだけの端末は、一覧と WebSocket で見るだけで、シェルを作る・止める（403）・キーを送る（捨てる）はできない
 */
export function terminalRoutes(app: Hono, { store, terminals }: ServerDeps) {
  const { withProject } = lookups(store);

  // 動いているシェルのタブ（?project_id= でそのプロジェクトのものだけ）
  app.get("/api/terminals", (c) => {
    const projectId = c.req.query("project_id");
    const tabs: TerminalTab[] = terminals.list();
    return c.json(projectId ? tabs.filter((t) => t.project_id === Number(projectId)) : tabs);
  });

  // 新しいシェルを、プロジェクトの作業場所（本体・ワークツリー）で始める → キー（このキーで WebSocket につなぐ）
  app.post("/api/projects/:id/terminals", withProject, async (c) => {
    const body = createSchema.parse(await jsonBody(c));
    const project = c.var.project;
    const cwd = (await requireWorktree(project.repo_path, body.worktree_path ?? undefined))?.path ?? project.repo_path;
    const key = `api:${randomUUID()}`;
    const caller = callerOf(c);
    // 作るだけ（出力は、あとでつなぐ WebSocket に届く。それまでの分は snapshot に入る）
    const placeholder = { id: `create:${key}`, data: () => {}, exit: () => {} };
    await terminals.open({ key, cwd, cols: body.cols, rows: body.rows, client: placeholder, owner: ownerOf(caller), meta: { projectId: project.id, title: caller.kind === "device" ? `ターミナル（${caller.device.name}）` : "ターミナル" } });
    terminals.detach(key, placeholder.id);
    return c.json({ key } satisfies TerminalCreated, 201);
  });

  // シェルを止める（端末は自分が作ったものだけ）
  app.delete("/api/terminals/:key", (c) => {
    const key = c.req.param("key");
    if (!terminals.has(key)) throw new NotFound("ターミナルが見つかりません（もう終わったかもしれません）");
    if (!mayClose(callerOf(c), terminals.ownerOf(key))) throw new Invalid("この Mac で開いたターミナルは、この Mac で閉じてください");
    terminals.close(key);
    return c.body(null, 204);
  });

  // つなぐ（WebSocket）。最初にいまの画面の内容（snapshot）、そのあと出力（data）・終わり（exit）が届く
  app.get(
    "/api/terminals/:key/ws",
    async (c, next) => {
      if (!terminals.has(c.req.param("key"))) throw new NotFound("ターミナルが見つかりません（もう終わったかもしれません）");
      return next();
    },
    upgradeWebSocket((c) => {
      const key = c.req.param("key")!;
      const caller = callerOf(c);
      const clientId = `ws:${randomUUID()}`;
      const canType = caller.kind === "host" || caller.device.access === "full";
      const cols = Number(c.req.query("cols")) || 80;
      const rows = Number(c.req.query("rows")) || 24;
      return {
        onOpen(_event, ws) {
          const send = (message: TerminalServerMessage) => ws.send(JSON.stringify(message));
          const client = {
            id: clientId,
            data: (data: string) => send({ type: "data", data }),
            exit: (exitCode: number) => {
              send({ type: "exit", exit_code: exitCode });
              ws.close();
            },
          };
          void terminals.open({ key, cwd: "", cols, rows, client }).then(({ snapshot }) => send({ type: "snapshot", data: snapshot }));
        },
        onMessage(event) {
          let parsed: TerminalClientMessage;
          try {
            parsed = clientMessage.parse(JSON.parse(String(event.data)));
          } catch {
            return;
          }
          if (parsed.type === "input") {
            if (canType) terminals.write(key, parsed.data);
            return;
          }
          // 大きさを変えるのはシェルの持ち主だけ（この Mac の画面のタブを、スマホの小さな画面に合わせて崩さない）
          if (terminals.ownerOf(key) === ownerOf(caller)) terminals.resize(key, parsed.cols, parsed.rows);
        },
        onClose() {
          terminals.detach(key, clientId);
        },
      };
    }),
  );
}
