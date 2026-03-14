# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述
Boss 直聘（zhipin.com）自动投递简历工具。核心是一个 Bookmarklet（当前 v13），注入到职位列表页后自动遍历卡片、点击"立即沟通"、关闭弹窗，实现批量投递。通过卡密授权系统分发给客户。

## 线上环境

### Zeabur 部署（当前生产环境 - 阿里云）
| 服务 | URL | 说明 |
|------|-----|------|
| 前端（客户页） | https://boss-frontend.preview.aliyun-zeabur.cn | 卡密输入 + Bookmarklet 下载 |
| 前端（管理后台） | https://boss-frontend.preview.aliyun-zeabur.cn/admin.html | 卡密管理 + 数据统计 |
| 后端 API | https://boss-backend.preview.aliyun-zeabur.cn | Node.js + Express + MySQL |
| 数据库 | Zeabur MySQL (内部网络) | 47.108.220.1:31414 (外部访问) |
| GitHub | https://github.com/JeremyDong22/boss-auto-apply (private) | 主仓库 |

**部署方式**：GitHub push → Zeabur 自动部署
**数据库连接**：后端通过 Zeabur 内部网络自动连接（MYSQL_HOST 等环境变量）

### Cloudflare 部署（已废弃）
| 服务 | URL | 状态 |
|------|-----|------|
| 前端 | https://boss-auto-apply-website.pages.dev/ | ❌ 已停用 |
| 后端 | https://boss.smartice.ai | ❌ 已停用 |
| 数据库 | boss-license-db (D1) | ❌ 已停用 |

## 管理员信息

- **管理后台地址**: https://boss-frontend.preview.aliyun-zeabur.cn/admin.html
- **管理员密码**: `bossboss`（环境变量 `ADMIN_PASSWORD`）
- **认证方式**: 密码登录 → sessionStorage 存储 → 所有 admin API 请求带 `Bearer <password>` 头
- **客服微信**: xmin9805

## 架构

```
backend/
  bookmarklet_auto_apply.js     ← 核心投递脚本 v13（唯一副本，server.js 启动时读取）
  server.js                     ← Zeabur Node.js 服务器（生产环境，ESM）
  license_server.js             ← Node.js 本地开发服务器（端口 3456，用 keys.json）
  schema-mysql.sql              ← MySQL 数据库表结构（6 张表）
  init-db.js                    ← 远程数据库初始化/迁移脚本
  manage_keys.js                ← 本地卡密管理 CLI 工具
  package.json                  ← Node.js 依赖（express, mysql2, cors）
  .env.example                  ← 环境变量模板
  keys.json                     ← 本地开发数据（gitignored）
  worker-source.js              ← Cloudflare Worker 源码（旧）
  build.js / wrangler.toml / schema.sql  ← Cloudflare 相关（旧）
frontend/
  index.html                    ← 客户端：卡密输入 → 验证 → 获取 bookmarklet
  admin.html                    ← 管理后台：卡密管理 + 数据概览
  images/                       ← ClawBoss 吉祥物图片
archive/                        ← 历史版本和废弃文件
```

## 常用命令

```bash
# ---- 本地开发 ----
node backend/license_server.js                                # 启动本地服务器（端口 3456）
node backend/manage_keys.js generate                          # 生成卡密（本地）
node backend/manage_keys.js generate --days 7 --devices 3 --count 10
node backend/manage_keys.js list                              # 列出卡密（本地）

# ---- Zeabur 生产部署 ----
# 前后端通过 GitHub push 自动部署，无需手动操作
git push origin main                                          # 推送代码 → Zeabur 自动部署

# ---- Zeabur 数据库操作 ----
# 方式 1：使用 Node.js 脚本（推荐）
cd backend && node init-db.js                                 # 初始化数据库表结构
# 修改 init-db.js 中的 SQL 语句可执行任意数据库操作

# 方式 2：使用 MySQL 客户端（需要本地安装 mysql）
mysql -h 47.108.220.1 -P 31414 -u root -p'<password>' zeabur < backend/schema-mysql.sql

# 方式 3：Zeabur 控制台
# 在 Zeabur MySQL 服务页面 → Console 标签页 → 直接执行 SQL

# ---- Cloudflare 部署（已废弃） ----
cd backend && node build.js && npx wrangler deploy                        # 构建并部署后端 Worker
npx wrangler pages deploy frontend/ --project-name=boss-auto-apply-website  # 部署前端 Pages
npx wrangler d1 execute boss-license-db --remote --file=backend/schema.sql  # 初始化 D1 表结构
# 注意：git push 不会触发自动部署！每次改了前端或后端都需要手动 wrangler 部署
```

