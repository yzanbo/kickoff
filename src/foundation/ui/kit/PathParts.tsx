import { splitPath } from "@/foundation/ui/lib/format";

/**
 * ファイルのパスを、名前（先に）とフォルダ（後ろに薄く）に分けて並べる（分け方は splitPath）。見た目は置く場所で違うので、2 つの span のクラスを渡す。フォルダがなければ名前だけ。
 * suffix は名前の後ろに添える文字（フォルダの「/」など）。order が path-first ならフォルダを先に並べる
 */
export function PathParts({
  path,
  nameClass,
  dirClass,
  suffix,
  order = "name-first",
}: {
  path: string;
  nameClass: string;
  dirClass: string;
  suffix?: string;
  order?: "name-first" | "path-first";
}) {
  const { name, dir } = splitPath(path);
  const dirPart = dir && <span className={dirClass}>{dir}</span>;
  return (
    <>
      {order === "path-first" && dirPart}
      <span className={nameClass}>
        {name}
        {suffix}
      </span>
      {order === "name-first" && dirPart}
    </>
  );
}
