-- 为 licenses 表添加 amount 字段
-- 执行方式：node backend/init-db.js（修改 init-db.js 中的 SQL）
-- 或者在 Zeabur MySQL Console 中直接执行

ALTER TABLE licenses ADD COLUMN amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00 AFTER max_devices;
