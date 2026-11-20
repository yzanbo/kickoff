// 機能の形（CoreFeature）と、組み立てた機能の並び（AssembledCore）。機能は createX(k, deps, env) で作り、
// 組み立て（@/app/core/assemble.ts）が並べ、serve.ts が受け口を登録して始める・止める
import type { Context } from "hono";
import type { BusEvent } from "@shared/foundation/contract";
import type { ServerStatus } from "@shared/foundation/server";
import type { DeviceAuth } from "@/foundation/core/http/auth";
import type { Mountable } from "@/foundation/core/http/mount";
import type { AiToolGroup } from "@/foundation/core/aiTools/tool";

/** 機能の名前 */
export type FeatureName =
  | "settings" | "trash" | "projects" | "groups" | "ai" | "chat" | "guard" | "attachments" | "snippets" | "compact"
  | "childChats" | "visuals" | "remoteImages" | "providerSwitch" | "workplaceMove" | "queue" | "userView" | "notifications"
  | "files" | "git" | "worktrees" | "github" | "docker" | "database" | "notes" | "terminal" | "browser" | "ports" | "voice"
  | "devices" | "diagnostics";

export interface CoreFeature<Api = unknown> {
  readonly name: FeatureName;
  /** ほかの機能に出す口（上の機能が createX の deps で受ける） */
  readonly api: Api;
  /** HTTP の受け口（取り決めの implement か、まだ乗せていない legacy） */
  readonly routes?: readonly Mountable[];
  /** AI のツールの組（組み立てが全部の機能の分を集め、実行ごとにレジストリで出す） */
  readonly aiTools?: readonly AiToolGroup[];
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
  /** 端末の SSE に届けてよい知らせか（機能の SSE の表の access。この Mac の画面への頼み・閉じた口の知らせは届けない） */
  deviceMaySee(event: BusEvent): boolean;
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
