import { DB_ENGINE_LABELS, DB_ENVIRONMENT_LABELS, type DbConnection } from "../types/database";

// DB につながらなかったときの案内（要件 5.12 の段階 2）: 失敗の文から種類を見分け、よくある原因と直し方を出す。
// 本番などの DB は、セキュリティのためにわざと「手順を踏まないとつながらない」ようにしてあることが多いので、原因にそれを入れる

export const DB_FAILURE_KINDS = ["timeout", "refused", "dns", "auth", "not_allowed", "ssl", "no_database", "file", "other"] as const;
export type DbFailureKind = (typeof DB_FAILURE_KINDS)[number];

export const DB_FAILURE_LABELS: Record<DbFailureKind, string> = {
  timeout: "時間切れ・届かない",
  refused: "つなぎ先で断られた（ポートが開いていない）",
  dns: "ホストの名前が引けない",
  auth: "ユーザーかパスワードが違う",
  not_allowed: "この場所からの接続を許していない",
  ssl: "SSL のエラー",
  no_database: "DB がない",
  file: "SQLite のファイルを開けない",
  other: "つながらない",
};

/** 種類ごとのよくある原因と直し方 */
export const DB_FAILURE_CAUSES: Record<DbFailureKind, string[]> = {
  timeout: [
    "IP の許可（AWS のセキュリティグループ・ファイアウォール）に、いまの場所の IP が入っていない（家やカフェで IP が変わった）",
    "VPN・踏み台・ポートの転送（SSM・SSH トンネル）をつないでいない",
    "DB が止まっている・休止している（無料のプランのしばらく使わないと止まる DB・一時停止・自動の休止。初めの 1 回が遅いだけのこともある）",
    "ホストかポートの誤り",
  ],
  refused: [
    "DB が動いていない（ローカルの Docker の DB なら docker compose up）",
    "ポートの誤り・ポートを外に出していない（compose の ports）",
    "ポートの転送（SSM・SSH トンネル）が切れている",
  ],
  dns: ["ホスト名の誤り", "VPN をつないでいない（社内の名前）", "IPv6 だけのホストで、この Mac の回線が IPv6 に対応していない", "DB が消えた（期限で消えるプラン）"],
  auth: [
    "パスワードが自動で変えられた（Secrets Manager のローテーション・資格情報の入れ替え）",
    "期限のあるトークン（RDS の IAM 認証は 15 分）が切れた",
    "ユーザー名かパスワードの打ち間違い",
  ],
  not_allowed: ["DB の許可の一覧（pg_hba.conf・IP の許可リスト）に、いまの場所が入っていない", "SSL を求める DB に SSL なしでつないだ（接続の SSL を「暗号化する」に）"],
  ssl: ["SSL の設定が DB と合わない（使う・使わない）", "証明書を確かめるときは CA が要る（Supabase は独自の CA、RDS は AWS の CA の束）"],
  no_database: ["DB 名の誤り", "DB がまだ作られていない・消された"],
  file: ["ファイルの場所の誤り・まだ作られていない", "ワークツリーにそのファイルがない"],
  other: ["接続の設定（ホスト・ポート・ユーザー・SSL）を見直す", "手順メモの「つなぐ前にやること」を済ませたか確かめる"],
};

const RULES: [DbFailureKind, RegExp][] = [
  ["auth", /password authentication failed|access denied for user|authentication failed|invalid password|ER_ACCESS_DENIED|28P01/i],
  ["not_allowed", /pg_hba\.conf|not allowed to connect|host '.*' is not allowed|ER_HOST_NOT_PRIVILEGED/i],
  ["no_database", /database ".*" does not exist|unknown database|ER_BAD_DB_ERROR|3D000/i],
  ["ssl", /\bssl\b|\btls\b|certificate|self[- ]signed|unable to verify|ERR_TLS/i],
  ["dns", /ENOTFOUND|EAI_AGAIN|getaddrinfo|name or service not known|nodename nor servname/i],
  ["refused", /ECONNREFUSED|connection refused/i],
  ["timeout", /ETIMEDOUT|timeout|timed out|EHOSTUNREACH|ENETUNREACH|connection terminated unexpectedly/i],
  ["file", /unable to open database|SQLITE_CANTOPEN|ENOENT|no such file|ファイルが見つかりません|このワークツリーにはありません/i],
];

/** 失敗の文から種類を見分ける（分からなければ other） */
export function dbFailureKind(message: string): DbFailureKind {
  return RULES.find(([, re]) => re.test(message))?.[0] ?? "other";
}

/** 手順メモを置くメモのフォルダの中のフォルダ */
export const DB_MEMO_DIR = "DB";

/** 手順メモの名前の案（接続の名前ではなく、つなぎ方（経路）の名前をすすめる: 「本番（db.example.com）」「ローカル（SQLite）」） */
export function suggestDbMemoName(c: Pick<DbConnection, "engine" | "environment" | "host">): string {
  const where = c.engine === "sqlite" ? "SQLite" : (c.host ?? DB_ENGINE_LABELS[c.engine]);
  return `${DB_ENVIRONMENT_LABELS[c.environment]}（${where}）`;
}

