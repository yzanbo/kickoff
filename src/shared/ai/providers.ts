// AI ごとの表（1 つ）: 名前・CLI・色・印・入れ方と「できる・できない」。コア・画面・スマホが同じ表を引く（AI の名前で if を書かない）
import { PROVIDER_IDS, PROVIDER_LABELS, type ProviderId } from "@shared/settings/types";

/**
 * AI によってできたりできなかったりすること。前の 9 つはプロバイダーのメソッドがあること（食い違いは capability.test.ts が見張る）、
 * 後ろは実行・画面の決まり
 */
export const PROVIDER_CAPABILITIES = [
  "fork",
  "rewind_files",
  "subagent_log",
  "commands",
  "models",
  "ask",
  "login",
  "sessions",
  "effort_default",
  /** 利用者がチャットで砂場なしを選べる */
  "sandbox_off",
  /** 砂場の診断（OS の拒否ログ） */
  "sandbox_diagnostics",
  /** 会話を続けたまま AI を替えられる（両方の AI に要る） */
  "switch",
  /** 一覧にないモデル名も通す */
  "any_model",
  /** ファストモード */
  "fast_mode",
  /** モデルごとの推論の深さの既定 */
  "model_effort_default",
  /** プランの使用枠（5 時間・週の窓） */
  "plan_usage",
  /** 上限を超えた支払い（超過分・クレジット） */
  "pay_as_you_go",
] as const;
export type ProviderCapability = (typeof PROVIDER_CAPABILITIES)[number];

export interface ProviderInfo {
  /** 名前（PROVIDER_LABELS と同じ。設定の値の一覧が先に持つ） */
  label: string;
  /** 札に出す短い名前（null なら名前のまま） */
  short: string | null;
  /** ログイン・状態に使う CLI のコマンド */
  cli: string;
  /** 札の色相 */
  hue: number;
  /** アイコン（claude = Claude の印・letter = 頭文字） */
  mark: "claude" | "letter";
  /** CLI が見つからないときの文（入れ方。プロバイダーが自分の文を持つなら null） */
  installHint: string | null;
  /** 本物の実装のときにできること（対応予定の AI のときは空として扱う） */
  capabilities: readonly ProviderCapability[];
  /** つながったかを確かめる先（通信の切断で止まったあと、返事があれば再開する。その AI の API） */
  reachability: string;
}

/** つながったかを確かめる先の既定（Anthropic の API。ほかの AI は、その AI の先が決まるまでこれ） */
const ANTHROPIC_API = "https://api.anthropic.com/";

export const PROVIDERS = {
  claude: {
    label: PROVIDER_LABELS.claude,
    short: "Claude",
    cli: "claude",
    hue: 20,
    mark: "claude",
    installHint: null,
    capabilities: ["fork", "rewind_files", "subagent_log", "commands", "models", "ask", "sessions", "effort_default", "sandbox_off", "sandbox_diagnostics", "switch", "any_model", "fast_mode", "plan_usage", "pay_as_you_go"],
    reachability: ANTHROPIC_API,
  },
  codex: {
    label: PROVIDER_LABELS.codex,
    short: null,
    cli: "codex",
    hue: 160,
    mark: "letter",
    installHint: "codex CLI が見つかりません（brew install codex）",
    capabilities: ["fork", "models", "ask", "login", "sandbox_off", "sandbox_diagnostics", "switch", "model_effort_default", "pay_as_you_go"],
    reachability: "https://api.openai.com/",
  },
  copilot: { label: PROVIDER_LABELS.copilot, short: null, cli: "copilot", hue: 280, mark: "letter", installHint: null, capabilities: ["fork", "models", "ask"], reachability: ANTHROPIC_API },
  cursor: {
    label: PROVIDER_LABELS.cursor,
    short: null,
    cli: "agent",
    hue: 210,
    mark: "letter",
    installHint: "Cursor の CLI（agent）が見つかりません（curl https://cursor.com/install -fsS | bash）",
    capabilities: ["ask"],
    reachability: ANTHROPIC_API,
  },
  gemini: {
    label: PROVIDER_LABELS.gemini,
    short: null,
    cli: "agy",
    hue: 45,
    mark: "letter",
    installHint: "Antigravity CLI（agy）が見つかりません（brew install --cask antigravity-cli）",
    capabilities: ["ask"],
    reachability: ANTHROPIC_API,
  },
} as const satisfies Record<ProviderId, ProviderInfo>;

/** その AI の表にできることがあるか（AI の ID で決まる決まり。本物の実装かは見ない。コアの状態は hasCapability） */
export const providerCan = (id: ProviderId, capability: ProviderCapability): boolean => (PROVIDERS[id].capabilities as readonly ProviderCapability[]).includes(capability);

/** 会話を続けたまま替えられる AI（表で "switch" を持つもの） */
export type SwitchableProvider = { [K in ProviderId]: "switch" extends (typeof PROVIDERS)[K]["capabilities"][number] ? K : never }[ProviderId];

/** 会話を続けたまま替えられる AI の一覧（PROVIDER_IDS の順） */
export const SWITCHABLE_PROVIDERS: readonly SwitchableProvider[] = PROVIDER_IDS.filter((id): id is SwitchableProvider => providerCan(id, "switch"));
