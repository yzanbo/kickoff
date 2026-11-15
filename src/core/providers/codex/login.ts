import type { LoginStartParams, LoginStartResponse } from "./protocol.js";
import type { SessionOpts } from "./session.js";
import { openSession } from "./session.js";

/**
 * Codex の Sign in with ChatGPT（メモの仕様書「0021」の Q12。OpenAI 公式のログイン）の骨組み。本物のログインはまだしない。
 * 道: app-server の account/login/start（type: chatgpt）。Codex が OAuth の戻り先（この Mac の中のポート）を受け、ログインの URL を返すので、
 * Kickoff は利用者のブラウザでその URL を開き、account/login/completed の知らせを待つ。資格情報は Codex が自分の置き場（~/.codex）に書き、
 * `codex login` と同じものになる（Codex の CLI・ほかのアプリと共有）。
 * もう 1 つの道（chatgptAuthTokens = Kickoff が OAuth を自分で行い、トークンを secrets の codex_chatgpt_tokens に置いて渡す「外の資格情報」の形）は、
 * Kickoff の OAuth のクライアントの登録（OpenAI の承認）が要り、トークンの更新の頼み（account/chatgptAuthTokens/refresh）にも答え続けることになるので、
 * いまは取らない（Q12 の「承認が要るなら codex login 相当に戻す」）
 */

export interface ChatgptLogin {
  /** 利用者のブラウザで開く URL */
  authUrl: string;
  /** ログインの終わり（成功なら true。失敗なら理由で reject） */
  completed: Promise<true>;
  /** やめる（app-server を止める） */
  cancel(): void;
}

/** ログインの終わりを待つ長さ（ブラウザでの操作の分） */
const LOGIN_TIMEOUT_MS = 10 * 60_000;

/** Sign in with ChatGPT を始める（ログインの URL と、終わりを待つ口を返す） */
export async function startChatgptLogin(opts: Omit<SessionOpts, "onNotification" | "onClosed">): Promise<ChatgptLogin> {
  let settle!: { resolve: (v: true) => void; reject: (e: Error) => void };
  const completed = new Promise<true>((resolve, reject) => (settle = { resolve, reject }));
  let loginId: string | null = null;
  const rpc = await openSession({
    ...opts,
    onNotification: (method, raw) => {
      if (method !== "account/login/completed") return;
      const p = raw as { loginId: string | null; success: boolean; error: string | null };
      if (loginId && p.loginId && p.loginId !== loginId) return;
      if (p.success) settle.resolve(true);
      else settle.reject(new Error(p.error ?? "ログインできませんでした"));
    },
    onClosed: (reason) => settle.reject(new Error(reason)),
  });
  const timer = setTimeout(() => settle.reject(new Error("ログインが時間内に終わりませんでした")), LOGIN_TIMEOUT_MS);
  timer.unref?.();
  void completed.finally(() => {
    clearTimeout(timer);
    rpc.close();
  }).catch(() => {});
  try {
    const res = await rpc.request<LoginStartResponse>("account/login/start", { type: "chatgpt" } satisfies LoginStartParams);
    if (res.type !== "chatgpt" || !("authUrl" in res)) throw new Error("Codex がログインの URL を返しませんでした");
    loginId = (res as { loginId: string }).loginId;
    return {
      authUrl: (res as { authUrl: string }).authUrl,
      completed,
      cancel: () => {
        if (loginId) void rpc.request("account/login/cancel", { loginId }).catch(() => {});
        settle.reject(new Error("ログインをやめました"));
      },
    };
  } catch (e) {
    settle.reject(e instanceof Error ? e : new Error(String(e)));
    throw e;
  }
}
