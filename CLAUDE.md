# Boss 自动投简历项目

## 项目概述
Boss 直聘（zhipin.com）自动投递简历工具，通过 Bookmarklet 注入方式在职位列表页自动遍历职位、点击"立即沟通"、关闭弹窗，实现批量投递。

## 踩坑历程

### 坑 1：Chrome DevTools MCP（CDP 方案）
- 配置了 chrome-devtools MCP，用 CDP 控制浏览器
- Boss 直聘检测到 CDP 连接后，自动调用 `window.close()` 关闭页面
- 尝试用 `initScript` 注入覆盖 `navigator.webdriver` 和 `window.close()`
- 部分生效但不稳定，页面仍会被关闭
- **结论：CDP 方案不可行**

### 坑 2：MCP 连接已有浏览器
- 用户手动启动 Chrome（`--remote-debugging-port=9222`），MCP 用 `--browser-url` 连接
- 理论上不会新开 Chrome，复用已有的
- 但 MCP 连接仍触发 CDP 检测，Boss 继续关页面
- **结论：只要有 CDP 连接，Boss 就能检测到**

### 坑 3：Tampermonkey 油猴脚本
- 写了 `boss_auto_apply.user.js`，通过油猴扩展注入
- 用户安装时遇到嵌套问题：把脚本粘贴到了默认模板里面，导致两层 IIFE
- 修复嵌套后，脚本仍然不执行（Google 测试页也不行）
- **原因：Chrome Manifest V3 限制了 Tampermonkey 的脚本注入能力**
- **结论：油猴方案在新版 Chrome 上不可靠**

### 坑 4：点击"继续沟通"导致页面跳转
- Bookmarklet v1 流程：点击卡片 → 立即沟通 → 继续沟通
- 点击"继续沟通"后页面跳转到聊天页，注入的脚本全部丢失
- v2 尝试用 `blockNav()` 阻止跳转（移除 href、preventDefault）→ 仍然跳转
- **关键发现：点击"立即沟通"时消息已经发送了！不需要点"继续沟通"**
- **解决：点"留在此页"(.cancel-btn) 关闭弹窗即可**

### 坑 5：无法打开 DevTools 调试
- Boss 拦截 F12 / Cmd+Option+I
- 打开 DevTools 后页面不断跳转（anti-debugger 检测）
- **解决：写了两个辅助 Bookmarklet 抓取 HTML 到剪贴板**
  - `bookmarklet_grab_page_html.js` — 抓取职位列表页 HTML
  - `bookmarklet_grab_dialog_html.js` — 抓取弹窗 HTML
- 通过分析抓取的 HTML 确认了精确的 DOM 选择器

### 坑 6：弹窗关闭不了
- v3~v5 用了各种策略关弹窗：CSS 选择器猜测、`display:none`、Escape 键
- 都不精确，因为不知道弹窗的确切结构
- 用弹窗抓取 Bookmarklet 拿到了真实 HTML：`.greet-boss-dialog` 包含 `.cancel-btn`（留在此页）和 `.sure-btn`（继续沟通）
- **v6 修复：精确点击 `.greet-boss-dialog .cancel-btn`**

### 坑 7：关闭弹窗后没有正确点击下一个卡片
- v6 在开始时一次性查询所有 `.job-card-wrap`，后续用索引遍历
- Boss 是 Vue SPA，交互后可能重新渲染 DOM，导致之前缓存的节点失效
- **v7 修复：每次循环开头重新 `document.querySelectorAll('.job-card-wrap')`**

### 坑 8：滚动加载更多卡片失败（v9）
- v9 初版用 `.job-list-container.scrollTop += 500` 滚动加载更多
- 测试发现 `.job-list-container` 的 `scrollHeight === clientHeight`，可滚动距离为 0
- **`.job-list-container` 不是滚动容器**，它只是撑满内容的 div，没有 overflow
- 向上遍历 DOM 发现所有祖先都是 `overflow: visible`，真正的滚动在 `window` 上
- `window.scrollBy(0, 500)` 可以滚动，但每次 500px 不够触发加载
- **关键发现：Boss 的懒加载触发条件是滚到页面底部附近**
- `window.scrollTo(0, document.body.scrollHeight)` 一步到底，每次稳定加载 15 张新卡片
- **v9 修复：`tryScrollForMore()` 用 `window.scrollTo` 到底部，`scrollToCard()` 也用 `window.scrollTo`**

## 技术方案

### 最终方案：Bookmarklet（书签栏注入）
- `javascript:` 协议书签，点击后在当前页面执行 JS
- 不经过 CDP、不经过扩展，Boss 检测不到
- 当前版本：**v9**

## Boss 直聘反自动化机制
- 检测 CDP 连接 → 调用 `window.close()`
- 检测 `navigator.webdriver` 属性
- 拦截 F12 / Cmd+Option+I
- 打开 DevTools 后页面不断跳转（anti-debugger）

## 页面 DOM 结构（已确认）

### 职位列表页 `https://www.zhipin.com/web/geek/jobs?ka=header-jobs`
```
ul.rec-job-list
  div.card-area(.is-seen)          ← 外层包裹，可见卡片有 .is-seen
    div.job-card-wrap(.active)     ← 点击目标，选中的有 .active
      li.job-card-box
        div.job-info
          div.job-title
            a.job-name             ← 职位名称
            span.job-salary        ← 薪资
          ul.tag-list              ← 标签（经验/学历/技能）
        div.job-card-footer
          a.boss-info
            span.boss-name         ← 公司名
          span.company-location    ← 地点
```
- 卡片容器：`ul.rec-job-list`，父级 `.job-list-container`
- "立即沟通" 按钮：右侧详情面板中的 `a` 标签

