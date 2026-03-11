# Zeabur 部署指南

本目录包含 Boss 自动投递项目的 Zeabur 部署版本（Node.js + Express + MySQL）。

## 文件说明

- `server.js` - Express 服务器主文件
- `schema-mysql.sql` - MySQL 数据库表结构
- `package.json` - Node.js 依赖配置
- `.env.example` - 环境变量示例

## 部署步骤

### 1. 在 Zeabur 创建项目

1. 登录 Zeabur 控制台
2. 创建新项目
3. 添加 MySQL 服务（Zeabur 会自动提供连接信息）

### 2. 配置环境变量

在 Zeabur 项目设置中添加以下环境变量：

```
PORT=3000
DB_HOST=<Zeabur MySQL 主机>
DB_PORT=3306
DB_USER=<Zeabur MySQL 用户名>
DB_PASSWORD=<Zeabur MySQL 密码>
DB_NAME=boss_auto_apply
ADMIN_PASSWORD=bossboss
```

注意：Zeabur MySQL 服务会自动提供 `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_USER`, `MYSQL_PASSWORD` 等环境变量，你可以直接使用这些变量名，或者在 Zeabur 控制台手动映射。

### 3. 初始化数据库

连接到 Zeabur MySQL 数据库，执行 `schema-mysql.sql` 文件：

```bash
mysql -h <host> -P 3306 -u <user> -p < backend/schema-mysql.sql
```

或者在 Zeabur MySQL 控制台直接粘贴执行。

### 4. 部署服务

#### 方式 1：通过 GitHub 自动部署（推荐）

1. 将代码推送到 GitHub
2. 在 Zeabur 项目中添加 Git 服务
3. 选择你的 GitHub 仓库和分支
4. Zeabur 会自动检测 `package.json` 并部署

#### 方式 2：使用 Zeabur CLI 手动部署

```bash
# 安装 Zeabur CLI
npm install -g @zeabur/cli

# 登录
zeabur auth login

# 切换到项目（使用项目 ID）
zeabur context set project --id=<your-project-id>

# 部署（在 backend 目录下执行）
cd backend
zeabur deploy
```

### 5. 配置自定义域名

在 Zeabur 控制台为服务配置自定义域名，例如 `boss-api.yourdomain.com`。

### 6. 更新前端 API 地址

修改前端代码中的 API 地址，指向 Zeabur 部署的服务：

```javascript
// frontend/index.html 和 admin.html
const API_BASE = 'https://boss-api.yourdomain.com';
```

## 本地开发

```bash
# 安装依赖
cd backend
npm install

# 配置环境变量
cp .env.example .env
# 编辑 .env 填入本地 MySQL 配置

# 初始化数据库
mysql -u root -p < schema-mysql.sql

# 启动服务器
npm start
```

服务器将在 http://localhost:3000 启动。

## API 端点

所有端点与 Cloudflare Worker 版本保持一致：

- `GET /api/loader` - 超薄 loader 脚本
- `GET /api/verify` - 卡密验证
- `GET /api/check` - 卡密检查
- `GET /api/contact` - 获取联系方式
- `POST /api/report` - 投递上报
- `POST /api/admin/login` - 管理员登录
- `GET /api/admin/keys` - 获取卡密列表
- `POST /api/admin/generate` - 生成卡密
- `POST /api/admin/disable` - 禁用卡密
- `POST /api/admin/enable` - 启用卡密
- `POST /api/admin/note` - 更新备注
- `POST /api/admin/delete` - 删除卡密
- `GET /api/admin/blocked` - 获取封禁 IP
- `POST /api/admin/unblock` - 解封 IP
- `GET /api/admin/stats` - 获取统计
- `GET /api/admin/contact` - 获取联系方式（管理员）
- `POST /api/admin/contact` - 更新联系方式
- `POST /api/admin/cleanup` - 清理旧日志

## 数据迁移

如果需要从 Cloudflare D1 迁移数据到 MySQL：

1. 从 D1 导出数据（使用 Cloudflare Dashboard 或 wrangler CLI）
2. 转换 SQLite 语法到 MySQL 语法
3. 导入到 Zeabur MySQL

## 监控和日志

在 Zeabur 控制台可以查看：
- 服务运行状态
- 实时日志
- 资源使用情况
- 请求统计

## 故障排查

### 数据库连接失败

检查环境变量是否正确配置，确保 MySQL 服务正常运行。

### Bookmarklet 代码未加载

确保 `bookmarklet_auto_apply_v10.js` 文件在项目根目录，且服务器启动时能正确读取。

### CORS 错误

服务器已配置 CORS 允许所有来源，如需限制请修改 `cors()` 配置。

## 性能优化

- 数据库连接池已配置（最大 10 个连接）
- 使用索引优化查询性能
- 考虑添加 Redis 缓存热点数据
- 使用 CDN 加速静态资源

## 安全建议

- 修改默认管理员密码
- 使用强密码策略
- 定期备份数据库
- 监控异常请求
- 启用 HTTPS（Zeabur 自动提供）
