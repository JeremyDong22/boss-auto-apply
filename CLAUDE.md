# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述
Boss 直聘（zhipin.com）自动投递简历工具。核心是一个 Bookmarklet（当前 v10），注入到职位列表页后自动遍历卡片、点击"立即沟通"、关闭弹窗，实现批量投递。通过卡密授权系统分发给客户。

## 架构

```
bookmarklet_auto_apply_v10.js   ← 核心脚本（压缩版 + 可读版在同一文件）
backend/
  license_server.js             ← Node.js 卡密验证服务器（端口 3456）
  manage_keys.js                ← 卡密管理 CLI 工具
  keys.json                     ← 卡密数据存储
frontend/
  index.html                    ← 客户端：卡密输入 → 验证 → 获取 bookmarklet
  admin.html                    ← 管理后台：卡密管理 + 数据概览
archive/                        ← 历史版本和废弃文件
  bookmarklet_auto_apply_v7~v9.js
  bookmarklet_grab_*.js         ← DOM 抓取辅助工具
  local_license_server.js       ← 早期单卡密测试服务器
  website_v1_build.js           ← v1 静态加密方案（已废弃）
```

## 常用命令

```bash
# 启动卡密验证服务器（本地开发）
node backend/license_server.js

# 卡密管理
node backend/manage_keys.js generate                          # 生成 1 个卡密（默认30天/2设备）
node backend/manage_keys.js generate --days 7 --devices 3 --count 10  # 批量生成
node backend/manage_keys.js list                              # 列出所有卡密
node backend/manage_keys.js info BOSS-XXXX-XXXX               # 查看详情
node backend/manage_keys.js disable BOSS-XXXX-XXXX            # 禁用
node backend/manage_keys.js enable BOSS-XXXX-XXXX             # 启用
```

## 关键流程

### 授权流程
1. 管理员用 `manage_keys.js` 生成卡密
2. 客户在 `index.html` 输入卡密 → 请求 `license_server.js` 的 `/api/verify` 验证
3. 验证通过 → 服务器返回 bookmarklet 可读版源码（从 v10.js 提取 IIFE 部分）
4. 前端将源码包装成 `javascript:void(...)` 格式显示给用户拖拽到书签栏

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
- 服务器提取的是可读版（从 `(function () {` 开始到文件末尾）

### 卡密系统
- 卡密格式：`BOSS-XXXX-XXXX`（去掉易混淆字符 I/O/0/1）
- 防暴力破解：IP 级别，阶梯锁定（5次→15分钟，10次→1小时，20次→24小时）
- 设备绑定：通过 fingerprint 限制同时使用设备数
- 数据存储在 `keys.json`（内存 + 文件，重启不丢数据，但 IP 锁定记录仅内存）

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
