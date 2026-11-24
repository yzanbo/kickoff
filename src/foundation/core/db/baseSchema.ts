/**
 * 土台の表（v1）: 設定（キーごとの JSON）・秘密の値（設定・SSE・応答に出さない）・この DB の印（database_id = 作ったときの ID。
 * 画面が ID 入りの保存を捨てる目印・スマホが本体を見分ける目印）。
 * スキーマの決まり: すべて STRICT。真偽値は CHECK (x IN (0, 1))、JSON は json_valid と json_type。値の一覧（状態など）は CHECK にしない
 * （増やすたびに表を作り直すことになるため）。時刻は NOW（ISO 8601）。表は機能ごとの core/schema.ts に置き、@/app/core/migrations.ts が並べる
 */
export const BASE_SCHEMA_V1 = `
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL CHECK (json_valid(value))
) STRICT;
CREATE TABLE secrets (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL CHECK (value <> '')
) STRICT;
CREATE TABLE meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
) STRICT;
INSERT INTO meta (key, value) VALUES ('database_id', lower(hex(randomblob(16))));
`;
