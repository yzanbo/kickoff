// 外の画像を 1 つ取ってくる。手元のネットワークへは行かない・画像だけ・大きさと時間の上限つき
import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import type { LookupFunction } from "node:net";
import { Invalid } from "../http/errors.js";
import { isBlockedAddress } from "./addresses.js";

/** 取ってきた画像 */
export interface FetchedImage {
  contentType: string;
  body: Buffer;
}

export interface FetchImageOptions {
  /** 1 枚の上限（バイト） */
  maxBytes: number;
  /** 待つ時間の上限（ミリ秒。つないでから読み終えるまで） */
  timeoutMs: number;
  /** 転送をたどる回数の上限 */
  maxRedirects: number;
  /** 行き先にしないアドレスか（省けば isBlockedAddress。テストは手元のサーバーを通すものに差し替える） */
  blocked?: (address: string) => boolean;
}

/** 外の画像を取る口（テストで差し替える） */
export type ImageFetcher = (url: string) => Promise<FetchedImage>;

const REDIRECTS = new Set([301, 302, 303, 307, 308]);
/** 名乗り（ほかのアプリのふりをしない。Cookie・Kickoff の鍵は付けない） */
const USER_AGENT = "Kickoff";

/** 名前を IP に解いたあとに確かめる lookup（解いた結果のどれかが手元のネットワークなら断る。つなぐのは確かめたアドレス） */
function guardedLookup(blocked: (address: string) => boolean): LookupFunction {
  return (hostname, options, callback) => {
    dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
      if (err) return callback(err, "", 0);
      const list = addresses as dns.LookupAddress[];
      if (list.length === 0 || list.some((a) => blocked(a.address))) {
        return callback(Object.assign(new Error("手元のネットワークのアドレスには取りに行きません"), { code: "KICKOFF_BLOCKED" }), "", 0);
      }
      if (options.all) return callback(null, list);
      callback(null, list[0].address, list[0].family);
    });
  };
}

/** 1 回の頼み（転送なら次の URL、画像なら中身） */
function requestOnce(url: URL, opts: FetchImageOptions): Promise<{ redirect: string } | FetchedImage> {
  // IP アドレスを直に書いた URL は lookup を通らないので、ここで確かめる
  const blocked = opts.blocked ?? isBlockedAddress;
  const literal = url.hostname.replace(/^\[|\]$/g, "");
  if (/^[\d.]+$|:/.test(literal) && blocked(literal)) {
    return Promise.reject(new Invalid("手元のネットワークのアドレスには取りに行きません"));
  }
  const client = url.protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    const req = client.get(url, { headers: { "user-agent": USER_AGENT, accept: "image/*" }, lookup: guardedLookup(blocked) }, (res) => {
      const status = res.statusCode ?? 0;
      if (REDIRECTS.has(status) && res.headers.location) {
        res.resume();
        return resolve({ redirect: new URL(res.headers.location, url).href });
      }
      if (status !== 200) {
        res.resume();
        return reject(new Invalid(`画像を読み込めませんでした（HTTP ${status}）`));
      }
      const type = String(res.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase();
      if (!type.startsWith("image/")) {
        res.resume();
        return reject(new Invalid("画像ではありません"));
      }
      const declared = Number(res.headers["content-length"]);
      if (Number.isFinite(declared) && declared > opts.maxBytes) {
        res.resume();
        return reject(new Invalid("画像が大きすぎます"));
      }
      const chunks: Buffer[] = [];
      let size = 0;
      res.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > opts.maxBytes) {
          req.destroy();
          return reject(new Invalid("画像が大きすぎます"));
        }
        chunks.push(chunk);
      });
      res.on("end", () => resolve({ contentType: type, body: Buffer.concat(chunks) }));
      res.on("error", reject);
    });
    req.setTimeout(opts.timeoutMs, () => req.destroy(new Invalid("画像の読み込みが時間内に終わりませんでした")));
    req.on("error", (e: NodeJS.ErrnoException) => {
      if (e instanceof Invalid) return reject(e);
      if (e.code === "KICKOFF_BLOCKED") return reject(new Invalid(e.message));
      reject(new Invalid(`画像を読み込めませんでした（${e.message}）`));
    });
  });
}

/** 外の画像を取る（http・https だけ。転送のたびに行き先を確かめ直す） */
export async function fetchRemoteImage(href: string, opts: FetchImageOptions): Promise<FetchedImage> {
  let url = new URL(href);
  for (let hop = 0; ; hop++) {
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new Invalid("http・https の画像だけを読み込みます");
    if (url.username || url.password) throw new Invalid("ユーザー名・パスワードの入った URL は読み込みません");
    const res = await requestOnce(url, opts);
    if (!("redirect" in res)) return res;
    if (hop >= opts.maxRedirects) throw new Invalid("転送が多すぎます");
    url = new URL(res.redirect);
  }
}
