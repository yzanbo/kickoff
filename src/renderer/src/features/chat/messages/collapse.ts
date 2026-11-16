/** 自分の発言を折りたたむ高さ（これより高い発言は、ここまで出して下を薄くする。messages.css の .bubble-text.clamped と同じ） */
export const COLLAPSE_PX = 240;

/** 折りたたむほど長いか（折りたたむ高さを 40px 以上超えるときだけ。少しだけはみ出すものは畳まない）。height は文の本当の高さ */
export const shouldCollapse = (height: number): boolean => height > COLLAPSE_PX + 40;
