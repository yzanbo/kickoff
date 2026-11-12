// Docker タブ（プロジェクトの compose のサービスを見て、起動・停止し、ログとシェルを開く）。API・SSE に出る形は snake_case

/** docker ps の State（docker が返す値） */
export type DockerContainerState = "created" | "running" | "paused" | "restarting" | "removing" | "exited" | "dead";

/** サービスの行の印（画面の言葉は DOCKER_MARK_LABELS） */
export const DOCKER_MARKS = ["running", "starting", "paused", "failed", "created", "stopped", "none"] as const;
export type DockerMark = (typeof DOCKER_MARKS)[number];

/** Mac に出しているポート（0.0.0.0:5432->5432/tcp） */
export interface DockerPort {
  host_ip: string;
  host_port: number;
  container_port: number;
  protocol: string;
}

/** コンテナ 1 つ */
export interface DockerContainer {
  id: string;
  name: string;
  image: string;
  state: DockerContainerState;
  /** docker ps の Status の文（「Up 2 hours (healthy)」「Exited (1) 3 minutes ago」） */
  status: string;
  /** 終了コード（止まっているときだけ。Status から読む） */
  exit_code: number | null;
  /** ヘルスチェックの様子（なければ null） */
  health: "healthy" | "unhealthy" | "starting" | null;
  ports: DockerPort[];
  /** 数を増やしたサービスの何番目か（com.docker.compose.container-number。なければ 1） */
  number: number;
}

/** compose のサービス 1 つ（数を増やしたものも 1 行にまとめる） */
export interface DockerService {
  name: string;
  /** イメージ（設定にあればそれ、なければコンテナのもの。build だけなら null） */
  image: string | null;
  /** profiles の札（空ならふだんの up で起動する） */
  profiles: string[];
  /** 設定で Mac に出すポート（published。ポートの取り合いの相手を探すのに使う） */
  published: number[];
  /** 使い捨てでないコンテナ（番号の順） */
  containers: DockerContainer[];
  /** docker compose run で作った使い捨てのコンテナ */
  oneoffs: DockerContainer[];
  mark: DockerMark;
  /** 動いているコンテナの数 */
  running: number;
  /** DB クライアントで開けるイメージか（postgres・mysql・mariadb。段階 2 の「DB で開く」で使う） */
  db_kind: "postgres" | "mysql" | null;
}

/** 操作の種類 */
export const DOCKER_ACTIONS = [
  "start_all",
  "stop_all",
  "restart_all",
  "down",
  "recreate",
  "start",
  "stop",
  "restart",
  "unpause",
  "stop_container",
  "stop_others_and_start",
] as const;
export type DockerAction = (typeof DOCKER_ACTIONS)[number];


/** compose で動いている操作（コアが compose ごとに 1 つだけ持つ） */
export interface DockerOperation {
  action: DockerAction;
  /** サービスの行の操作ならそのサービス */
  service: string | null;
  started_at: string;
  /** ［中止］できるか（流れ続けるコマンドの up -d だけ） */
  cancellable: boolean;
}

/** ポートの取り合いの相手（Docker 同士） */
export interface DockerPortConflict {
  port: number;
  /** 相手のコンテナ */
  container_id: string;
  container_name: string;
  /** 相手の説明（「本体 | main の db」「kickoff-dbtest-pg（compose の外で作ったコンテナ）」） */
  label: string;
}

/** 最後の失敗（同じ compose で次の操作を始めるか［×］で閉じるまで残す） */
export interface DockerFailure {
  action: DockerAction;
  service: string | null;
  /** 標準エラーの最後の数行 */
  message: string;
  /** ［ターミナルで流し直す］のコマンドとフォルダ */
  command: string;
  cwd: string;
  /** ポートでぶつかった相手（なければ空） */
  conflicts: DockerPortConflict[];
  at: string;
}

/** 静かなぶつかり（Docker の外のプロセスが同じポートで待っている） */
export interface DockerSilentConflict {
  port: number;
  /** lsof に出た実際のアドレス（127.0.0.1:5432 など） */
  address: string;
  process: string;
  pid: number;
  /** 相手が Homebrew のサービスならその名前（brew services stop で止められる） */
  brew_service: string | null;
}

/** 同じ組の名前になっている相手（ほかの作業場所・同じ作業場所のほかの compose のファイル） */
export interface DockerShare {
  kind: "workplace" | "file";
  /** 相手の説明（作業場所なら worktree_path と branch から画面が札を作る。ファイルならその場所） */
  worktree_path: string | null;
  branch: string | null;
  file: string | null;
  /** ほかのプロジェクトの組なら、そのフォルダの名前 */
  other: string | null;
}

/** compose のファイル 1 つ（見出しの行） */
export interface DockerCompose {
  /** 見出しのキー（操作で指す） */
  key: string;
  /** どの作業場所か（null = 本体）とブランチ */
  worktree_path: string | null;
  branch: string | null;
  /** 作業場所のフォルダから見た compose のファイルの場所（見出しに出す。分からなければ null） */
  file: string | null;
  /** 組の名前（compose のプロジェクト名。設定が読めず作ってもいなければ null） */
  project_name: string | null;
  /** 1 つでもコンテナを作ってあるか */
  created: boolean;
  services: DockerService[];
  /** 設定を読めなかったときの標準エラーの最後の数行 */
  config_error: string | null;
  /** 作ったときから設定が変わっている（［作り直して起動］を出す） */
  config_changed: boolean;
  /** 同じ組の名前になっている相手（⚠） */
  shares: DockerShare[];
  /** 「すべて起動」を押せない理由（なければ null） */
  start_blocked: string | null;
  /** 「片付け」を押せない理由（同じ作業場所のほかの compose と同じ組のとき） */
  down_blocked: string | null;
  operation: DockerOperation | null;
  failure: DockerFailure | null;
}

/** Docker のエンジンの様子 */
export type DockerEngineState = "ok" | "missing" | "stopped";

/** エンジンが止まっているときに出すボタン（context の名前から決める） */
export type DockerEngineStarter = { kind: "open"; app: string; label: string } | { kind: "copy"; command: string } | null;

/** ほかのプロジェクトで動いているコンテナ（下に数を 1 行だけ出す） */
export interface DockerOtherContainer {
  name: string;
  /** Mac に出しているポート（「:5432」の形で並べる） */
  ports: number[];
}

/** GET /api/projects/:id/docker */
export interface DockerList {
  engine: DockerEngineState;
  /** docker context show の名前 */
  context: string | null;
  starter: DockerEngineStarter;
  composes: DockerCompose[];
  /** ほかのプロジェクト（compose の外のものも）で動いているコンテナ */
  others: DockerOtherContainer[];
  /** 静かなぶつかり（コンテナの ID ごと） */
  silent: Record<string, DockerSilentConflict[]>;
}

/** POST /api/projects/:id/docker/actions の本文 */
export interface DockerActionBody {
  action: DockerAction | "cancel" | "dismiss";
  compose: string;
  service?: string;
  container?: string;
  /** 別の作業場所と同じ組になる起動を、利用者が確かめたうえで流す */
  confirm_shared?: boolean;
}

/** 別の作業場所と同じ組になる起動を断ったときの code（画面が確かめてから confirm_shared で送り直す） */
export const DOCKER_SHARED_PROJECT = "docker_shared_project";
