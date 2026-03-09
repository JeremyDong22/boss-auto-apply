# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述
Boss 直聘（zhipin.com）自动投递简历工具。核心是一个 Bookmarklet（当前 v10），注入到职位列表页后自动遍历卡片、点击"立即沟通"、关闭弹窗，实现批量投递。通过卡密授权系统分发给客户。

## 线上环境

| 服务 | URL | 类型 |
|------|-----|------|
| 前端（客户页） | https://boss-auto-apply-website.pages.dev/ | Cloudflare Pages |
| 前端（管理后台） | https://boss-auto-apply-website.pages.dev/admin.html | Cloudflare Pages |
| 后端 API | https://boss-auto-apply-api.hengd2.workers.dev | Cloudflare Worker |
| 数据库 | boss-license-db (741596d0-1cdd-4969-b336-c64a605472eb) | Cloudflare D1 |
| GitHub | https://github.com/JeremyDong22/boss-auto-apply (private) | |

## 架构

```
bookmarklet_auto_apply_v10.js   ← 核心投递脚本（压缩版 + 可读版在同一文件）
backend/
  worker-source.js              ← Cloudflare Worker 源码（生产环境）
  build.js                      ← 构建脚本：注入 v10 代码到 worker，输出 _worker.js
  wrangler.toml                 ← Worker 部署配置（D1 绑定）
  schema.sql                    ← D1 数据库表结构
  license_server.js             ← Node.js 本地开发服务器（端口 3456）
  manage_keys.js                ← 本地卡密管理 CLI 工具
  keys.json                     ← 本地开发数据（gitignored）
  _worker.js                    ← 构建产物（gitignored）
frontend/
  index.html                    ← 客户端：卡密输入 → 验证 → 获取 bookmarklet
  admin.html                    ← 管理后台：卡密管理 + 数据概览
archive/                        ← 历史版本和废弃文件
```

## 常用命令

```bash
# ---- 本地开发 ----
node backend/license_server.js                                # 启动本地服务器（端口 3456）
node backend/manage_keys.js generate                          # 生成卡密（本地）
node backend/manage_keys.js generate --days 7 --devices 3 --count 10
node backend/manage_keys.js list                              # 列出卡密（本地）

# ---- 生产部署 ----
cd backend && node build.js && wrangler deploy                # 构建并部署后端 Worker
wrangler pages deploy frontend/ --project-name=boss-auto-apply-website  # 部署前端
wrangler d1 execute boss-license-db --remote --file=backend/schema.sql  # 初始化 D1 表结构
```

## 关键流程

### 授权流程
1. 管理员在 admin.html 或用 `manage_keys.js` 生成卡密
2. 客户在 index.html 输入卡密 → 前端请求 `/api/check` 验证
3. 验证通过 → 前端生成个性化 loader bookmarklet（卡密 bake 在 href 里）
4. 客户拖拽书签到书签栏
5. 在 zhipin.com 点击书签 → bookmarklet 请求 `/api/verify`（带卡密+设备指纹）
6. 后端验证卡密+过期+设备数 → 返回 v10 投递代码 → 浏览器执行

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

### Bookmarklet 修改
- v10.js 文件结构：前 5 行是注释 + 压缩版（一行），后面是可读版源码
- 修改可读版后，需要同步更新压缩版（第 5 行）
- Worker 通过 build.js 从 v10.js 提取可读版（从 `(function () {` 开始到文件末尾）
- **修改 v10 后需要重新部署后端**：`cd backend && node build.js && wrangler deploy`

### 卡密系统
- 卡密格式：`BOSS-XXXX-XXXX`（去掉易混淆字符 I/O/0/1）
- 防暴力破解：IP 级别，阶梯锁定（5次→15分钟，10次→1小时，20次→24小时）
- 设备绑定：通过 fingerprint（屏幕+语言+时区+平台 hash）限制同时使用设备数
- 生产数据存储在 D1（boss-license-db），本地开发用 keys.json

### 部署架构
- 前端：Cloudflare Pages（boss-auto-apply-website），静态 HTML
- 后端：Cloudflare Worker（boss-auto-apply-api），绑定 D1 数据库
- 前端 `API_BASE` 自动检测：localhost 走本地，生产走 Workers URL
- 后端 Worker 无状态，所有数据（卡密、设备、限流）持久化在 D1

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
