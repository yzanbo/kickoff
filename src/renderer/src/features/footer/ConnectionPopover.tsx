import { useEffect, useRef, type RefObject } from "react";
import { api } from "@/api";
import { useAsync } from "@/hooks/useAsync";
import { githubStore, providersStore, useGitHubStatus, useProviders } from "@/stores/providers";
import type { ConnectionState } from "@/api/useServerConnection";
import { accountLine } from "@/features/usage/usage";
import { ErrorText } from "@/ui/ErrorText";
import { Popover } from "@/ui/Popover";
import { StatusDot, toneOf, type StatusTone } from "@/ui/StatusDot";
import { ServerInfoRows, serverTimeText } from "./ServerInfo";

interface Props {
  /** 開いた左下の接続の表示（その左端にそろえて上に出す） */
  anchor: RefObject<HTMLElement | null>;
  state: ConnectionState;
  /** 最後につながった時刻 */
  since: number | null;
  onClose: () => void;
  /** 設定（接続の項目）を開く */
  onOpenSettings: () => void;
}

/** 下の帯の札の文（札はつながらないときだけ出す。open は詳細を開いたままつながったときだけ見える） */
const CONNECTION_LABELS: Record<ConnectionState, string> = {
  connecting: "Kickoff サーバーから切断（再接続中）",
  open: "Kickoff サーバーに接続済み",
  closed: "Kickoff サーバーから切断",
};

/** 札の文。一度もつながっていない（起動してからつながらない）ときの connecting は「切断」でなく「接続中」 */
export function connectionLabel(state: ConnectionState, since: number | null): string {
  return state === "connecting" && since === null ? "Kickoff サーバーに接続中…" : CONNECTION_LABELS[state];
}

const CONNECTION_TONES: Record<ConnectionState, StatusTone> = { connecting: "pending", open: "ok", closed: "ng" };
const STATE_TEXT: Record<ConnectionState, string> = { connecting: "接続中…", open: "接続済み", closed: "切断（5 秒ごとに再接続します）" };

/** 左下の接続の表示を押したときに、左下から出る詳細（画面は移らない） */
export function ConnectionPopover({ anchor, state, since, onClose, onOpenSettings }: Props) {
  // 接続の状態が変わったら取り直す（取り直している間も前の内容を出しておく）。プロバイダー・GitHub は店から（開くたびに確かめ直す）
  const status = useAsync(() => api.status(), [state]);
  const providerState = useProviders();
  const githubState = useGitHubStatus();
  const shownState = useRef(state);
  useEffect(() => {
    if (shownState.current === state) return;
    shownState.current = state;
    void providersStore.reload();
    void githubStore.reload();
  }, [state]);
  const reload = () => {
    status.reload();
    void providersStore.reload();
    void githubStore.reload();
  };
  const server = status.data;
  const providers = providerState.data;
  const github = githubState.data;
  const loading = status.loading || providerState.loading || githubState.loading;
  const error = status.error ?? providerState.error ?? githubState.error;

  const claude = providers?.find((p) => p.id === "claude");
  const codex = providers?.find((p) => p.id === "codex");
  const gemini = providers?.find((p) => p.id === "gemini");

  return (
    // 外側のクリック・Esc で閉じる（左下の表示自体はそちらで開閉する）。画面の端の帯から開くので、開いた場所の文字の大きさを受け継がない
    <Popover
      anchor={anchor}
      side="above"
      gap={8}
      portal
      escape="pass"
      title="接続の詳細"
      refresh={{ label: "接続を再確認", title: "再確認", busy: loading, onClick: reload }}
      label="接続の詳細"
      className="usage-popover connection-popover"
      onClose={onClose}
    >

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
              <dd>{serverTimeText(since)}</dd>
            </>
          )}
          {server && <ServerInfoRows server={server} />}
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
    </Popover>
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
