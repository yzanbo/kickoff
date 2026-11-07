import type { CSSProperties, MouseEvent } from "react";
import { useMemo } from "react";
import { useSetting } from "@/hooks/useSetting";
import { SIDEBAR_BUCKET_COLORS } from "@/lib/storageKeys";
import { BucketColorItem } from "@/features/chatList/BucketColorItem";
import type { ChatGrouping } from "@/features/chatList/chatGrouping";
import { useBucketHueOf } from "@/features/chatList/useChatBuckets";
import { PopupMenu } from "@/ui/PopupMenu";
import { useContextMenu } from "@/ui/useContextMenu";

/** まとまりの見出しに付ける色（色相が null なら何も付けない）。`.bucket-hued` が `--group-hue` から見出しのアイコンと名前の色を決める（sidebar-sections.css） */
export const huedHeadProps = (hue: number | null): { className?: string; style?: CSSProperties } =>
  hue === null ? {} : { className: "bucket-hued", style: { "--group-hue": hue } as CSSProperties };

/**
 * サイドバーの 1 つのプロジェクトのまとまりの色（SIDEBAR_BUCKET_COLORS。初めは付けない）。色はタブの列のまとまりと同じ（bucketHues.ts）。
 * - hueOf: 見出しの色（色を付けない・まとめないなら null）
 * - onContextMenu: 色を付けない見出し（No Group・固定・アーカイブ済み・作業場所）の右クリックで「まとまりを色付きで表示」だけのメニューを開く
 *   （まとめないときは undefined。自分で作ったグループの見出しは、グループのメニューの下に同じ項目を足す menuItem）
 */
export function useSidebarBucketColors(grouping: ChatGrouping, projectId: number) {
  const [on] = useSetting(SIDEBAR_BUCKET_COLORS);
  const ids = useMemo(() => [projectId], [projectId]);
  const hueOf = useBucketHueOf(grouping, ids, on);
  const menu = useContextMenu();
  const grouped = grouping !== "none";
  return {
    hueOf,
    onContextMenu: grouped
      ? (e: MouseEvent) => {
          e.stopPropagation();
          menu.open(e);
        }
      : undefined,
    menuItem: grouped ? <BucketColorItem setting={SIDEBAR_BUCKET_COLORS} /> : undefined,
    menuElement: menu.menu && (
      <PopupMenu at={menu.menu.at} label="まとまりの表示" onClose={menu.close}>
        <BucketColorItem setting={SIDEBAR_BUCKET_COLORS} />
      </PopupMenu>
    ),
  };
}