## API 端点

### 客户端 API
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/loader` | 返回 JS 代码（登录面板 + 验证逻辑），书签入口 |
| GET | `/api/verify?code=&fp=` | 验证卡密+设备指纹 → 返回投递脚本代码 |
| GET | `/api/check?code=` | 检查卡密状态（不消耗设备名额） |
| GET | `/api/contact` | 获取客服联系方式（微信号/二维码） |
| POST | `/api/report` | 投递结果上报（applied/skipped/job 列表） |

### 管理后台 API（需 `Bearer <password>` 认证）
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/admin/login` | 管理员登录验证 |
| GET | `/api/admin/keys` | 卡密列表（支持分页、搜索、排序） |
| POST | `/api/admin/generate` | 批量生成卡密 |
| POST | `/api/admin/disable` / `enable` | 禁用/启用卡密 |
| POST | `/api/admin/delete` | 删除卡密 |
| POST | `/api/admin/note` | 修改卡密备注 |
| GET | `/api/admin/stats` | 投递统计数据 |
| GET/POST | `/api/admin/contact` | 获取/更新客服联系方式 |
| GET | `/api/admin/blocked` | 查看被封锁 IP |
| POST | `/api/admin/unblock` | 解封 IP |
| POST | `/api/admin/cleanup` | 清理过期数据 |

## 数据库表（MySQL，schema-mysql.sql）
| 表名 | 用途 |
|------|------|
| `licenses` | 卡密主表（code, days, max_devices, amount, activated_at, disabled） |
| `devices` | 设备绑定（license_code + fingerprint 联合主键） |
| `rate_limits` | IP 防暴力破解（failures, blocked_until） |
| `daily_stats` | 每日投递汇总（license_code + date，永久保留） |
| `apply_logs` | 投递详细记录（job_name, salary，保留 90 天） |
| `settings` | 全局配置 KV（客服微信号、二维码等） |

## 关键流程

### 授权流程（超薄 loader 架构）
1. 管理员在 admin.html 或用 `manage_keys.js` 生成卡密
2. 客户在 index.html 拖拽超薄书签（~120 字符，仅含 fetch 调用）到书签栏
3. 在 zhipin.com 点击书签 → fetch `/api/loader` → eval 返回的 JS（含登录面板 + 验证逻辑）
4. 首次使用弹出登录面板输入卡密 → 存 localStorage → 请求 `/api/verify`（带卡密+设备指纹）
5. 后端验证卡密+过期+设备数 → 返回 v13 投递代码 → 浏览器执行
6. 所有 UI（登录面板 + v13 面板）均从服务器加载，修改无需用户重新拖书签
7. 唯一需要重新拖书签的情况：修改 API 域名

### 投递流程（Bookmarklet 在 Boss 页面内执行）
1. 点击左侧职位卡片（`.job-card-wrap`） → 右侧展开详情
2. 点击"立即沟通" → **此时消息已发送**
3. 弹窗出现 → 点击"留在此页"（`.cancel-btn`）关闭弹窗（**不要点"继续沟通"**，会跳转）
4. **重新查询卡片列表**（Vue SPA 可能重新渲染 DOM，缓存节点会失效）
5. 滚动到下一个卡片，重复；当前页遍历完后 `window.scrollTo` 到底部触发懒加载

## Boss 直聘 DOM 结构（已确认）

