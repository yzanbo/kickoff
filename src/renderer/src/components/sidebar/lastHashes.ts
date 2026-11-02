import { SIDEBAR_LAST_HASH_KEY } from "../../storageKeys";

/** プロジェクトごとに、最後に見ていた画面（URL のハッシュ）。横スライドで戻ってきたときに開く */
export type LastHashes = Record<number, string>;

/** 保存した JSON を読む。壊れていたり形が違えば空にする（サイドバー全体が落ちないように） */
export function parseLastHashes(raw: string | null): LastHashes {
  if (!raw) return {};
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).filter(([id, hash]) => /^\d+$/.test(id) && typeof hash === "string"));
  } catch {
    return {};
  }
}

/** アプリを閉じるまで覚える（sessionStorage） */
export const loadLastHashes = (): LastHashes => parseLastHashes(sessionStorage.getItem(SIDEBAR_LAST_HASH_KEY));

export const saveLastHashes = (hashes: LastHashes) => sessionStorage.setItem(SIDEBAR_LAST_HASH_KEY, JSON.stringify(hashes));
