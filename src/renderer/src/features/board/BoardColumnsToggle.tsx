import { CircleDot, Folder } from "lucide-react";
import { useSetting } from "@/hooks/useSetting";
import { ALL_PROJECTS_BOARD_COLUMNS, BOARD_GROUPS_BY_STATE, PROJECT_LIST_FLAT } from "@/lib/storageKeys";
import { ToggleButtons } from "@/ui/ToggleButtons";

/** グループの列の中を状態で小分けにするか（全プロジェクトのボードの列の「状態」と「グループ」の両方オン = グループ×状態） */
export function useGroupsByState() {
  return useSetting(BOARD_GROUPS_BY_STATE);
}

/** 全プロジェクトのボードの列の分け方（状態ごと / 分けない。覚えておく） */
export function useAllProjectsColumns() {
  return useSetting(ALL_PROJECTS_BOARD_COLUMNS);
}

/** プロジェクトのボードのリストを状態で分けないか（覚えておく） */
export function useProjectListFlat() {
  return useSetting(PROJECT_LIST_FLAT);
}

/**
 * プロジェクトのボードのリストの分け方: 「状態」をオン・オフする（利用者の依頼。オン = 作業中・回答待ち・未読・既読のまとまり /
 * オフ = 下書きもチャットも状態で分けずに 1 つの並び）。リストのときだけ出す（ボード・表はいつも状態で分ける）。見た目は全プロジェクトのボードの「状態」と同じ
 */
export function ProjectListStateToggle() {
  const [flat, setFlat] = useProjectListFlat();
  return (
    <ToggleButtons<"state">
      className="view-toggle"
      label="リストの分け方"
      onToggle={() => setFlat(!flat)}
      options={[{ key: "state", label: "状態", icon: CircleDot, on: !flat, tip: "状態（作業中・回答待ち・未読・既読）で分ける（押すたびにオン・オフ。オフなら 1 つの並び）" }]}
    />
  );
}

/**
 * 全プロジェクトのボードの列の分け方。「状態」と「グループ」をそれぞれオン・オフする（利用者の依頼。前は 状態 / グループ / グループ×状態 / 分けない から 1 つを選んでいた）:
 * 状態だけ = 作業中・回答待ち・未読・既読と下書きの列 / グループだけ = プロジェクトの段ごとにグループの列 / 両方 = グループの列の中を状態で小分け（グループ×状態）/
 * どちらもオフ = 下書きもチャットも状態で分けずに 1 つの並び。覚える値は今までどおり（ALL_PROJECTS_BOARD_COLUMNS の state / groups / none と BOARD_GROUPS_BY_STATE）。
 * グループは、段がプロジェクトのとき（groups）だけ出す（グループはプロジェクトごとのもの）。ほかの段で「グループ」を覚えていれば、状態をオンにした形で出す
 */
export function AllProjectsColumnsToggle({ groups }: { groups: boolean }) {
  const [saved, setValue] = useAllProjectsColumns();
  const [byState, setByState] = useGroupsByState();
  const groupOn = groups && saved === "groups";
  const stateOn = groupOn ? byState : saved !== "none";
  const toggle = (key: "state" | "groups") => {
    if (key === "groups") {
      if (groupOn) setValue(byState ? "state" : "none");
      else {
        setByState(stateOn);
        setValue("groups");
      }
    } else if (groupOn) setByState(!byState);
    else setValue(stateOn ? "none" : "state");
  };
  return (
    <ToggleButtons<"state" | "groups">
      className="view-toggle"
      label="列の分け方"
      onToggle={toggle}
      options={[
        { key: "state", label: "状態", icon: CircleDot, on: stateOn, tip: "状態（作業中・回答待ち・未読・既読）で分ける（押すたびにオン・オフ。グループと両方オンなら、グループの列の中を状態で分ける）" },
        ...(groups
          ? [
              {
                key: "groups" as const,
                label: "グループ",
                icon: Folder,
                on: groupOn,
                tip: "プロジェクトごとにグループの列に分ける（押すたびにオン・オフ。カードをドラッグしてグループを移す）",
              },
            ]
          : []),
      ]}
    />
  );
}
