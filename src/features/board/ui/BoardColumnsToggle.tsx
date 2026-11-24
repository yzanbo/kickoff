import { CircleDot, Folder } from "lucide-react";
import { useBoard } from "./BoardContext";
import { columnsOn, toggleColumns } from "./layout";
import { ToggleButtons } from "./ToggleButtons";

/**
 * ボードの列の分け方。「状態」と「グループ」をそれぞれオン・オフする（全プロジェクトのボードとプロジェクトのボードに置く）:
 * 状態だけ = 作業中・回答待ち・未読・既読と下書きの列 / グループだけ = グループの列（カードをドラッグしてグループを移す）/
 * 両方 = グループの列の中を状態で小分け（グループ×状態）/ どちらもオフ = 下書きもチャットも状態で分けずに 1 つの並び。
 * 覚える値は見え方の columns（state / groups / groupsState / none。オン・オフとの読み替えは layout.ts の toggleColumns）。
 * groups でなければ「グループ」を出さない（全プロジェクトのボードは段がプロジェクトのときだけ。グループはプロジェクトごとのもの。
 * プロジェクトのボードはボードのときだけ。リストでは段の「グループ」と同じ見た目になるため）。
 * 出さないときに「グループ」を覚えていれば、状態をオンにした形で出す
 */
export function BoardColumnsToggle() {
  const { kind, view, patch, layout } = useBoard();
  const allProjects = kind === "all";
  const groups = layout.groupsAvailable;
  const { groups: groupOn, state: stateOn } = columnsOn(view.columns, groups);
  const toggle = (key: "state" | "groups") => patch({ columns: toggleColumns(view.columns, groups, key) });
  return (
    <ToggleButtons<"state" | "groups">
      className="view-toggle"
      label="列の分け方"
      onToggle={toggle}
      // 並びは グループ | 状態（グループを出さないボードでは状態だけ）
      options={[
        ...(groups
          ? [
              {
                key: "groups" as const,
                label: "グループ",
                icon: Folder,
                on: groupOn,
                tip: allProjects
                  ? "プロジェクトごとにグループの列に分ける（押すたびにオン・オフ。カードをドラッグしてグループを移す）"
                  : "グループを列にして縦に並べる（押すたびにオン・オフ。カードをドラッグしてグループを移す）",
              },
            ]
          : []),
        { key: "state", label: "状態", icon: CircleDot, on: stateOn, tip: "状態（作業中・回答待ち・未読・既読）で分ける（押すたびにオン・オフ。グループと両方オンなら、グループの列の中を状態で分ける）" },
      ]}
    />
  );
}
