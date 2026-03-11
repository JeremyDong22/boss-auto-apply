#!/bin/bash
# quick-start.sh - 本地快速启动脚本

set -e

echo "🚀 Boss 自动投递 - Zeabur 版本本地启动"
echo "=========================================="

# 检查 Node.js
if ! command -v node &> /dev/null; then
    echo "❌ 未安装 Node.js，请先安装 Node.js 14.x 或更高版本"
    exit 1
fi

echo "✅ Node.js 版本: $(node -v)"

# 检查 MySQL
if ! command -v mysql &> /dev/null; then
    echo "⚠️  未检测到 MySQL 客户端，请确保 MySQL 服务器已安装并运行"
fi

# 进入 backend 目录
cd "$(dirname "$0")"

# 安装依赖
if [ ! -d "node_modules" ]; then
    echo "📦 安装依赖..."
    npm install
else
    echo "✅ 依赖已安装"
fi

# 检查环境变量文件
if [ ! -f ".env" ]; then
    echo "⚠️  未找到 .env 文件，从 .env.example 复制..."
    cp .env.example .env
    echo "📝 请编辑 .env 文件配置数据库连接信息"
    echo ""
    echo "需要配置的环境变量："
    echo "  - DB_HOST (默认: localhost)"
    echo "  - DB_PORT (默认: 3306)"
    echo "  - DB_USER (默认: root)"
    echo "  - DB_PASSWORD (必填)"
    echo "  - DB_NAME (默认: boss_auto_apply)"
    echo ""
    read -p "是否现在编辑 .env 文件? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        ${EDITOR:-nano} .env
    else
        echo "请手动编辑 .env 文件后重新运行此脚本"
        exit 0
    fi
fi

# 加载环境变量
export $(cat .env | grep -v '^#' | xargs)

# 检查数据库连接
echo "🔍 检查数据库连接..."
if mysql -h"${DB_HOST:-localhost}" -P"${DB_PORT:-3306}" -u"${DB_USER:-root}" -p"${DB_PASSWORD}" -e "SELECT 1" &> /dev/null; then
    echo "✅ 数据库连接成功"
else
    echo "❌ 数据库连接失败，请检查配置"
    exit 1
fi

# 检查数据库是否存在
DB_EXISTS=$(mysql -h"${DB_HOST:-localhost}" -P"${DB_PORT:-3306}" -u"${DB_USER:-root}" -p"${DB_PASSWORD}" -e "SHOW DATABASES LIKE '${DB_NAME:-boss_auto_apply}'" | grep -c "${DB_NAME:-boss_auto_apply}" || true)

if [ "$DB_EXISTS" -eq 0 ]; then
    echo "📊 创建数据库 ${DB_NAME:-boss_auto_apply}..."
    mysql -h"${DB_HOST:-localhost}" -P"${DB_PORT:-3306}" -u"${DB_USER:-root}" -p"${DB_PASSWORD}" -e "CREATE DATABASE ${DB_NAME:-boss_auto_apply} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
    echo "✅ 数据库创建成功"
fi

# 检查表是否存在
TABLE_EXISTS=$(mysql -h"${DB_HOST:-localhost}" -P"${DB_PORT:-3306}" -u"${DB_USER:-root}" -p"${DB_PASSWORD}" "${DB_NAME:-boss_auto_apply}" -e "SHOW TABLES LIKE 'licenses'" | grep -c "licenses" || true)

if [ "$TABLE_EXISTS" -eq 0 ]; then
    echo "📋 初始化数据库表..."
    mysql -h"${DB_HOST:-localhost}" -P"${DB_PORT:-3306}" -u"${DB_USER:-root}" -p"${DB_PASSWORD}" "${DB_NAME:-boss_auto_apply}" < schema-mysql.sql
    echo "✅ 数据库表创建成功"
else
    echo "✅ 数据库表已存在"
fi

# 启动服务器
echo ""
echo "🎉 准备就绪！启动服务器..."
echo "=========================================="
echo "服务器地址: http://localhost:${PORT:-3000}"
echo "健康检查: http://localhost:${PORT:-3000}/health"
echo "API 文档: 查看 ZEABUR_DEPLOY.md"
echo "=========================================="
echo ""

npm start
