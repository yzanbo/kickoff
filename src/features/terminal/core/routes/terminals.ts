import { randomUUID } from "node:crypto";
import type { Hono } from "hono";
import { upgradeWebSocket } from "@hono/node-server";
import { z } from "zod";
import type { TerminalClientMessage, TerminalCreateBody, TerminalCreated, TerminalOpenBody, TerminalOpened, TerminalOwnerBody, TerminalServerMessage, TerminalTab } from "@shared/terminal/types";
import { callerOf, type Caller } from "@/foundation/core/http/caller";
import { Invalid, NotFound } from "@/foundation/core/errors";
import { jsonBody } from "@/foundation/core/http/input";
import { lookups } from "@/foundation/core/http/lookups";
import { resolveWorkdir } from "@/foundation/core/workplace/worktrees";
import type { ChatStoreDeps } from "@/features/chat/core/index";
import type { Bus } from "@/foundation/core/bus";
import type { TerminalSessions } from "@/features/terminal/core/sessions";

const size = z.number().int().min(2).max(1000);
const createSchema = z.object({ worktree_path: z.string().min(1).nullable(), cols: size, rows: size }) satisfies z.ZodType<TerminalCreateBody>;
/** この Mac の画面のタブのシェル（持ち主は画面の印 wc:<WebContents の ID>。端末の印 device: は名乗れない） */
const openSchema = z.object({
  key: z.string().min(1).max(200),
  cwd: z.string().max(4000),
  cols: size,
  rows: size,
  owner: z.string().regex(/^wc:\d+$/),
  start: z.object({ command: z.string().max(20_000).nullable(), env: z.record(z.string(), z.string()).nullable() }).nullable(),
  meta: z.object({ project_id: z.number().int().nullable(), title: z.string().max(500) }).nullable(),
}) satisfies z.ZodType<TerminalOpenBody>;
const ownerSchema = z.object({ owner: z.string().regex(/^wc:\d+$/) }) satisfies z.ZodType<TerminalOwnerBody>;
const clientMessage = z.union([z.object({ type: z.literal("input"), data: z.string().max(100_000) }), z.object({ type: z.literal("resize"), cols: size, rows: size })]) satisfies z.ZodType<TerminalClientMessage>;

/** シェルの持ち主の印（この Mac の画面のタブは、POST /api/terminals で渡したその画面の印 wc:<ID>） */
export const ownerOf = (caller: Caller) => (caller.kind === "device" ? `device:${caller.deviceId}` : "host");

/** その呼び主が、そのシェルを止めてよいか（この Mac は何でも。端末は自分が作ったものだけ） */
const mayClose = (caller: Caller, owner: string | null) => caller.kind === "host" || owner === ownerOf(caller);

/**
 * 内蔵ターミナルを API から使う口（この Mac の画面のパネルのタブと、スマホのターミナル。
 * シェルはコアのプロセスにあるので、この Mac の画面もメインプロセスの IPC でなくここを通す）。
 * シェルはコアの TerminalSessions で動く。キーの入力・出力は WebSocket（細かく行き来するため。この口だけ）。
 * 見るだけの端末は、一覧と WebSocket で見るだけで、シェルを作る・止める（403）・キーを送る（捨てる）はできない
 */
/** つないだ端末（devices の店。ターミナルより上の機能なので形だけで受ける。名前と、打てるか） */
export interface TerminalDevices {
  get(id: number): { name: string; access: string } | null;
}

