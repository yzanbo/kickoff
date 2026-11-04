import type { CSSProperties } from "react";
import type { CodeToken } from "@/lib/highlight";

const styleOf = ({ color, fontStyle = 0 }: CodeToken): CSSProperties => ({
  color,
  fontStyle: fontStyle & 1 ? "italic" : undefined,
  fontWeight: fontStyle & 2 ? 600 : undefined,
  textDecoration: fontStyle & 4 ? "underline" : undefined,
});

/** コードの 1 行（色が届いていれば色付きの断片、まだなら文字のまま） */
export function CodeLine({ tokens, text }: { tokens?: CodeToken[]; text: string }) {
  if (!tokens) return <>{text}</>;
  return (
    <>
      {tokens.map((token, i) => (
        <span key={i} style={styleOf(token)}>
          {token.content}
        </span>
      ))}
    </>
  );
}
