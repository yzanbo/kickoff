// つないだ本体（Mac・Windows の Kickoff）の一覧。本体の ID で分け、手元に持つものは本体ごとに分ける（同じ番号のチャットでも別の本体なら別もの）。
// 置き場所は端末の安全な保管庫（SecureStore = Android の Keystore）。保管庫は差し替えられる形にしてテストする
import type { DeviceAccess } from "@shared/types";

/** つないだ本体 1 つ（トークンは別のキーに置く） */
export interface HostRecord {
  host_id: string;
  /** Tailscale Serve の https の URL */
  url: string;
  /** 一覧に出す名前（つないだときの URL のホスト名。あとで変えられる） */
  name: string;
  device_id: number;
  /** できること（つないだときの値。本体で変わったら self で読み直す） */
  access: DeviceAccess;
  paired_at: string;
}

/** 文字を置く保管庫（SecureStore の口と同じ形） */
export interface SecretStore {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
}

const LIST_KEY = "kickoff.hosts";
/** 保管庫のキーに使えるのは英数字と . - _ だけ */
const tokenKey = (hostId: string) => `kickoff.token.${hostId.replace(/[^A-Za-z0-9._-]/g, "_")}`;

/** 一覧に出す名前（URL のホスト名の最初の段。mac.tailnet.ts.net → mac） */
export const hostNameOf = (url: string): string => {
  try {
    return new URL(url).hostname.split(".")[0] || url;
  } catch {
    return url;
  }
};

export class HostRegistry {
  constructor(private readonly store: SecretStore) {}

  async list(): Promise<HostRecord[]> {
    const raw = await this.store.getItemAsync(LIST_KEY);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw) as HostRecord[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  async token(hostId: string): Promise<string | null> {
    return this.store.getItemAsync(tokenKey(hostId));
  }

  /** 足す（同じ本体ならつなぎ直したものとして置き換える） */
  async add(record: HostRecord, token: string): Promise<HostRecord[]> {
    await this.store.setItemAsync(tokenKey(record.host_id), token);
    const next = [...(await this.list()).filter((h) => h.host_id !== record.host_id), record];
    await this.store.setItemAsync(LIST_KEY, JSON.stringify(next));
    return next;
  }

  async update(hostId: string, patch: Partial<Omit<HostRecord, "host_id">>): Promise<HostRecord[]> {
    const next = (await this.list()).map((h) => (h.host_id === hostId ? { ...h, ...patch } : h));
    await this.store.setItemAsync(LIST_KEY, JSON.stringify(next));
    return next;
  }

  /** 外す（トークンも消す。本体の側の登録は、本体の設定で取り消す） */
  async remove(hostId: string): Promise<HostRecord[]> {
    await this.store.deleteItemAsync(tokenKey(hostId));
    const next = (await this.list()).filter((h) => h.host_id !== hostId);
    await this.store.setItemAsync(LIST_KEY, JSON.stringify(next));
    return next;
  }
}
