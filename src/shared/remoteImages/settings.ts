// リンクを開く先と、確認を省くドメインの設定
import { setting, type SettingTable } from "@shared/foundation/contract/settings";
import type { LinkOpenTarget } from "@shared/settings/types";

export const remoteImageSettings = {
  /** Markdown のリンクを開く先（既定は Kickoff のブラウザ） */
  link_open_in: setting<LinkOpenTarget>({ default: "kickoff" }),
  /** 外部リンクを開く前の確認で「今後確認しない」にしたドメイン（小文字。アプリ全体で使う。警告に当たるリンクはこの一覧にあっても確かめる） */
  trusted_link_domains: setting<string[]>({ default: [] }),
} as const satisfies SettingTable;
