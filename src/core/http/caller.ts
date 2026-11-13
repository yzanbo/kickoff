// 呼び主（API を呼んだのがこの Mac の画面か、つないだ端末か）。どのトークンで来たかだけで決める
// （接続の相手のアドレス・Tailscale などの見出しは信じない。Tailscale Serve は 127.0.0.1 から転送してくるため）
import { createHash } from "node:crypto";
import type { Context } from "hono";
import type { Device } from "@shared/types";

/** 呼び主: この Mac（本体のトークン。画面の Cookie）か、つないだ端末（端末のトークン） */
export type Caller = { kind: "host" } | { kind: "device"; device: Device };

/** 端末のトークンの hash（端末の表にはこれだけを置く） */
export const hashToken = (token: string): string => createHash("sha256").update(token).digest("hex");

const CALLER_KEY = "caller";

/** 認証のミドルウェアが呼び主を覚える */
export function setCaller(c: Context, caller: Caller): void {
  c.set(CALLER_KEY as never, caller as never);
}

/** 呼び主（認証を通った /api/* だけ。覚えていなければ、通さずに失敗にする） */
export function callerOf(c: Context): Caller {
  const caller = c.get(CALLER_KEY as never) as Caller | undefined;
  if (!caller) throw new Error("呼び主が決まっていません（認証のミドルウェアを通っていない）");
  return caller;
}
