import { LINK_OPEN_TARGET_LABELS, LINK_OPEN_TARGETS, type LinkOpenTarget } from "@shared/settings/types";
import type { AppSettings } from "@shared/foundation/contract/settings";
import { api } from "@/foundation/ui/api";
import { settingsStore, useAppSettings } from "@/features/settings/ui/stores/settings";
import { reportFailure } from "@/foundation/ui/kit/ask";
import { Field } from "@/foundation/ui/kit/Field";
import { CloseButton } from "@/foundation/ui/kit/IconButton";
import { Segmented } from "@/foundation/ui/kit/Segmented";

/** 選んだらすぐ保存する（確認の画面の「今後確認しない」でも変わるので、下書きにせずいまの設定を出す） */
function save(patch: Partial<Pick<AppSettings, "link_open_in" | "trusted_link_domains">>) {
  void api
    .updateSettings(patch)
    .then((saved) => settingsStore.set(saved))
    .catch(reportFailure("設定を保存できませんでした"));
}

/**
 * 設定の「リンクと画像」: 外部リンクの開き先と、確かめずに開くドメインの一覧。
 * 外の画像の表示の許可はチャットごと（チャットのメニューの「画像の表示を許可したサイト」）なので、ここには置かない
 */
export function LinkSettings() {
  const settings = useAppSettings().data;
  if (!settings) return null;
  const domains = settings.trusted_link_domains;
  return (
    <section className="section">
      <h2>リンクと画像</h2>
      <div className="form">
        <Field as="div" label="外部リンクを開く場所" help="返答などの外部リンクを押したときの開き先です。⌘ を押しながら押すと、もう一方で開きます。Kickoff のブラウザは、見ているプロジェクトのチャット欄に新しいタブで開きます（プロジェクトを開いていない画面・別ウィンドウでは既定のブラウザ）。">
          <Segmented<LinkOpenTarget>
            label="外部リンクを開く場所"
            value={settings.link_open_in}
            onChange={(next) => save({ link_open_in: next })}
            options={LINK_OPEN_TARGETS.map((t) => ({ value: t, label: LINK_OPEN_TARGET_LABELS[t] }))}
          />
        </Field>
        <Field
          as="div"
          label="確認せずに開くドメイン"
          help="外部リンクは開く前に毎回確かめます。確認の画面で「今後確認しない」を選んだドメインがここに並びます。リンクの文字と行き先が違う・URL にユーザー名が入っている・国際化ドメイン名・IP アドレスのリンクは、ここにあっても確かめます。"
        >
          {domains.length === 0 ? (
            <p className="muted small">まだありません。</p>
          ) : (
            <ul className="trusted-domain-list">
              {domains.map((domain) => (
                <li key={domain}>
                  <span className="trusted-domain">{domain}</span>
                  <CloseButton label={`${domain} を一覧から外す（次から確かめる）`} type="button" iconSize={14} onClick={() => save({ trusted_link_domains: domains.filter((d) => d !== domain) })} />
                </li>
              ))}
            </ul>
          )}
        </Field>
        <p className="muted small">返答の中の外の画像は、チャットごとに「（サイト）から画像を表示」を押したサイトのものだけを表示します。許可を外すのは、チャットの右クリックのメニューの「画像の表示を許可したサイト…」か、画像の「URL を見る」からです。</p>
      </div>
    </section>
  );
}
