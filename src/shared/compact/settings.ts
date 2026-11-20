// 圧縮の設定（自動圧縮を始める使用率と、共通の圧縮前指示・圧縮後指示）
import { setting, type SettingTable } from "@shared/foundation/contract/settings";

export const compactSettings = {
  /** 自動圧縮を始めるコンテキストの使用率（%。null なら Claude Code の既定。Claude Code の CLAUDE_AUTOCOMPACT_PCT_OVERRIDE で渡す） */
  auto_compact_pct: setting<number | null>({ default: null }),
  /** 共通の圧縮前指示（会話を圧縮する前に AI に送る指示。プロジェクトの指示があれば、そのあとにつなぐ。null ならなし。@shared/chat/prompts） */
  pre_compact_prompt: setting<string | null>({ default: null }),
  /** 共通の圧縮後指示（会話を圧縮したあと、預かっていた指示より先に AI に送る指示。プロジェクトの指示があれば、そのあとにつなぐ。null ならなし） */
  post_compact_prompt: setting<string | null>({ default: null }),
  /** 共通の圧縮前指示を送るか（false なら文を残したまま送らない） */
  pre_compact_enabled: setting({ default: true }),
  /** 共通の圧縮後指示を送るか（false なら文を残したまま送らない） */
  post_compact_enabled: setting({ default: true }),
} as const satisfies SettingTable;
