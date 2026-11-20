import type { CSSProperties } from "react";
import { useDragSize } from "@/foundation/ui/kit/drag/useDragSize";
import { useNarrowerThan } from "@/foundation/ui/hooks/useNarrowerThan";
import { useSetting } from "@/foundation/ui/hooks/useSetting";
import type { Setting } from "@/foundation/ui/storage";

/**
 * 一覧と詳細の出し方: 狭い（詳細の欄に detailMin が残らない）ときは、選んでいなければ一覧・選んでいれば詳細だけを出す。
 * 広いときは両方を出し、一覧は隠せる（隠している間は左端に戻すための帯 ListRail を置く）
 */
export function listDetailLayout({ narrow, hidden, hasSelection }: { narrow: boolean; hidden: boolean; hasSelection: boolean }) {
  return { showList: narrow ? !hasSelection : !hidden, showDetail: !narrow || hasSelection, showRail: !narrow && hidden };
}

export interface ListDetailOptions {
  /** 一覧の幅（境目のつまみで変える） */
  width: Setting<number>;
  /** 一覧を隠しているか（広いときだけ効く） */
  hidden: Setting<boolean>;
  min: number;
  max?: number;
  /** つまみで広げるとき、詳細の側に残す幅 */
  keep?: number;
  /** 詳細の欄に要る幅（一覧の幅 ＋ これが入らなければ狭い） */
  detailMin: number;
  hasSelection: boolean;
}

/** 一覧＋詳細の 2 欄の状態（描くのは ListDetail。GitHub・CI・ファイル・ノート・履歴のタブの組み立てを 1 つにする） */
export function useListDetail({ width, hidden: hiddenSetting, min, max, keep, detailMin, hasSelection }: ListDetailOptions) {
  const { paneRef: listRef, ...drag } = useDragSize<HTMLElement>({ setting: width, min, max, keep });
  const { ref: rootRef, narrow } = useNarrowerThan<HTMLDivElement>(drag.size + detailMin);
  const [hidden, setHidden] = useSetting(hiddenSetting);
  return {
    rootRef,
    listRef,
    narrow,
    ...listDetailLayout({ narrow, hidden, hasSelection }),
    /** 一覧の幅（狭いときは横いっぱい） */
    listStyle: (narrow ? undefined : { width: drag.size }) as CSSProperties | undefined,
    /** 境目のつまみに渡す */
    handleProps: drag.handle,
    hide: () => setHidden(true),
    show: () => setHidden(false),
  };
}

export type ListDetailState = ReturnType<typeof useListDetail>;
