import { Check, SlidersHorizontal } from "lucide-react";
import { Fragment, useMemo } from "react";
import { useSetting } from "@/hooks/useSetting";
import { BOARD_CARD_HIDDEN } from "@/lib/storageKeys";
import { MenuItem, PopupMenu } from "@/ui/PopupMenu";
import { useContextMenu } from "@/ui/useContextMenu";
import { CARD_FIELD_LABELS, cardFieldSections, hiddenCardFields, sameHiddenCardFields, toggleCardField, type CardField } from "./cardFields";

/** カードに項目を出すか（すべてのボードで共通。ツールバーの「表示項目」で選ぶ） */
export type ShowCardField = (field: CardField) => boolean;

/** カード・リストの行・フィードのカードに出す項目（BOARD_CARD_HIDDEN に隠した項目を覚える） */
export function useCardFields(): ShowCardField {
  const [saved] = useSetting(BOARD_CARD_HIDDEN);
  return useMemo(() => {
    const hidden = hiddenCardFields(saved);
    return (field: CardField) => !hidden.has(field);
  }, [saved]);
}

/**
 * ツールバーの「表示項目」（並び順の左。利用者の依頼）。カード・リストの行・フィードのカードに出すバッジ・詳細・日時を、
 * チェックのメニューで 1 つずつ出す・隠す（押してもメニューは閉じない）。いちばん下の「既定に戻す」で初めの選び方に戻す
 */
export function CardFieldsButton({ allProjects }: { allProjects: boolean }) {
  const [saved, setSaved] = useSetting(BOARD_CARD_HIDDEN);
  const menu = useContextMenu();
  const hidden = hiddenCardFields(saved);
  return (
    <>
      <button
        type="button"
        className="btn btn-sm board-fields-button"
        aria-haspopup="menu"
        aria-expanded={menu.isOpen}
        aria-label="表示項目（カード・リストの行に出す項目）"
        onClick={(e) => menu.toggle(e)}
      >
        <SlidersHorizontal size={13} aria-hidden />
        <span className="btn-label">表示項目</span>
      </button>
      {menu.menu && (
        <PopupMenu at={menu.menu.at} label="表示項目" ignore=".board-fields-button" onClose={menu.close}>
          {cardFieldSections(allProjects).map(({ title, items }, i) => (
            <Fragment key={title}>
              {i > 0 && <div className="menu-separator" role="separator" />}
              <div className="menu-label">{title}</div>
              {items.map((field) => {
                const on = !hidden.has(field);
                return (
                  <MenuItem key={field} role="menuitemcheckbox" checked={on} keepOpen onSelect={() => setSaved(toggleCardField(saved, field))}>
                    <span className="project-switch-item">{CARD_FIELD_LABELS[field]}</span>
                    {on && <Check size={14} aria-hidden />}
                  </MenuItem>
                );
              })}
            </Fragment>
          ))}
          <div className="menu-separator" role="separator" />
          <MenuItem
            keepOpen
            disabled={sameHiddenCardFields(saved, BOARD_CARD_HIDDEN.initial)}
            title="表示項目を初めの選び方に戻します"
            onSelect={() => setSaved([...BOARD_CARD_HIDDEN.initial])}
          >
            <span className="project-switch-item">既定に戻す</span>
          </MenuItem>
        </PopupMenu>
      )}
    </>
  );
}
