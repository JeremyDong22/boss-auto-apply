-- schema.sql - v1
-- Boss 自动投递 - D1 数据库表结构
-- 部署后在 Cloudflare Dashboard > D1 > 你的数据库 > Console 中执行

CREATE TABLE IF NOT EXISTS licenses (
  code TEXT PRIMARY KEY,
  days INTEGER NOT NULL,
  max_devices INTEGER NOT NULL DEFAULT 2,
  created_at TEXT NOT NULL,
  activated_at TEXT,
  disabled INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS devices (
  license_code TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  first_seen TEXT NOT NULL,
  last_seen TEXT NOT NULL,
  PRIMARY KEY (license_code, fingerprint)
);

CREATE TABLE IF NOT EXISTS rate_limits (
  ip TEXT PRIMARY KEY,
  failures INTEGER NOT NULL DEFAULT 0,
  blocked_until TEXT,
  last_attempt TEXT
);