### 弹窗结构（点击"立即沟通"后）
- 弹窗容器：`.greet-boss-dialog`
- 遮罩层：`.greet-boss-layer`
- 关闭按钮：`.greet-boss-header .close > i.icon-close`
- **"留在此页"**：`.cancel-btn` — 点这个关闭弹窗，不跳转
- "继续沟通"：`.sure-btn` — 会跳转到聊天页，**不要点**
- 弹窗标题："已向BOSS发送消息"

### 限流弹窗（每日沟通上限 150 人）
- 弹窗容器：`.chat-block-dialog`
- 遮罩层：`.chat-block-layer`
- 标题：`h3` "无法进行沟通"
- 正文：`p` "您今天已与150位BOSS沟通，休息一下，明天再来吧～"
- 确定按钮：`.chat-block-footer .sure-btn` — 点击关闭弹窗
- **处理策略：检测到后点"确定"关闭，立即停止投递**

## 投递流程
1. 点击左侧职位卡片（`.job-card-wrap`） → 右侧展开详情
2. 点击"立即沟通" → **此时消息已发送**
3. 弹窗出现 → 点击"留在此页"（`.cancel-btn`）关闭弹窗
4. **重新查询卡片列表**（Vue 可能重新渲染 DOM）
5. 滚动到下一个卡片，点击，重复

## 滚动机制（已确认）
- **滚动容器：`window`**（不是 `.job-list-container`，后者 scrollHeight === clientHeight）
- `.job-list-container` 及其所有 DOM 祖先的 overflowY 均为 visible，不可滚动
- **加载触发：`window.scrollTo(0, document.body.scrollHeight)` 滚到页面底部**
- 每次触发加载 15 张新卡片，pageHeight 增加约 2250px
- 小步滚动（500px）不触发加载，必须滚到底部附近才行

## 文件说明
- `bookmarklet_auto_apply_v10.js` — 最新版自动投递 Bookmarklet（v10，限流全程检测，含压缩版和可读版）
- `bookmarklet_auto_apply_v9.js` — v9 版本（无限滚动 + 三计数面板）
- `bookmarklet_auto_apply_v8.js` — v8 版本（realClick + 卡片遍历，固定 MAX=5）
- `bookmarklet_auto_apply_v7.js` — v7 版本（每次重新查询卡片列表）
- `bookmarklet_grab_page_html.js` — 抓取页面 HTML 到剪贴板的工具
- `bookmarklet_grab_dialog_html.js` — 抓取弹窗 HTML 到剪贴板的工具
- `test_scroll.js` — 滚动测试 Bookmarklet（调试用）
- `.mcp.json` — Chrome DevTools MCP 配置（CDP 方案已弃用，保留参考）
- `website/` — 分发网站文件夹（详见下方）

## 分发网站（website/）

### 概述
密码保护的静态网页，用于向客户分发 Bookmarklet 脚本和使用说明。

### 文件
- `website/build.js` — 构建脚本，读取 v9 bookmarklet，AES-256-GCM 加密后嵌入 index.html
- `website/index.html` — 生成的部署页面（由 build.js 生成）

### 部署流程
1. 创建 GitHub 仓库，将 `website/` 目录内容推送上去
2. 在 Cloudflare Pages 连接该 GitHub 仓库
3. Cloudflare 构建设置：无需构建命令，输出目录设为 `/`（根目录）
4. 部署完成后得到 Cloudflare Pages URL，发给客户即可

### 密码机制
- 默认密码：`123456`
- 加密方式：AES-256-GCM（Web Crypto API 解密）
- 内容（使用说明 + bookmarklet 代码）在 HTML 中以加密形式存储
- 错误密码无法解密，密文在源码中不可读
- 修改密码：`node build.js 新密码`

### 浏览器兼容性
- Chrome、Edge、360浏览器、QQ浏览器、搜狗浏览器、Firefox 均支持
- 均为 Chromium 内核，Bookmarklet 功能通用
- Safari 未测试，可能不兼容

### 更新 bookmarklet 后重新生成
如果修改了 `bookmarklet_auto_apply_v9.js`，需要重新生成 index.html：
```bash
cd website && node build.js
# 或指定新密码
cd website && node build.js mypassword
```

## Bookmarklet 版本历史
| 版本 | 主要变化 |
|------|---------|
| v1 | 初始版本，点击"继续沟通"（导致页面跳转） |
| v2 | 加 blockNav() 阻止跳转（仍然跳转） |
| v3 | 不再点"继续沟通"，加 scrollToCard，隐藏弹窗 |
| v4 | 精确用 .job-card-wrap，.job-list-container 滚动，显示职位名 |
| v5 | 暴力多策略关弹窗（14 种 CSS 选择器 + Escape 键） |
| v6 | 精确用 .greet-boss-dialog .cancel-btn 关弹窗 |
| v7 | 每次循环重新查询卡片列表，修复 Vue 重渲染后 DOM 失效问题 |
| v8 | realClick 模拟真实鼠标事件，多点击目标尝试 |
| v9 | 无限滚动模式（window.scrollTo 到底触发加载）+ 检测"继续沟通"跳过已沟通 + 三计数面板 |
| **v10** | **限流弹窗(.chat-block-dialog)全程检测：主循环每步都检查，触发后面板变红、自动点确定、立即停止** |