### 职位列表页 `https://www.zhipin.com/web/geek/jobs?ka=header-jobs`
- 卡片列表：`ul.rec-job-list` > `div.card-area` > `div.job-card-wrap`（点击目标）
- 职位名称：`.job-name`，薪资：`.job-salary`
- "立即沟通"按钮：右侧详情面板中的 `a` 标签（用 `findBtn('立即沟通')` 文本匹配）
- "继续沟通"按钮：已沟通过的职位，检测到则跳过

### 弹窗结构
- 投递成功弹窗：`.greet-boss-dialog`，关闭用 `.cancel-btn`（留在此页）
- 限流弹窗：`.chat-block-dialog`（每日 150 人上限），关闭用 `.chat-block-footer .sure-btn`

## 技术债

- [ ] Boss 直聘在约 120 人沟通时可能弹出提示弹窗（具体 DOM 结构待确认），目前脚本未检测。需抓取该弹窗 HTML 确认选择器后添加检测逻辑。

### 滚动机制
- **滚动容器是 `window`**（不是 `.job-list-container`，后者 overflow: visible 不可滚动）
- 懒加载触发条件：`window.scrollTo(0, document.body.scrollHeight)` 滚到底部附近
- 每次加载 15 张新卡片

## Boss 反自动化机制
- 检测 CDP 连接 → `window.close()` 关页面（CDP/MCP 方案不可行）
- 检测 `navigator.webdriver`
- 拦截 F12 / Cmd+Option+I
- 打开 DevTools 后不断跳转（anti-debugger）
- **Bookmarklet 注入不触发任何检测**

## 开发注意事项

### Debug 代码规范
- **所有 debug 代码必须提供 Bookmarklet 格式**，可以直接拖到书签栏运行
- 格式：`javascript:(function(){...})();` 或 `javascript:void(function(){...})();`
- 自动复制到剪贴板，用户直接粘贴到书签栏使用
- Boss 页面无法打开 F12 控制台（反调试机制），所以 debug 必须用书签方式

### Bookmarklet 修改
- 唯一源文件：`backend/bookmarklet_auto_apply.js`（server.js 启动时从此读取）
- 文件结构：前几行注释 + 可读版源码（从 `(function () {` 开始）
- 修改后 `git push` 即可，Zeabur 自动部署
- **注意：不要在项目根目录创建同名副本，避免双份不同步**

### 卡密系统
- 卡密格式：`BOSS-XXXX-XXXX`（去掉易混淆字符 I/O/0/1）
- 防暴力破解：IP 级别，阶梯锁定（5次→15分钟，10次→1小时，20次→24小时）
- 设备绑定：通过 fingerprint（屏幕+语言+时区+平台 hash）限制同时使用设备数
- 生产数据存储在 Zeabur MySQL，本地开发用 keys.json

### 部署架构
- 前端：Zeabur 静态部署（boss-frontend）
- 后端：Zeabur Node.js 服务（boss-backend），连接 Zeabur MySQL
- 前端 `API_BASE` 自动检测：localhost 走本地，生产走 Zeabur URL
- 部署方式：`git push origin main` → Zeabur 自动部署

### 已弃用方案
- CDP/MCP 方案：Boss 检测 CDP → 关页面
- Tampermonkey 油猴：Chrome Manifest V3 限制注入
- v1 静态加密方案（website_v1_build.js）：改为服务端卡密验证

## Bookmarklet 版本历史
| 版本 | 主要变化 |
|------|---------|
| v7 | 每次循环重新查询卡片列表，修复 Vue 重渲染后 DOM 失效 |
| v8 | realClick 模拟真实鼠标事件，多点击目标尝试 |
| v9 | 无限滚动（window.scrollTo 到底触发加载）+ 跳过已沟通 + 三计数面板 |
| **v10** | 限流弹窗(.chat-block-dialog)全程检测，触发后面板变红、自动停止 |
| v11 | 每次开始投递前先验证卡密有效性 |
| v12 | 面板添加 ClawBoss 吉祥物头像，解码 Boss PUA 字体加密薪资 |
| **v13** | 停下后显示"继续"和"重开"按钮，版本号弱化至面板右下角 |
