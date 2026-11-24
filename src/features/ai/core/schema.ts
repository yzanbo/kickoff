/**
 * ai の表（v1）。project_ai_defaults はプロジェクトの AI ごとのチャットの既定（options は ChatOptionsPatch = 書いた項目だけ。書いていない項目はアプリの設定のその AI の既定）。
 * provider は AI の ID（値の一覧なので CHECK にしない）
 */
export const AI_SCHEMA_V1 = `
CREATE TABLE project_ai_defaults (
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider <> ''),
  options TEXT NOT NULL CHECK (json_valid(options) AND json_type(options) = 'object'),
  PRIMARY KEY (project_id, provider)
) STRICT;
`;
