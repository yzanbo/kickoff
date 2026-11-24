import "./AppFooter.css";
import { useCommandKeys } from "@/foundation/ui/commands";
import { ChoiceMenu } from "@/foundation/ui/kit/ChoiceMenu";
import { useContextMenu } from "@/foundation/ui/kit/useContextMenu";
import { cx } from "@/foundation/ui/lib/cx";
import { FOOTER_MODE_LABELS, FOOTER_MODES, useFooterMode } from "@/foundation/ui/shell/footerMode";
import { footerItems, type FooterItem } from "@/foundation/ui/shell/points";

/** その側の項目を order の順に描く */
function Items({ items, projectId }: { items: readonly FooterItem[]; projectId: number | undefined }) {
  return items.map(({ id, Item }) => <Item key={id} projectId={projectId} />);
}

/**
 * 下の帯。項目は持ち主の機能が footerItems に登録する（左: 設定・接続が切れたときの札・オフライン・CLI が使えないときの札・ブランチ・ポート・再開の確かめ /
 * 右: AI ごとの使用状況。ターミナルの開閉は右上）。帯は項目を side・order の順に並べるだけ。
 * 出し方（表示 / 下端に寄せたときだけ表示 / 非表示。useFooterMode）は、帯の右クリックと設定の「表示」で選ぶ。下端に寄せたときだけ出すときは、
 * 画面の上に重ねて出し（縦の幅を取らない）、乗せている間・中の詳細を開いている間は出したままにする（.app-footer.auto-hide）。
 * 隠しているときは、項目の Fallback だけを描く（ポートの窓を ⌘K から開けるように）
 */
export function AppFooter({ projectId }: { projectId?: number }) {
  const settingsKeys = useCommandKeys("settings.open");
  const [mode, setMode] = useFooterMode();
  const menu = useContextMenu();
  const items = footerItems.items().filter((i) => i.when?.() ?? true);
  if (mode === "hide") return items.map(({ id, Fallback }) => Fallback && <Fallback key={id} />);
  return (
    <footer className={cx("app-footer", mode === "hover" && "auto-hide")} onContextMenu={menu.open}>
      <Items items={items.filter((i) => i.side === "start")} projectId={projectId} />
      <span className="spacer" />
      <Items items={items.filter((i) => i.side === "end")} projectId={projectId} />
      {menu.menu && (
        <ChoiceMenu
          at={menu.menu.at}
          title="下の帯"
          values={FOOTER_MODES}
          labels={FOOTER_MODE_LABELS}
          value={mode}
          titles={{ hide: `戻すときは、設定（${settingsKeys}）の「表示」→「下の帯」から` }}
          onPick={setMode}
          onClose={menu.close}
        />
      )}
    </footer>
  );
}
