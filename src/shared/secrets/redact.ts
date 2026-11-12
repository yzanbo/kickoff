/**
 * 鍵らしい値を見つけて伏せる（「AI に渡す」で取った中身に使う。自由に書いたパスワード・📎 のファイル・メモは見ない）。
 * よく使う 8 つの形だけを見る（見つけ方は「秘密の値の漏れを調べる」でも同じものを使う）
 */
interface SecretPattern {
  /** 伏せた跡に書く名前 */
  label: string;
  /** g 付き。value の名前の組があれば、その部分だけを伏せる */
  pattern: RegExp;
}

// 秘密鍵の塊は中に別の形が混ざりうるので先に、URL のパスワードはトークンより先に見る（伏せた跡は後の形に当たらない）
const SECRET_PATTERNS: SecretPattern[] = [
  { label: "秘密鍵", pattern: /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z0-9 ]*PRIVATE KEY-----|$)/g },
  { label: "URL のパスワード", pattern: /\b[a-z][a-z0-9+.-]*:\/\/[^\s:/@]+:(?<value>[^\s/]+)@/gi },
  { label: "AWS のアクセスキー", pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g },
  { label: "GitHub のトークン", pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{36,255}|github_pat_[A-Za-z0-9_]{22,255})\b/g },
  { label: "Stripe の秘密鍵", pattern: /\b[rs]k_live_[0-9A-Za-z]{16,}\b/g },
  { label: "Anthropic の API キー", pattern: /\bsk-ant-[A-Za-z0-9_-]{20,}/g },
  // sk- のあとは数字を含むものだけ（「sk-learn-…」のような名前を伏せない）
  { label: "API キー", pattern: /\bsk-(?=[A-Za-z0-9_-]*\d)[A-Za-z0-9_-]{20,}/g },
  { label: "Slack のトークン", pattern: /\bxox[abposr]-[A-Za-z0-9-]{10,}/g },
  { label: "Google の API キー", pattern: /\bAIza[0-9A-Za-z_-]{35}/g },
];

/** 伏せた跡の文 */
const mask = (label: string) => `[伏せた値: ${label}]`;

/** 鍵らしい値を「[伏せた値: GitHub のトークン]」のように置き換える（count は伏せた数） */
export function redactSecrets(text: string): { text: string; count: number } {
  let count = 0;
  let result = text;
  for (const { label, pattern } of SECRET_PATTERNS) {
    result = result.replace(pattern, (...args) => {
      count++;
      const match = args[0] as string;
      const groups = args.at(-1) as Record<string, string | undefined> | undefined;
      const value = typeof groups === "object" ? groups?.value : undefined;
      return value === undefined ? mask(label) : match.replace(`:${value}@`, `:${mask(label)}@`);
    });
  }
  return { text: result, count };
}