export function terminalRoutes(app: Hono, { store, terminals, bus }: { store: Pick<ChatStoreDeps, "settings" | "projects" | "chats" | "groups"> & { devices: TerminalDevices }; terminals: TerminalSessions; bus: Bus }) {
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
    const cwd = await resolveWorkdir(project.repo_path, body.worktree_path ?? undefined);
    const key = `api:${randomUUID()}`;
    const caller = callerOf(c);
    const device = caller.kind === "device" ? store.devices.get(caller.deviceId) : null;
    // 作るだけ（出力は、あとでつなぐ WebSocket に届く。それまでの分は snapshot に入る）
    const placeholder = { id: `create:${key}`, data: () => {}, exit: () => {} };
    await terminals.open({ key, cwd, cols: body.cols, rows: body.rows, client: placeholder, owner: ownerOf(caller), meta: { projectId: project.id, title: device ? `ターミナル（${device.name}）` : "ターミナル" } });
    terminals.detach(key, placeholder.id);
    return c.json({ key } satisfies TerminalCreated, 201);
  });

  // この Mac の画面のタブのシェルを用意する（あればつなぎ直し = meta・持ち主を覚え直す。なければ cwd で始める）。出力はこのあと WebSocket で受ける。
  // 端末からは使えない（端末に開かない。好きなフォルダ・コマンドで始められるため）
  app.post("/api/terminals", async (c) => {
    const body = openSchema.parse(await jsonBody(c));
    const placeholder = { id: `open:${body.key}`, data: () => {}, exit: () => {} };
    const start = body.start ? { command: body.start.command ?? undefined, env: body.start.env ?? undefined } : undefined;
    const meta = body.meta ? { projectId: body.meta.project_id, title: body.meta.title } : undefined;
    const { created } = await terminals.open({ key: body.key, cwd: body.cwd, cols: body.cols, rows: body.rows, client: placeholder, owner: body.owner, start, meta });
    terminals.detach(body.key, placeholder.id);
    return c.json({ created } satisfies TerminalOpened, created ? 201 : 200);
  });

  // この Mac の画面のタブのシェルの持ち主だけを替える（タブを別ウィンドウへ移す・戻すとき。移す元の画面が閉じても止めさせない）。
  // シェルがなければ 404 で、始めない（終わったコマンドのタブを流し直さないため）。端末からは使えない（端末に開かない）
  app.put("/api/terminals/:key/owner", async (c) => {
    const key = c.req.param("key");
    const body = ownerSchema.parse(await jsonBody(c));
    if (!terminals.setOwner(key, body.owner)) throw new NotFound("ターミナルが見つかりません（もう終わったかもしれません）");
    return c.body(null, 204);
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
      // 打てるかは送るたびに読み直す（つないだあとで「見るだけ」に変えた・取り消した端末の入力は捨てる）
      const canType = () => {
        if (caller.kind === "host") return true;
        return store.devices.get(caller.deviceId)?.access === "full" && store.settings.get().remote_enabled;
      };
      let unsubscribe = () => {};
      let closed = false;
      return {
        onOpen(_event, ws) {
          // 端末を取り消した・スマホ連携をオフにしたら、つながったままの WebSocket も切る
          if (caller.kind === "device") {
            unsubscribe = bus.subscribe((e) => {
              if ((e.type === "devices" && !store.devices.get(caller.deviceId)) || (e.type === "settings" && !e.settings.remote_enabled)) ws.close();
            });
          }
          const send = (message: TerminalServerMessage) => ws.send(JSON.stringify(message));
          const client = {
            id: clientId,
            data: (data: string) => send({ type: "data", data }),
            exit: (exitCode: number) => {
              send({ type: "exit", exit_code: exitCode });
              ws.close();
            },
          };
          // あるシェルにつなぐだけ（終わったシェルを始め直さない。つないですぐ切ったら足さない）
          void terminals.attach(key, client).then((attached) => {
            if (attached) send({ type: "snapshot", data: attached.snapshot });
            else if (!closed) ws.close();
          });
        },
        onMessage(event) {
          let parsed: TerminalClientMessage;
          try {
            parsed = clientMessage.parse(JSON.parse(String(event.data)));
          } catch {
            return;
          }
          if (parsed.type === "input") {
            if (canType()) terminals.write(key, parsed.data);
            return;
          }
          // 大きさを変えるのは、この Mac の画面と、シェルの持ち主の端末だけ（この Mac の画面のタブを、スマホの小さな画面に合わせて崩さない）
          if (canType() && (caller.kind === "host" || terminals.ownerOf(key) === ownerOf(caller))) terminals.resize(key, parsed.cols, parsed.rows);
        },
        onClose() {
          closed = true;
          unsubscribe();
          terminals.detach(key, clientId);
        },
      };
    }),
  );
}
