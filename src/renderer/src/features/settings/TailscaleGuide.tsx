import type { TailscaleStatus } from "@shared/types";
import { CopyButton } from "@/ui/CopyButton";
import { ErrorText } from "@/ui/ErrorText";
import { RefreshButton } from "@/ui/IconButton";
import { VoiceStep } from "./VoiceStep";

interface TailscaleGuideProps {
  status: TailscaleStatus | null;
  loading: boolean;
  error: string | undefined;
  /** いまの「つなぐ先の URL」（Serve の URL と同じなら 3 を済みにする） */
  mobileUrl: string | null;
  onRecheck: () => void;
  /** Serve の URL を「つなぐ先の URL」に入れる */
  onUseUrl: (url: string) => void;
}

/**
 * Tailscale Serve の始め方（設定の「スマホ連携」）。スマホは Tailscale Serve（HTTPS・ts.net の名前）でこの Mac に届き、
 * Kickoff の待ち受けは 127.0.0.1 のまま。手順と、この Mac の Tailscale の様子（入っているか・Serve が動いているか・その URL）を出す
 */
export function TailscaleGuide({ status, loading, error, mobileUrl, onRecheck, onUseUrl }: TailscaleGuideProps) {
  const known = status !== null;
  const serveUrl = status?.serve_url ?? null;
  return (
    <>
      <ol className="voice-steps tailscale-steps">
        <VoiceStep n={1} done={known ? status.running : undefined} title="Mac とスマホに Tailscale を入れ、同じアカウントでログインする">
          <p className="field-help">
            Tailscale は、家の外からもこの Mac に暗号化してつなぐ道です（個人なら無料）。Mac は tailscale.com のアプリか <code>brew install --cask tailscale</code>、Android は Google Play
            の「Tailscale」。
          </p>
          <p className="muted small">
            {!known
              ? "確認中…"
              : !status.installed
                ? "この Mac に Tailscale が見つかりません。"
                : !status.running
                  ? "Tailscale はありますが、ログインしていないか止まっています。"
                  : `つながっています（${status.dns_name}）。`}
          </p>
        </VoiceStep>
        <VoiceStep n={2} done={known ? serveUrl !== null : undefined} title="Tailscale Serve で、この Kickoff を HTTPS で出す">
          <p className="field-help">
            Mac のターミナルで次のコマンドを流します（Mac を起動し直しても続きます）。初めてのときは、Tailscale の管理画面の「DNS」で HTTPS Certificates を有効にするよう聞かれます。
          </p>
          {status && (
            <div className="voice-command">
              <code>{status.command}</code>
              <CopyButton text={status.command} label="コマンドをコピー" />
            </div>
          )}
          {serveUrl && <p className="muted small">出しています: {serveUrl}</p>}
          {status && status.other_serves.length > 0 && (
            <p className="muted small">ほかのポートへの Serve もあります（製品版と開発版を取り違えていないか確かめてください）: {status.other_serves.join("、")}</p>
          )}
        </VoiceStep>
        <VoiceStep n={3} done={serveUrl !== null && serveUrl === mobileUrl} title="出した URL を「つなぐ先の URL」に入れる">
          {serveUrl && serveUrl !== mobileUrl ? (
            <button type="button" className="btn" onClick={() => onUseUrl(serveUrl)}>
              {serveUrl} を使う
            </button>
          ) : (
            <p className="field-help">下の欄に入れます。Serve が動いていれば、ここに押すだけで入れるボタンが出ます。</p>
          )}
        </VoiceStep>
        <VoiceStep n={4} done={undefined} title="「端末をつなぐ」の QR を、スマホの Kickoff のアプリで読む">
          <p className="field-help">Mac の画面で「つなぎますか」に答えると、つながります。</p>
        </VoiceStep>
      </ol>
      <div className="voice-step-actions">
        <RefreshButton label="確かめ直す" title="Tailscale の様子を確かめ直す" busy={loading} onClick={onRecheck} type="button" />
        <span className="muted small">確かめ直す</span>
      </div>
      <ErrorText message={error ?? status?.error ?? undefined} />
    </>
  );
}
