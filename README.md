<div align="center">

# ClawBoss

### 约面交给我，你赶紧去学习

**Boss 直聘自动投递简历工具** — 一键批量沟通心仪职位，让求职效率翻倍

[![License](https://img.shields.io/badge/License-MIT-00bebd?style=flat-square)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-18+-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org)
[![Platform](https://img.shields.io/badge/Platform-Chrome-4285F4?style=flat-square&logo=google-chrome&logoColor=white)](https://www.google.com/chrome/)

</div>

---

## 它能做什么？

在 [Boss 直聘](https://www.zhipin.com) 职位列表页，ClawBoss 帮你自动完成这些重复操作：

<table>
<tr>
<td width="60%">

- **自动遍历**职位卡片，逐一点击查看详情
- **一键沟通**，自动点击"立即沟通"发送招呼语
- **智能跳过**已沟通过的职位，不重复打扰
- **无限滚动**，当前页投完自动加载下一页继续
- **限流保护**，触发平台限制时自动暂停并提醒
- **断点续投**，暂停后可从当前位置继续

</td>
<td align="center">
<img src="frontend/images/mascot-claw.png" alt="ClawBoss 抓取职位" width="220"/>
</td>
</tr>
</table>

## 工作原理

```
浏览器书签栏点击 → 加载投递脚本 → 自动遍历职位 → 批量发起沟通
```

ClawBoss 采用 **Bookmarklet（浏览器书签）** 方式运行，不需要安装任何插件或扩展：

1. 将超薄书签拖到浏览器书签栏（仅需一次）
2. 打开 Boss 直聘职位列表页，点击书签
3. 输入激活码，ClawBoss 开始自动投递
4. 实时面板显示投递进度（已投 / 跳过 / 总数）

> **为什么用 Bookmarklet？** Boss 直聘会检测浏览器扩展和自动化工具，但 Bookmarklet 作为原生浏览器功能，不会触发任何反自动化检测。

## 系统架构

```
┌─────────────────────────────────────────────────┐
│  浏览器 (Boss 直聘页面)                           │
│  ┌───────────────┐    ┌──────────────────────┐  │
│  │  Bookmarklet  │───▶│  投递脚本 (v13)       │  │
│  │  (~120 字符)  │    │  自动遍历 + 沟通      │  │
│  └───────────────┘    └──────────────────────┘  │
└────────────────────────────┬────────────────────┘
                             │ API
┌────────────────────────────▼────────────────────┐
│  后端服务 (Node.js + Express)                    │
│  ┌──────────┐ ┌──────────┐ ┌─────────────────┐ │
│  │ 卡密验证  │ │ 设备绑定  │ │ 投递数据统计     │ │
│  └──────────┘ └──────────┘ └─────────────────┘ │
└────────────────────────────┬────────────────────┘
                             │
┌────────────────────────────▼────────────────────┐
│  MySQL 数据库                                    │
│  卡密 · 设备 · 投递记录 · 每日统计               │
└─────────────────────────────────────────────────┘
```

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端客户页 | 原生 HTML/CSS/JS，暗色终端风格 UI |
| 投递脚本 | 纯 JavaScript Bookmarklet，模拟真实用户操作 |
| 后端服务 | Node.js + Express (ESM) |
| 数据库 | MySQL (mysql2) |
| 部署 | Zeabur 自动部署 (GitHub Push) |
| 安全 | IP 限流 + 设备指纹绑定 + 卡密授权 |

## 快速开始

### 环境要求

- Node.js 18+
- MySQL 8.0+

### 本地开发

```bash
# 克隆项目
git clone https://github.com/JeremyDong22/boss-auto-apply.git
cd boss-auto-apply

# 安装依赖
cd backend && npm install

# 配置环境变量
cp .env.example .env
# 编辑 .env 填入 MySQL 连接信息和管理员密码

# 初始化数据库
node init-db.js

# 启动本地服务器
node license_server.js
```

服务器启动后访问 `http://localhost:3456` 即可使用。

### 卡密管理

```bash
# 生成卡密（默认 30 天有效期，1 台设备）
node manage_keys.js generate

# 自定义参数
node manage_keys.js generate --days 7 --devices 3 --count 10

# 查看所有卡密
node manage_keys.js list
```

## 核心特性

<table>
<tr>
<td align="center" width="33%">
<img src="frontend/images/mascot-typing.png" alt="智能投递" width="140"/><br/>
<b>智能投递</b><br/>
<sub>模拟真实点击操作<br/>自动处理各种弹窗</sub>
</td>
<td align="center" width="33%">
<img src="frontend/images/mascot-chart.png" alt="数据统计" width="140"/><br/>
<b>数据统计</b><br/>
<sub>实时投递面板<br/>管理后台数据看板</sub>
</td>
<td align="center" width="33%">
<img src="frontend/images/mascot-handshake.png" alt="安全可靠" width="140"/><br/>
<b>安全可靠</b><br/>
<sub>不触发反自动化检测<br/>卡密 + 设备指纹双重验证</sub>
</td>
</tr>
</table>

## 项目结构

```
backend/
├── bookmarklet_auto_apply.js   # 核心投递脚本 (v13)
├── server.js                   # 生产服务器 (Zeabur)
├── license_server.js           # 本地开发服务器
├── schema-mysql.sql            # 数据库表结构
├── init-db.js                  # 数据库初始化脚本
├── manage_keys.js              # 卡密管理 CLI
└── package.json

frontend/
├── index.html                  # 客户端页面
├── admin.html                  # 管理后台
└── images/                     # ClawBoss 吉祥物素材
```

## 免责声明

本工具仅供学习和个人求职效率提升使用。使用本工具时请遵守 Boss 直聘的用户协议和相关法律法规。因使用本工具产生的任何后果由用户自行承担。

## 许可证

[MIT License](LICENSE)

---

<div align="center">
<sub>Built with by ClawBoss Team</sub>
</div>
