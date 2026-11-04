import { splitPath } from "@/lib/format";

/**
 * ファイルのパスを、名前（先に）とフォルダ（後ろに薄く）に分けて並べる（変更の一覧・コミットのファイル・コードの検索の結果・@ の候補・参照資料で共通。
 * 分け方は splitPath）。見た目は置く場所で違うので、2 つの span のクラスを渡す。フォルダがなければ名前だけ。
 * suffix は名前の後ろに添える文字（フォルダの「/」など）
 */
export function PathParts({ path, nameClass, dirClass, suffix }: { path: string; nameClass: string; dirClass: string; suffix?: string }) {
  const { name, dir } = splitPath(path);
  return (
    <>
      <span className={nameClass}>
        {name}
        {suffix}
      </span>
      {dir && <span className={dirClass}>{dir}</span>}
    </>
  );
}
