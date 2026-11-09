import type { CSSProperties, MouseEvent, ReactNode } from "react";
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
 * サイドバーの 1 つのプロジェクトのまとまりの色（SIDEBAR_BUCKET_COLORS。初めは付ける）。色はタブの列のまとまりと同じ（bucketHues.ts）。
 * - hueOf: 見出しの色（色を付けない・まとめないなら null）
 * - onContextMenu: 色を付けない見出し（No Group・固定・アーカイブ済み・作業場所）の右クリックで「まとまりを色付きで表示」のメニューを開く
 *   （lead を渡すと、その項目を上に置いて区切り線で分ける。No Group の「新しいチャット」。
 *   まとめないときは undefined。自分で作ったグループの見出しは、グループのメニューの下に同じ項目を足す menuItem）
 */
export function useSidebarBucketColors(grouping: ChatGrouping, projectId: number) {
  const [on] = useSetting(SIDEBAR_BUCKET_COLORS);
  const ids = useMemo(() => [projectId], [projectId]);
  const hueOf = useBucketHueOf(grouping, ids, on);
  const menu = useContextMenu<ReactNode>();
  const grouped = grouping !== "none";
  return {
    hueOf,
    onContextMenu: grouped
      ? (e: MouseEvent, lead?: ReactNode) => {
          e.stopPropagation();
          menu.open(e, lead);
        }
      : undefined,
    menuItem: grouped ? <BucketColorItem setting={SIDEBAR_BUCKET_COLORS} /> : undefined,
    menuElement: menu.menu && (
      <PopupMenu at={menu.menu.at} label="まとまりの表示" onClose={menu.close}>
        {menu.menu.value && (
          <>
            {menu.menu.value}
            <div className="menu-separator" role="separator" />
          </>
        )}
        <BucketColorItem setting={SIDEBAR_BUCKET_COLORS} />
      </PopupMenu>
    ),
  };
}
