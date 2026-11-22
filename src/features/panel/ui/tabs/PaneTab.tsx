import type { HTMLAttributes } from "react";
import { cx } from "@/foundation/ui/lib/cx";
import type { PanelController } from "@/features/panel/ui/usePanel";
import { confirmTabClose } from "@/features/panel/ui/state/closeTabs";
import { PanelTab } from "./PanelTab";
import type { PanelTab as Tab } from "./panelTypes";
import { kindOf, surfaceOf } from "@/features/panel/ui/state/panelStore";
import type { TabFace, TabGroupLookup } from "@/features/panel/ui/kind";
import type { TabRename } from "./useTabRename";

/**
 * ペインのタブの列のタブ 1 つ。アイコン・名前・説明・グループ名は種類の項目から引き、店を読む見た目（状態の印・動きの印・作業場所の札・ピン・太字・
 * 保存していない印）は種類の Face が足し替える。名前の変更は種類の rename、× は種類の close（なければ confirmClose で聞いてから閉じる）。
 * 分けたペイン（home でない）のサイドバーと連動したチャットは、× で聞かずに一覧のペインへ戻す（ペインを閉じたときと同じ。アーカイブ・削除は右クリックから）
 */
export function PaneTab({
  panel,
  tab: t,
  active,
  home,
  show,
  twoLine,
  groupOf,
  className,
  extra,
  rename,
}: {
  panel: PanelController;
  tab: Tab;
  active: boolean;
  /** 一覧のペインのタブか */
  home: boolean;
  /** タブに出す項目（タブの列の「表示」のメニューの「タブに出す項目」で選んだもの。項目の名前は欄の持ち主が決める） */
  show: (field: string) => boolean;
  /** 2 行にする（名前の下にグループ・作業場所の札） */
  twoLine: boolean;
  /** プロジェクトのグループ（名前と色）を引く */
  groupOf: TabGroupLookup;
  /** ドラッグで落とす位置の印など */
  className?: string;
  /** ドラッグ・右クリックのメニュー */
  extra: HTMLAttributes<HTMLDivElement>;
  /** タブの名前をその場で変える（パネル全体で 1 つ） */
  rename: TabRename;
}) {
  const spec = kindOf(t);
  // チャットのタブのチャット（ボードの一覧になければ、タブの中のチャットから届いたもの）
  const chat = panel.chatOf(t);
  const label = spec.label(t, chat);
  const group = spec.group?.(t, chat, groupOf);
  const backHome = !home && panel.isLinkedTab(t.key);
  const close = () => {
    if (backHome) return panel.returnToHome(t.key);
    if (spec.close) return spec.close(t, { panel, close: (opts) => panel.closeTab(t.key, opts) });
    void confirmTabClose(panel.key, t).then((ok) => ok && panel.closeTab(t.key));
  };
  const render = (face: TabFace) => {
    const name = face.label ?? label;
    return (
      <PanelTab
        active={active}
        icon={spec.icon}
        iconClass={spec.iconClass}
        badge={spec.badge && surfaceOf(panel.surface)?.kindBadges !== false ? { text: spec.BadgeText ? <spec.BadgeText tab={t} /> : spec.badge, kind: t.kind } : undefined}
        label={name}
        after={face.after}
        group={show("group") ? group : undefined}
        tag={face.tag}
        tagKey={face.tagKey}
        twoLine={twoLine}
        title={spec.hint?.(t) ?? face.title ?? (group ? `${name}（グループ: ${group.name}）` : name)}
        className={cx(className, face.unread && "unread")}
        extra={face.attrs ? { ...extra, ...face.attrs } : extra}
        onSelect={() => panel.showTab(t.key)}
        pinnedIn={face.pinnedIn ?? null}
        lead={spec.Lead ? <spec.Lead tab={t} /> : face.lead}
        onRename={rename.canRename(t) ? () => rename.start(t.key) : undefined}
        // 名前を変えている途中なら、タブの入力欄に渡す形にする（初めの値は種類の rename.initial）
        editor={rename.editorFor(panel.key, t)}
        closeLabel={backHome ? `${name} を一覧のペインに戻す` : face.closeLabel}
        dirty={face.dirty}
        onClose={close}
      />
    );
  };
  return spec.Face ? <spec.Face tab={t} panel={panel} show={show} base={{ label, group }} render={render} /> : render({});
}
