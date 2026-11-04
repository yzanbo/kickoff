import { useRef } from "react";
import { api } from "@/api";
import { useAsync } from "@/hooks/useAsync";
import { useDismiss } from "@/hooks/useDismiss";
import type { ConnectionState } from "@/api/useServerEvents";
import { accountLine } from "@/features/usage/usage";
import { ErrorText } from "@/ui/ErrorText";
import { PopoverHeader } from "@/ui/PopoverHeader";
import { StatusDot, toneOf, type StatusTone } from "@/ui/StatusDot";

interface Props {
  state: ConnectionState;
  /** 最後につながった時刻 */
  since: number | null;
  onClose: () => void;
  /** 設定（接続の項目）を開く */
  onOpenSettings: () => void;
}

export const CONNECTION_LABELS: Record<ConnectionState, string> = {
  connecting: "Kickoff サーバーに接続中…",
  open: "Kickoff サーバーに接続済み",
  closed: "Kickoff サーバーから切断",
};

const CONNECTION_TONES: Record<ConnectionState, StatusTone> = { connecting: "pending", open: "ok", closed: "ng" };
const STATE_TEXT: Record<ConnectionState, string> = { connecting: "接続中…", open: "接続済み", closed: "切断（5 秒ごとに再接続します）" };

const timeText = (t: number | string) => new Date(t).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });

/** 左下の接続の表示を押したときに、左下から出る詳細（画面は移らない） */
export function ConnectionPopover({ state, since, onClose, onOpenSettings }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  // 接続の状態が変わったら取り直す（取り直している間も前の内容を出しておく）
  const { data, loading, error, reload } = useAsync(() => Promise.all([api.status(), api.providers(), api.github()]), [state]);
  const [server, providers, github] = data ?? [];

  // 外側のクリック・Esc で閉じる（左下の表示自体はそちらで開閉する）
  useDismiss(ref, onClose, { ignore: ".conn", escape: "pass" });

  const claude = providers?.find((p) => p.id === "claude");
  const codex = providers?.find((p) => p.id === "codex");
  const gemini = providers?.find((p) => p.id === "gemini");

  return (
    <div ref={ref} className="usage-popover connection-popover" role="dialog" aria-label="接続の詳細">
      <PopoverHeader title="接続の詳細" refresh={{ label: "接続を再確認", title: "再確認", busy: loading, onClick: reload }} onClose={onClose} />

      <section className="conn-section">
        <div className="conn-row-title">
          <StatusDot tone={CONNECTION_TONES[state]} />
          Kickoff サーバー
        </div>
        <p className="muted small conn-help">画面とエージェントの実行・保存をつなぐ、この Mac の中のサーバーです。</p>
        <dl className="conn-list">
          <dt>状態</dt>
          <dd>{STATE_TEXT[state]}</dd>
          {since && state === "open" && (
            <>
              <dt>接続した時刻</dt>
              <dd>{timeText(since)}</dd>
            </>
          )}
          {server && (
            <>
              <dt>アドレス</dt>
              <dd className="mono">
                {server.host}:{server.port}
              </dd>
              <dt>起動した時刻</dt>
              <dd>{timeText(server.started_at)}</dd>
              <dt>エージェント</dt>
              <dd>
                実行中 {server.agents.running}
              </dd>
              <dt>スマホ連携</dt>
              <dd>{server.remote_enabled ? "オン（ほかの端末から接続できます）" : "オフ（この Mac からだけ）"}</dd>
            </>
          )}
        </dl>
      </section>

      <section className="conn-section">
        <div className="conn-row-title">AI・ツール（Mac の CLI のログインを使用）</div>
        <ToolRow
          name="Claude Code"
          ok={claude ? claude.installed && claude.logged_in : undefined}
          detail={claude ? accountLine(claude) || claude.detail : "確認中…"}
        />
        {[codex, gemini].map(
          (p) =>
            p && (
              <ToolRow
                key={p.id}
                name={p.label}
                ok={p.implemented ? p.logged_in : null}
                detail={p.implemented ? p.detail : p.installed ? "CLI はインストール済み・対応予定" : "対応予定"}
              />
            ),
        )}
        <ToolRow
          name="GitHub CLI（gh）"
          ok={github ? github.installed && github.logged_in : undefined}
          detail={github ? (github.account ? `${github.account} でログイン済み` : github.detail) : "確認中…"}
        />
      </section>

      <ErrorText message={error} />
      <button
        type="button"
        className="link-button conn-settings-link small"
        onClick={() => {
          onClose();
          onOpenSettings();
        }}
      >
        設定を開く
      </button>
    </div>
  );
}

/** ok: true = 使える / false = 使えない / null = 対応予定 / undefined = 確認中 */
function ToolRow({ name, ok, detail }: { name: string; ok: boolean | null | undefined; detail: string }) {
  return (
    <div className="conn-tool">
      <StatusDot tone={toneOf(ok)} />
      <span className="conn-tool-name">{name}</span>
      <span className="conn-tool-detail muted">{detail}</span>
    </div>
  );
}
