-- schema-mysql.sql - v1
-- Boss 自动投递 - MySQL 数据库表结构
-- 从 D1 (SQLite) 迁移到 MySQL
-- 部署到 Zeabur 后在 MySQL 控制台执行

CREATE TABLE IF NOT EXISTS licenses (
  code VARCHAR(20) PRIMARY KEY,
  days INT NOT NULL,
  max_devices INT NOT NULL DEFAULT 2,
  created_at DATETIME NOT NULL,
  activated_at DATETIME DEFAULT NULL,
  disabled TINYINT(1) NOT NULL DEFAULT 0,
  note VARCHAR(200) DEFAULT ''
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS devices (
  license_code VARCHAR(20) NOT NULL,
  fingerprint VARCHAR(255) NOT NULL,
  first_seen DATETIME NOT NULL,
  last_seen DATETIME NOT NULL,
  PRIMARY KEY (license_code, fingerprint),
  FOREIGN KEY (license_code) REFERENCES licenses(code) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS rate_limits (
  ip VARCHAR(45) PRIMARY KEY,
  failures INT NOT NULL DEFAULT 0,
  blocked_until DATETIME DEFAULT NULL,
  last_attempt DATETIME DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 每日投递汇总（永久保留，每个卡密每天一行）
CREATE TABLE IF NOT EXISTS daily_stats (
  license_code VARCHAR(20) NOT NULL,
  date DATE NOT NULL,
  applied INT NOT NULL DEFAULT 0,
  skipped INT NOT NULL DEFAULT 0,
  PRIMARY KEY (license_code, date),
  FOREIGN KEY (license_code) REFERENCES licenses(code) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 投递详细记录（保留90天，含岗位名称和薪资）
CREATE TABLE IF NOT EXISTS apply_logs (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  license_code VARCHAR(20) NOT NULL,
  job_name VARCHAR(255) DEFAULT NULL,
  salary VARCHAR(100) DEFAULT NULL,
  applied_at DATETIME NOT NULL,
  INDEX idx_license_code (license_code),
  INDEX idx_applied_at (applied_at),
  FOREIGN KEY (license_code) REFERENCES licenses(code) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 全局配置（微信号、二维码等）
CREATE TABLE IF NOT EXISTS settings (
  `key` VARCHAR(50) PRIMARY KEY,
  value MEDIUMTEXT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
