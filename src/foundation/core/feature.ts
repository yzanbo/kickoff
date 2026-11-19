// 機能の形（CoreFeature）と、組み立てた機能の並び（AssembledCore）。機能は createX(k, deps, env) で作り、
// 組み立て（@/app/core/assemble.ts）が並べ、serve.ts が受け口を登録して始める・止める
import type { Context, Hono } from "hono";
import type { ServerStatus } from "@shared/foundation/server";
import type { DeviceAuth } from "@/foundation/core/http/auth";

/** 機能の名前 */
export type FeatureName =
  | "settings" | "trash" | "projects" | "groups" | "ai" | "chat" | "guard" | "attachments" | "snippets" | "compact"
  | "childChats" | "visuals" | "remoteImages" | "providerSwitch" | "workplaceMove" | "queue" | "userView" | "notifications"
  | "files" | "git" | "worktrees" | "github" | "docker" | "database" | "notes" | "terminal" | "browser" | "ports" | "voice"
  | "devices" | "diagnostics";

/** HTTP の受け口（取り決めに乗せるまでは、Hono に直に登録する関数。access が public なら認証の外に登録する） */
export interface Mountable {
  readonly legacy: (app: Hono) => void;
  readonly access?: "public";
}

export interface CoreFeature<Api = unknown> {
  readonly name: FeatureName;
  /** ほかの機能に出す口（上の機能が createX の deps で受ける） */
  readonly api: Api;
  readonly routes?: readonly Mountable[];
  /** 認証の外のページ（GET） */
  readonly pages?: Readonly<Record<`/${string}`, (c: Context) => Response | Promise<Response>>>;
  /** 待ち受けを始めたあとに呼ぶ（作った順） */
  start?(): void;
  /** 止める（serve.ts の close の順） */
  stop?(): void | Promise<void>;
  /** "first" は、ほかの機能と流れ続けている外部コマンドより先に止める（止める途中の知らせで通知を出さない・エージェントを先に止める） */
  readonly stopPhase?: "first";
}

/** HTTP の土台が機能から受け取る口 */
export interface ServeHooks {
  /** 端末のトークンを呼び主にする（なければ端末は 401） */
  deviceAuth?: DeviceAuth;
  /** /api/status の機能の分（作業中の数・スマホ連携のオン） */
  status(): Pick<ServerStatus, "agents" | "remote_enabled">;
  /** AI の操作ツールの MCP の口（/mcp/<名前>。実行ごとの鍵で受ける） */
  mcp?: { handle(server: string, req: Request): Response | Promise<Response> };
}

/** 組み立てた機能（作った順）と、HTTP の土台への口 */
export interface AssembledCore {
  readonly features: readonly CoreFeature[];
  readonly hooks: ServeHooks;
}
