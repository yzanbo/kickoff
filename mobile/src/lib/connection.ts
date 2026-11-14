// 本体とのつながりの様子と、その決め方（純粋な関数でテストする = connection.test.ts）。
// アプリと本体は別々に更新されるので、話が通じない・つなぐ先が違うときは、つなぎ直しを繰り返さずに理由を出して止める（壊れずに断る）
import type { ServerHello } from "@shared/types";
import { MOBILE_OFF } from "@shared/types";
import type { ApiMismatch } from "@shared/api/version";
import { hostMismatch } from "./version";

/** つながりの様子 */
export type SessionState =
  | { kind: "connecting" }
  | { kind: "open" }
  /** 切れた（つなぎ直しを待っている。reason は最後の理由） */
  | { kind: "retrying"; reason: string }
  /** 話が通じない（どちらかを更新するまで、つなぎ直さない） */
  | { kind: "mismatch"; mismatch: ApiMismatch }
  /** 本体のスマホ連携がオフ（オンに戻るまで、間を空けてつなぎ直す） */
  | { kind: "mobile_off" }
  /** 端末を取り消された（つなぎ直すにはペアリングから） */
  | { kind: "revoked" }
  /** つなぐ先が、つないだときと別の本体（DB を作り直した・URL がほかの Mac を指す。つなぎ直すにはペアリングから） */
  | { kind: "other_host" }
  | { kind: "stopped" };

/** つなぎ直さない様子（利用者が直すまで止めておく） */
export const isFinal = (s: SessionState) => s.kind === "mismatch" || s.kind === "revoked" || s.kind === "other_host";

/** SSE の頼みを断られたときの様子（応答の状態と本文の印から） */
export function failureStateOf(status: number, body: { code?: string; error?: string } | null): SessionState {
  if (status === 401) return { kind: "revoked" };
  if (status === 403 && body?.code === MOBILE_OFF) return { kind: "mobile_off" };
  if (status === 426) return { kind: "mismatch", mismatch: "client_too_old" };
  return { kind: "retrying", reason: body?.error ?? `本体が ${status} を返しました` };
}

/**
 * SSE の最初の行 hello から、つながってよいか: 版が合わない・版を知らせない古い本体なら mismatch、
 * 本体の ID がつないだときと違えば other_host、通じれば open
 */
export function helloStateOf(hello: Partial<ServerHello> | null, hostId: string): SessionState {
  if (!hello || typeof hello.api_version !== "number" || typeof hello.min_client_api_version !== "number") return { kind: "mismatch", mismatch: "host_too_old" };
  const mismatch = hostMismatch({ api_version: hello.api_version, min_client_api_version: hello.min_client_api_version });
  if (mismatch) return { kind: "mismatch", mismatch };
  if (hello.host_id !== hostId) return { kind: "other_host" };
  return { kind: "open" };
}
