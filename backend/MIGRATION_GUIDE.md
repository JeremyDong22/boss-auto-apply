# 架构迁移对比

## Cloudflare Worker + D1 vs Zeabur Node.js + MySQL

### 数据库查询转换

#### D1 (SQLite)
```javascript
const row = await db.prepare('SELECT * FROM licenses WHERE code = ?').bind(keyCode).first();
const rows = await db.prepare('SELECT * FROM licenses').all();
```

#### MySQL (mysql2)
```javascript
const [rows] = await pool.execute('SELECT * FROM licenses WHERE code = ?', [keyCode]);
const row = rows[0];
const [allRows] = await pool.execute('SELECT * FROM licenses');
```

### 响应处理转换

#### Cloudflare Worker
```javascript
return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
});
```

#### Express
```javascript
res.status(200).json(data);
// 或简写
res.json(data);
```

### 请求处理转换

#### Cloudflare Worker
```javascript
export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        const body = await request.json();
        const ip = request.headers.get('CF-Connecting-IP');
    }
}
```

#### Express
```javascript
app.post('/api/endpoint', async (req, res) => {
    const body = req.body;
    const ip = req.headers['cf-connecting-ip'] || req.ip;
});
```

### 环境变量

#### Cloudflare Worker
```javascript
const password = env.ADMIN_PASSWORD;
const db = env.DB;
```

#### Node.js
```javascript
const password = process.env.ADMIN_PASSWORD;
// 数据库连接通过 mysql2 连接池
```

### SQL 语法差异

#### SQLite (D1)
```sql
-- 自增主键
id INTEGER PRIMARY KEY AUTOINCREMENT

-- 文本类型
code TEXT PRIMARY KEY

-- 布尔值
disabled INTEGER NOT NULL DEFAULT 0

-- UPSERT
INSERT INTO table (key, value) VALUES (?, ?)
ON CONFLICT(key) DO UPDATE SET value = ?
```

#### MySQL
```sql
-- 自增主键
id BIGINT PRIMARY KEY AUTO_INCREMENT

-- 文本类型
code VARCHAR(20) PRIMARY KEY

-- 布尔值
disabled TINYINT(1) NOT NULL DEFAULT 0

-- UPSERT
INSERT INTO table (`key`, value) VALUES (?, ?)
ON DUPLICATE KEY UPDATE value = ?
```

### 时区处理

#### D1
```javascript
// ISO 字符串存储
created_at TEXT NOT NULL
// 存储时
const now = new Date().toISOString();
```

#### MySQL
```javascript
// DATETIME 类型
created_at DATETIME NOT NULL
// 连接池配置时区
timezone: '+08:00'
// 存储时
const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
```

### 部署方式

#### Cloudflare Worker
```bash
cd backend
node build.js  # 注入 bookmarklet 代码
npx wrangler deploy
```

#### Zeabur
```bash
# 方式 1: GitHub 自动部署（推荐）
git push origin main

# 方式 2: CLI 手动部署
cd backend
zeabur deploy
```

### 成本对比

| 项目 | Cloudflare | Zeabur |
|------|-----------|--------|
| 免费额度 | 100k 请求/天 | 取决于套餐 |
| 数据库 | D1 免费 5GB | MySQL 按套餐 |
| 流量 | 无限 | 按套餐 |
| 自定义域名 | 免费 | 免费 |
| SSL | 自动 | 自动 |

### 性能对比

| 指标 | Cloudflare Worker | Zeabur Node.js |
|------|------------------|----------------|
| 冷启动 | ~10ms | ~100-500ms |
| 全球分发 | 是（边缘计算） | 否（单区域） |
| 并发处理 | 自动扩展 | 受限于实例 |
| 数据库延迟 | 低（同区域） | 取决于网络 |

### 功能完整性

✅ 所有功能已完整迁移：
- 卡密验证和设备绑定
- 防暴力破解机制
- 使用统计追踪
- 管理员后台
- 联系方式管理
- 超薄 loader 架构

### 注意事项

1. **Bookmarklet 代码加载**：Zeabur 版本在服务器启动时从文件系统读取，确保 `bookmarklet_auto_apply_v10.js` 在正确位置

2. **数据库连接池**：已配置最大 10 个连接，生产环境可根据负载调整

3. **错误处理**：所有路由都包含 try-catch，避免服务器崩溃

4. **CORS 配置**：已允许所有来源，生产环境建议限制为前端域名

5. **日志记录**：使用 console.log/error，生产环境建议接入专业日志服务

6. **健康检查**：可添加 `/health` 端点供 Zeabur 监控使用