/** 手順メモのひな形（4 つの見出し。パスワードは書かない）。today は「変えた履歴」の 1 行目の日付（YYYY-MM-DD） */
export function dbMemoTemplate(title: string, today: string): string {
  return `# ${title}

> DB の接続の手順メモです（Kickoff の DB クライアントから開けます）。パスワードそのものは書かないでください（ふつうのファイルなので）。

## つなぐ前にやること

- 例: VPN をつなぐ / aws sso login --profile … / 踏み台を起動する

## つながらないときの直し方

- 例: 時間切れなら、いまの IP をセキュリティグループに足す

## 関係する場所

- 例: 管理画面の URL・セキュリティグループの ID・Secrets Manager の名前・担当の人

## 変えた履歴

- ${today} 作った
`;
}

/** 手順メモの直し方の見出し（dbMemoTemplate と同じ） */
const FIX_HEADING = "## つながらないときの直し方";

/** 「手順メモに追記」の 1 行: 日付・失敗の種類と失敗の文の頭・直し方（どちらも 1 行に詰める） */
export function dbMemoFixEntry(today: string, error: string, fix: string): string {
  const oneLine = (s: string) => s.replace(/\s+/g, " ").trim();
  const head = oneLine(error.split("\n")[0] ?? "");
  const clipped = head.length > 80 ? `${head.slice(0, 80)}…` : head;
  return `- ${today} ${DB_FAILURE_LABELS[dbFailureKind(error)]}${clipped ? `「${clipped}」` : ""} → ${oneLine(fix)}`;
}

/**
 * 手順メモの「つながらないときの直し方」の終わりに 1 行足す（その段の最後の行の次。段がなければメモの終わりに見出しごと足す）。
 * ほかの段・例の行はそのまま
 */
export function appendDbMemoFix(content: string, entry: string): string {
  const lines = content.split("\n");
  const at = lines.findIndex((l) => l.trim() === FIX_HEADING);
  if (at < 0) return `${content.trimEnd()}${content.trim() ? "\n\n" : ""}${FIX_HEADING}\n\n${entry}\n`;
  let end = lines.findIndex((l, i) => i > at && /^#{1,2}\s/.test(l));
  if (end < 0) end = lines.length;
  let last = -1;
  for (let i = end - 1; i > at; i--) {
    if (lines[i].trim()) {
      last = i;
      break;
    }
  }
  if (last >= 0) lines.splice(last + 1, 0, entry);
  else lines.splice(at + 1, 0, "", entry, ...(end < lines.length ? [""] : []));
  return lines.join("\n");
}

/** つながらない様子を「AI に渡す」ときに入力欄に入れる一言（書き換えられる。様子は札にある） */
export function dbFixText(c: Pick<DbConnection, "name">): string {
  return `DB の接続「${c.name}」につながりません。添付のつながらない様子を見て原因を調べ、つながるように直すのを手伝ってください。`;
}

/**
 * つながらない様子の札の中身（「AI に渡す」）: 失敗の文・接続の設定（パスワードは入れない）・手順メモの場所と、直したあと・直し方の決まり。
 * AI はふつうのチャットと同じく承認を通してコマンドを流せる。直ったら手順メモに追記してもらう
 */
export function dbFailureDocument(c: Pick<DbConnection, "name" | "engine" | "environment" | "host" | "port" | "database" | "username" | "file_path" | "ssl" | "read_only" | "memo_path">, error: string): string {
  const fields: [string, string | null][] = [
    ["名前", c.name],
    ["種類", DB_ENGINE_LABELS[c.engine]],
    ["環境", DB_ENVIRONMENT_LABELS[c.environment]],
    ["ホスト", c.host],
    ["ポート", c.port === null ? null : String(c.port)],
    ["DB", c.database],
    ["ユーザー", c.username],
    ["SQLite のファイル", c.file_path],
    ["SSL", c.ssl ? (c.ssl.mode === "verify" ? `証明書を確かめる${c.ssl.ca_path ? `（CA: ${c.ssl.ca_path}）` : ""}` : "暗号化する") : "使わない"],
    ["読み取り専用", c.read_only ? "はい" : "いいえ"],
  ];
  const kind = dbFailureKind(error);
  return [
    `# DB の接続「${c.name}」につながらない様子（Kickoff の DB クライアント）`,
    "",
    "## 失敗の文",
    "",
    "```",
    error,
    "```",
    "",
    `見分けた種類: ${DB_FAILURE_LABELS[kind]}`,
    "",
    "## 接続の設定（パスワードは載せていません）",
    "",
    ...fields.filter(([, v]) => v !== null).map(([k, v]) => `- ${k}: ${v}`),
    "",
    c.memo_path
      ? `## 手順メモ\n\nこの接続の手順メモはメモフォルダの「${c.memo_path}」です。先に読んでください。直ったら、何をしたかをその「変えた履歴」と「つながらないときの直し方」に書き足してください。`
      : `## 手順メモ\n\nこの接続にはまだ手順メモがありません。直ったら、つなぐ前にやること・直し方をメモフォルダの「${DB_MEMO_DIR}/」の下に手順メモとして書いてください。`,
    "",
    "IP の許可を 0.0.0.0/0 に広げるなど、守りを弱める直し方はしないでください。パスワード・トークンをメモに書かないでください。",
  ].join("\n");
}
