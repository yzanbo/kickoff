// スマホ連携のペアリング: この Mac の画面が使い捨ての番号を出し、端末が番号で頼み、Mac の画面で確かめてから端末のトークンを 1 回だけ渡す。
// 番号・頼みはメモリにだけ持つ（アプリを終えたら消える）。端末は store.devices に hash で残る
import { randomBytes, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { PAIRING_CODE_TTL_MS, type BusEvent, type PairingClaimResult, type PairingPollResult, type PairingRequest, type PairingState } from "@shared/types";
import type { Store } from "../db/store.js";
import { hashToken } from "../http/caller.js";
import { Conflict, Invalid, NotFound } from "../http/errors.js";

/** 番号を続けて間違えたら、その番号を捨てる回数（当てずっぽうで頼み続けさせない） */
const MAX_WRONG_CLAIMS = 5;
/** 名前の長さの上限 */
export const DEVICE_NAME_MAX = 60;

interface PendingRequest extends PairingRequest {
  /** 結果を聞くときに添える鍵の hash（頼んだ端末だけが知る） */
  secretHash: string;
  status: "pending" | "approved" | "denied";
  /** 確かめたら作る端末のトークン（結果を聞かれたら 1 回だけ渡して捨てる） */
  token: string | null;
  deviceId: number | null;
  /** この時刻を過ぎたら捨てる */
  expiresAt: number;
}

interface PairingOptions {
  store: Store;
  publish: (event: BusEvent) => void;
  /** 時計（テストで進める） */
  now?: () => number;
}

const sameHash = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export class PairingCenter {
  private code: { value: string; expiresAt: number; wrong: number } | null = null;
  private readonly requests = new Map<string, PendingRequest>();
  private readonly store: Store;
  private readonly publish: (event: BusEvent) => void;
  private readonly now: () => number;

  constructor({ store, publish, now = Date.now }: PairingOptions) {
    this.store = store;
    this.publish = publish;
    this.now = now;
  }

  /** いまの様子（期限の切れたものは捨ててから） */
  state(): PairingState {
    this.sweep();
    const pending = [...this.requests.values()].find((r) => r.status === "pending") ?? null;
    return {
      code: this.code?.value ?? null,
      expires_at: this.code ? new Date(this.code.expiresAt).toISOString() : null,
      url: this.store.settings.get().mobile_url,
      host_id: this.store.databaseId,
      request: pending && { id: pending.id, name: pending.name, created_at: pending.created_at },
    };
  }

  /** 新しい番号を出す（前の番号と、確かめを待っている頼みは捨てる） */
  start(): PairingState {
    this.code = { value: String(randomInt(0, 1_000_000)).padStart(6, "0"), expiresAt: this.now() + PAIRING_CODE_TTL_MS, wrong: 0 };
    for (const [id, r] of this.requests) if (r.status === "pending") this.requests.delete(id);
    return this.changed();
  }

  /** やめる（番号と、確かめを待っている頼みを捨てる） */
  cancel(): PairingState {
    this.code = null;
    for (const [id, r] of this.requests) if (r.status === "pending") this.requests.delete(id);
    return this.changed();
  }

  /** 端末が番号で頼む（認証なし。番号が違う・期限切れなら断る。続けて間違えたら番号を捨てる） */
  claim(code: string, name: string): PairingClaimResult {
    this.sweep();
    const current = this.code;
    if (!current) throw new NotFound("つなぐための番号がありません。Mac の Kickoff の設定「スマホ連携」で「端末をつなぐ」を押してください");
    if (!sameHash(hashToken(code.replace(/\D/g, "")), hashToken(current.value))) {
      current.wrong++;
      if (current.wrong >= MAX_WRONG_CLAIMS) {
        this.code = null;
        this.changed();
      }
      throw new Invalid("番号が違います");
    }
    if ([...this.requests.values()].some((r) => r.status === "pending")) throw new Conflict("ほかの端末が確かめを待っています。Mac の画面で答えてから、もう一度試してください");
    const secret = randomBytes(24).toString("base64url");
    const request: PendingRequest = {
      id: randomUUID(),
      name: name.trim().slice(0, DEVICE_NAME_MAX) || "名前のない端末",
      created_at: new Date(this.now()).toISOString(),
      secretHash: hashToken(secret),
      status: "pending",
      token: null,
      deviceId: null,
      expiresAt: current.expiresAt,
    };
    this.requests.set(request.id, request);
    this.changed();
    return { request_id: request.id, secret, host_id: this.store.databaseId };
  }

  /** Mac の画面で「つなぐ」を押した: 端末を作り、トークンを結果を聞かれるまで預かる。番号は使い終える */
  approve(id: string): PairingState {
    const request = this.pendingRequest(id);
    const token = randomBytes(32).toString("base64url");
    const device = this.store.devices.create(request.name, hashToken(token));
    Object.assign(request, { status: "approved", token, deviceId: device.id, expiresAt: this.now() + PAIRING_CODE_TTL_MS });
    this.code = null;
    this.publish({ type: "devices" });
    return this.changed();
  }

  /** Mac の画面で「断る」を押した（番号はそのまま。ほかの端末がつなげる） */
  deny(id: string): PairingState {
    this.pendingRequest(id).status = "denied";
    return this.changed();
  }

  /** 端末が結果を聞く（鍵が合わなければ 404。つないだらトークンを 1 回だけ渡し、頼みを捨てる） */
  poll(id: string, secret: string): PairingPollResult {
    this.sweep();
    const request = this.requests.get(id);
    if (!request || !sameHash(hashToken(secret), request.secretHash)) return { status: "expired" };
    if (request.status === "pending") return { status: "pending" };
    this.requests.delete(id);
    if (request.status === "denied") return { status: "denied" };
    return { status: "approved", token: request.token!, device_id: request.deviceId!, host_id: this.store.databaseId };
  }

  /** 端末を取り消す（そのトークンはすぐ使えなくなる） */
  revoke(deviceId: number): void {
    if (!this.store.devices.remove(deviceId)) throw new NotFound("端末が見つかりません");
    this.publish({ type: "devices" });
  }

  private pendingRequest(id: string): PendingRequest {
    this.sweep();
    const request = this.requests.get(id);
    if (!request || request.status !== "pending") throw new NotFound("確かめを待っている頼みが見つかりません（期限が切れたか、もう答えました）");
    return request;
  }

  /** 期限の切れた番号・頼みを捨てる（つないだのに結果を聞かれなかった端末は、表から消す） */
  private sweep(): void {
    const now = this.now();
    if (this.code && this.code.expiresAt <= now) this.code = null;
    for (const [id, r] of this.requests) {
      if (r.expiresAt > now) continue;
      this.requests.delete(id);
      if (r.status === "approved" && r.deviceId !== null && this.store.devices.remove(r.deviceId)) this.publish({ type: "devices" });
    }
  }

  private changed(): PairingState {
    const state = this.state();
    this.publish({ type: "pairing", state });
    return state;
  }
}
