-- schema.sql - v3
-- Boss 自动投递 - D1 数据库表结构
-- 新增 settings 表存储微信号和二维码等配置
-- 部署后在 Cloudflare Dashboard > D1 > 你的数据库 > Console 中执行

CREATE TABLE IF NOT EXISTS licenses (
  code TEXT PRIMARY KEY,
  days INTEGER NOT NULL,
  max_devices INTEGER NOT NULL DEFAULT 2,
  created_at TEXT NOT NULL,
  activated_at TEXT,
  disabled INTEGER NOT NULL DEFAULT 0,
  note TEXT DEFAULT ''
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

-- 每日投递汇总（永久保留，每个卡密每天一行）
CREATE TABLE IF NOT EXISTS daily_stats (
  license_code TEXT NOT NULL,
  date TEXT NOT NULL,
  applied INTEGER NOT NULL DEFAULT 0,
  skipped INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (license_code, date)
);

-- 投递详细记录（保留90天，含岗位名称和薪资）
CREATE TABLE IF NOT EXISTS apply_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  license_code TEXT NOT NULL,
  job_name TEXT,
  salary TEXT,
  applied_at TEXT NOT NULL
);

-- 全局配置（微信号、二维码等）
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
