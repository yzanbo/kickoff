// ポートを使っているプロセス（Kickoff のプロジェクトのフォルダで動いていて、TCP のポートを待っているもの。メモの仕様書「ポートを使っているプロセス」）

/** 起動元（親をたどって決める） */
export const PORT_ORIGINS = ["kickoff", "detached", "other"] as const;
export type PortOrigin = (typeof PORT_ORIGINS)[number];
export const PORT_ORIGIN_LABELS: Record<PortOrigin, string> = {
  kickoff: "Kickoff の中",
  detached: "切り離されている",
  other: "ほかのアプリ",
};
/** 起動元の説明（マウスを乗せたとき） */
export const PORT_ORIGIN_HINTS: Record<PortOrigin, string> = {
  kickoff: "Kickoff のターミナル・チャットから起動して、まだつながっています",
  detached: "起動したものから切り離されて残っています（AI が裏で起動して残したものなど）",
  other: "ほかのアプリ（VS Code のターミナルなど）から起動しました",
};

/** ワークツリーの帯の番号の添え書き（帯の中の番号のときだけ） */
export interface PortBandNote {
  port: number;
  /** 帯を持っているワークツリー（作業するフォルダ） */
  worktree_path: string;
  /** 帯を持っているワークツリーの名前（ブランチ。なければフォルダ名） */
  label: string;
  /** 帯の中のどの番号か（+00 は「開発サーバー」、ほかは対応表のサービス名。対応表になければ null） */
  slot: string | null;
  /** プロセスの作業場所と、帯の持ち主が違う（そのままだと帯の持ち主のサーバーが起動できない） */
  mismatch: boolean;
}

/** ポートを使っているプロセス 1 つ（いくつものポートを待っていれば 1 つにまとめる） */
export interface PortProcess {
  pid: number;
  /** 待っているポート（小さい順） */
  ports: number[];
  /** 短くしたコマンド（node …/node_modules/.bin/vite → vite） */
  command: string;
  /** コマンドの全文（止める前の確かめにも使う） */
  command_full: string;
  project_id: number;
  /** 作業場所（null は本体） */
  worktree_path: string | null;
  /** 作業場所のブランチ（ない・分からなければ null） */
  branch: string | null;
  /** 動いている時間（秒。分からなければ null） */
  uptime_seconds: number | null;
  origin: PortOrigin;
  /** 「ほかのアプリ」のときの、起動したアプリの名前（分からなければ null） */
  origin_app: string | null;
  bands: PortBandNote[];
}

/** 止める（POST /api/ports/stop。command は一覧のときの全文。pid の使い回しで別のものを止めないため） */
export interface PortStopBody {
  pid: number;
  command: string;
  /** 強制終了（SIGKILL）。省けば SIGTERM */
  force?: boolean;
}

/** 止めた結果（待つ間に終わったか。終わらなければ画面が「強制終了」を出す） */
export interface PortStopResult {
  stopped: boolean;
}
