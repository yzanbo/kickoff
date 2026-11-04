import { File, SquareSlash } from "lucide-react";
import { cx } from "@/lib/cx";
import { PathParts } from "@/ui/PathParts";
import type { SuggestController } from "./useSuggest";

/** チャット欄の上に出す / と @ の候補（押すか Enter・Tab で入れる） */
export function SuggestList({ suggest }: { suggest: SuggestController }) {
  if (!suggest.open) return null;
  const { items, index, kind } = suggest;
  return (
    <div className="suggest-list" role="listbox" aria-label={kind === "slash" ? "コマンドの候補" : "ファイルの候補"}>
      <div className="suggest-head">{kind === "slash" ? "コマンド" : "ファイル"}</div>
      {suggest.loading ? (
        <p className="suggest-empty">読み込み中…</p>
      ) : items.length === 0 ? (
        <p className="suggest-empty">{kind === "slash" ? "使えるコマンドが見つかりません" : "ファイルが見つかりません"}</p>
      ) : (
        items.map((item, i) => (
          <button
            key={item.key}
            type="button"
            role="option"
            aria-selected={i === index}
            className={cx("suggest-item", i === index && "active")}
            // 押してもテキスト欄からフォーカスを外さない
            onMouseDown={(e) => e.preventDefault()}
            onMouseEnter={() => suggest.setIndex(i)}
            onClick={() => suggest.accept(item)}
          >
            {item.kind === "slash" ? (
              <>
                <SquareSlash size={14} aria-hidden />
                <span className="suggest-name">/{item.command.name}</span>
                {item.command.argument_hint && <span className="suggest-hint">{item.command.argument_hint}</span>}
                <span className="suggest-desc">{item.command.description}</span>
              </>
            ) : (
              <>
                <File size={14} aria-hidden />
                <PathParts path={item.path} nameClass="suggest-name" dirClass="suggest-desc" />
              </>
            )}
          </button>
        ))
      )}
    </div>
  );
}
