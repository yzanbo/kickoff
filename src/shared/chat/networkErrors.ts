// 失敗が通信の切断によるものかの見分け（Node 依存なし）

/** 通信の切断・名前の引けない・時間切れなどを表す文（Claude Code・Node・fetch の言い回し） */
const NETWORK_PATTERNS = [
  /\bECONN(?:RESET|REFUSED|ABORTED)\b/i,
  /\bENOTFOUND\b/i,
  /\bEAI_AGAIN\b/i,
  /\bETIMEDOUT\b/i,
  /\bENETUNREACH\b/i,
  /\bEHOSTUNREACH\b/i,
  /\bUND_ERR_(?:SOCKET|CONNECT_TIMEOUT)\b/i,
  /fetch failed/i,
  /socket hang up/i,
  /network (?:error|is unreachable)/i,
  /connection (?:error|reset|refused|closed)/i,
  /unable to connect/i,
  /getaddrinfo/i,
];

/** エラーの文が、通信の切断によるものか */
export function isNetworkError(message: string | null | undefined): boolean {
  return Boolean(message) && NETWORK_PATTERNS.some((p) => p.test(message!));
}
