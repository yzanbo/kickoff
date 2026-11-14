// Tailscale Serve の案内（設定の「スマホ連携」）。スマホは Tailscale Serve（HTTPS・ts.net の名前）で本体に届き、
// 本体の待ち受けは 127.0.0.1 のまま。Tailscale が付ける利用者の見出しは認証に使わない（Mac の中のプロセスが偽れるため）

/** この Mac の Tailscale の様子（GET /api/tailscale。この Mac の画面だけ） */
export interface TailscaleStatus {
  /** tailscale のコマンドが見つかったか（Mac のアプリ・Homebrew） */
  installed: boolean;
  /** ログインしてつながっているか（BackendState が Running） */
  running: boolean;
  /** この Mac の名前（mac.tailnet.ts.net。つながっていなければ null） */
  dns_name: string | null;
  /** この本体のポートへ渡している Serve の URL（https://mac.tailnet.ts.net など。なければ null） */
  serve_url: string | null;
  /** Serve はあるが、ほかのポートへ渡しているもの（製品版と開発版の取り違えに気づけるように。なければ空） */
  other_serves: string[];
  /** 始めるコマンド（この本体のポートで。コピーして Mac のターミナルで流す） */
  command: string;
  /** 調べられなかった理由（コマンドが失敗したなど。なければ null） */
  error: string | null;
}
