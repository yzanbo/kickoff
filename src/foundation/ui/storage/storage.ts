// 殻の保存（DB の ID・テーマ・最後に見ていた画面・下の帯の出し方）。起動の片付け（prepareStorage.ts）と同じフォルダに置く
// （テーマ・ルーター・下の帯のどれからも、兄弟のフォルダの循環なしに読めるように）
import { defineSettings, single } from "./groups";
import { choice, text } from "./settings";
import { THEME_CHOICES } from "@shared/foundation/theme/backgrounds";

export const storage = defineSettings("shell", {
  /** いまの DB の ID（GET /api/status の database_id。変わったら、ID を含むものを捨ててから覚え直す） */
  databaseId: text(),
  /** テーマ（dark / light / system = システムに合わせる）。起動直後の骨組み（public/boot.js）も同じキーと値を直接読む */
  theme: choice(THEME_CHOICES, "dark"),
  /** 最後に見ていた画面（URL のハッシュ）。起動したとき・ウィンドウを作り直したときに開く（app/router.ts の restoreLastRoute） */
  lastRoute: single(text(), { ids: true }),
  /** 下の帯（フッター）の出し方（show = 表示 / hover = 下端に寄せたときだけ表示 / hide = 非表示。features/footer/footerMode.ts） */
  footerMode: choice(["show", "hover", "hide"], "show"),
});
