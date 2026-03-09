// build.js - v2
// 读取 bookmarklet 源码，AES-GCM 加密后嵌入 index.html
// 修复：bookmarklet 代码与 HTML 分离，用 textContent 注入避免 HTML 解析
// 用法: node build.js [密码]  (默认密码: 123456)

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PASSWORD = process.argv[2] || '123456';

// ---- 读取 bookmarklet 一行码 ----
const v9Path = path.join(__dirname, '..', 'bookmarklet_auto_apply_v9.js');
const v9Content = fs.readFileSync(v9Path, 'utf8');
const bookmarkletLine = v9Content.split('\n').find(l => l.startsWith('// javascript:'));
if (!bookmarkletLine) {
    console.error('未找到 bookmarklet 一行码（以 "// javascript:" 开头的行）');
    process.exit(1);
}
const bookmarkletCode = bookmarkletLine.replace(/^\/\/\s*/, '');

// ---- AES-256-GCM 加密 ----
function encrypt(plaintext, password) {
    const key = crypto.createHash('sha256').update(password).digest();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    // 格式: iv(12) + ciphertext + tag(16)  —— Web Crypto 的 AES-GCM 期望 ciphertext+tag 连在一起
    return Buffer.concat([iv, encrypted, tag]).toString('base64');
}

// ---- 被加密的 HTML 内容（解锁后注入页面） ----
// 核心使用步骤在最前面，其他补充信息在后面
const protectedHTML = `
<div class="section">
  <h2>使用步骤</h2>
  <div class="steps">
    <div class="step">
      <span class="step-num">1</span>
      <div>
        <strong>确认浏览器</strong>
        <p>请使用以下支持的浏览器访问 Boss直聘。</p>
        <details class="browser-details">
          <summary>查看支持的浏览器列表</summary>
          <table class="compat-table">
            <tr><th>浏览器</th><th>支持</th><th>备注</th></tr>
            <tr><td>Chrome</td><td class="yes">支持</td><td>推荐使用</td></tr>
            <tr><td>Edge</td><td class="yes">支持</td><td></td></tr>
            <tr><td>360浏览器</td><td class="yes">支持</td><td>极速模式下使用</td></tr>
            <tr><td>QQ浏览器</td><td class="yes">支持</td><td></td></tr>
            <tr><td>搜狗浏览器</td><td class="yes">支持</td><td></td></tr>
            <tr><td>Firefox</td><td class="yes">支持</td><td></td></tr>
            <tr><td>Safari</td><td class="warn">未测试</td><td>可能不兼容</td></tr>
          </table>
        </details>
      </div>
    </div>
    <div class="step">
      <span class="step-num">2</span>
      <div>
        <strong>创建书签</strong>
        <p>将下方按钮直接<b>拖拽</b>到浏览器的书签栏即可完成创建。</p>
        <div class="drag-area">
          <a id="drag-link" class="drag-btn" href="#">Boss自动投递</a>
          <span class="drag-hint">← 拖我到书签栏</span>
        </div>
        <p class="note">如果看不到书签栏，按 Ctrl+Shift+B（Mac: Cmd+Shift+B）显示。</p>
      </div>
    </div>
    <div class="step">
      <span class="step-num">3</span>
      <div>
        <strong>打开Boss直聘</strong>
        <p>进入 <a href="https://www.zhipin.com/web/geek/jobs" target="_blank" rel="noopener">Boss直聘职位列表页</a>，筛选好你想要的条件（城市、职位、薪资等）。</p>
      </div>
    </div>
    <div class="step">
      <span class="step-num">4</span>
      <div>
        <strong>点击书签，开始投递</strong>
        <p><b>先筛选好目标岗位</b>，然后点击书签栏中的「Boss自动投递」书签。</p>
        <p>页面右上角会出现控制面板，点击「开始投递」，工具会自动遍历当前页面的所有职位并逐个投递。</p>
      </div>
    </div>
  </div>
</div>

<div class="section">
  <h2>注意事项</h2>
  <ul>
    <li>Boss直聘每日沟通上限为 <b>150 人</b>，达到上限后工具会自动停止。</li>
    <li>投递过程中可随时点击面板上的「停止」按钮暂停。</li>
    <li>已经沟通过的职位会自动跳过，不会重复投递。</li>
    <li>请先在Boss直聘上完善你的简历，确保简历内容完整。</li>
  </ul>
</div>

<div class="section">
  <h2>工具简介</h2>
  <p>Boss直聘自动投递工具，在职位列表页一键启动，自动遍历所有职位并发送沟通请求。</p>
  <ul>
    <li>无需安装扩展或插件，纯浏览器书签实现</li>
    <li>不会被Boss直聘反自动化检测</li>
    <li>自动滚动加载更多职位，持续投递</li>
    <li>已沟通过的职位自动跳过</li>
    <li>每日上限（150人）自动停止</li>
  </ul>
</div>

<div class="footer">作者：Jeremy Dong</div>
`;

// 加密 JSON 载荷：html 和 bookmarklet 分开，避免代码被当作 HTML 解析
const payload = JSON.stringify({ html: protectedHTML, bookmarklet: bookmarkletCode });
const encryptedData = encrypt(payload, PASSWORD);

// ---- 生成 index.html ----
const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<!-- index.html - v1 -->
<!-- Boss自动投递助手 - 密码保护的使用说明页 -->
<!-- 由 build.js 生成，内容使用 AES-256-GCM 加密 -->
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Boss自动投递助手</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC",
                 "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
    background: #f0f2f5;
    color: #333;
    min-height: 100vh;
  }

  /* 密码页 */
  .lock-screen {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    padding: 20px;
  }
  .lock-card {
    background: #fff;
    border-radius: 16px;
    padding: 48px 40px;
    max-width: 400px;
    width: 100%;
    box-shadow: 0 4px 24px rgba(0,0,0,0.08);
    text-align: center;
  }
  .lock-card h1 {
    font-size: 24px;
    color: #00bebd;
    margin-bottom: 8px;
  }
  .lock-card .subtitle {
    color: #999;
    font-size: 14px;
    margin-bottom: 32px;
  }
  .lock-card input {
    width: 100%;
    padding: 12px 16px;
    border: 1px solid #ddd;
    border-radius: 8px;
    font-size: 16px;
    outline: none;
    transition: border-color 0.2s;
  }
  .lock-card input:focus { border-color: #00bebd; }
  .lock-card .unlock-btn {
    width: 100%;
    padding: 12px;
    margin-top: 16px;
    background: linear-gradient(135deg, #00bebd, #00a8a7);
    color: #fff;
    border: none;
    border-radius: 8px;
    font-size: 16px;
    font-weight: 600;
    cursor: pointer;
    transition: opacity 0.2s;
  }
  .lock-card .unlock-btn:hover { opacity: 0.9; }
  .lock-card .error-msg {
    color: #e74c3c;
    font-size: 13px;
    margin-top: 12px;
    display: none;
  }

  /* 内容页 */
  .content-screen { display: none; }
  .content-screen.visible { display: block; }
  .header {
    background: linear-gradient(135deg, #00bebd, #00a8a7);
    color: #fff;
    padding: 32px 20px;
    text-align: center;
  }
  .header h1 { font-size: 22px; font-weight: 600; }
  .header p { font-size: 14px; opacity: 0.85; margin-top: 6px; }
  .main {
    max-width: 720px;
    margin: 0 auto;
    padding: 24px 20px 60px;
  }
  .section {
    background: #fff;
    border-radius: 12px;
    padding: 24px;
    margin-bottom: 16px;
    box-shadow: 0 1px 8px rgba(0,0,0,0.04);
  }
  .section h2 {
    font-size: 18px;
    color: #00bebd;
    margin-bottom: 14px;
    padding-bottom: 10px;
    border-bottom: 1px solid #f0f0f0;
  }
  .section p { line-height: 1.7; font-size: 14px; }
  .section ul { padding-left: 20px; line-height: 2; font-size: 14px; }
  .section a { color: #00bebd; text-decoration: none; }
  .section a:hover { text-decoration: underline; }
  .note { color: #999; font-size: 12px; margin-top: 10px; }

  /* 兼容性表格 */
  .compat-table { width: 100%; border-collapse: collapse; font-size: 14px; margin-bottom: 8px; }
  .compat-table th, .compat-table td {
    padding: 8px 12px;
    text-align: left;
    border-bottom: 1px solid #f0f0f0;
  }
  .compat-table th { color: #999; font-weight: 500; font-size: 12px; }
  .yes { color: #27ae60; font-weight: 600; }
  .warn { color: #f39c12; font-weight: 600; }

  /* 使用步骤 */
  .steps { display: flex; flex-direction: column; gap: 16px; }
  .step {
    display: flex;
    gap: 14px;
    align-items: flex-start;
  }
  .step-num {
    flex-shrink: 0;
    width: 28px;
    height: 28px;
    background: #00bebd;
    color: #fff;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    font-weight: 600;
    margin-top: 2px;
  }
  .step strong { font-size: 15px; }
  .step p { font-size: 13px; color: #666; margin-top: 4px; line-height: 1.6; }

  /* 拖拽区域 */
  .drag-area {
    display: flex;
    align-items: center;
    gap: 12px;
    margin: 12px 0 8px;
  }
  .drag-btn {
    display: inline-block;
    padding: 10px 20px;
    background: linear-gradient(135deg, #00bebd, #00a8a7);
    color: #fff !important;
    border-radius: 8px;
    font-size: 15px;
    font-weight: 600;
    text-decoration: none !important;
    cursor: grab;
    box-shadow: 0 2px 8px rgba(0,190,189,0.3);
    transition: box-shadow 0.2s;
    white-space: nowrap;
  }
  .drag-btn:hover { box-shadow: 0 4px 16px rgba(0,190,189,0.4); }
  .drag-btn:active { cursor: grabbing; }
  .drag-hint { color: #999; font-size: 13px; }

  /* 折叠浏览器列表 */
  .browser-details { margin-top: 8px; }
  .browser-details summary {
    color: #00bebd;
    cursor: pointer;
    font-size: 13px;
    font-weight: 500;
    outline: none;
    user-select: none;
  }
  .browser-details summary:hover { text-decoration: underline; }
  .browser-details .compat-table { margin-top: 8px; }

  /* 页脚 */
  .footer {
    text-align: center;
    color: #bbb;
    font-size: 12px;
    padding: 16px 0 8px;
  }

  /* toast 提示 */
  .toast {
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%) translateY(-100px);
    background: #333;
    color: #fff;
    padding: 10px 24px;
    border-radius: 8px;
    font-size: 14px;
    z-index: 9999;
    transition: transform 0.3s;
    pointer-events: none;
  }
  .toast.show { transform: translateX(-50%) translateY(0); }

  @media (max-width: 480px) {
    .lock-card { padding: 32px 24px; }
    .main { padding: 16px 12px 40px; }
    .section { padding: 18px 16px; }
  }
</style>
</head>
<body>

<!-- 密码输入界面 -->
<div class="lock-screen" id="lockScreen">
  <div class="lock-card">
    <h1>Boss自动投递助手</h1>
    <p class="subtitle">请输入访问密码</p>
    <input type="password" id="pwdInput" placeholder="请输入密码" autofocus>
    <button class="unlock-btn" id="unlockBtn">解锁</button>
    <div class="error-msg" id="errorMsg">密码错误，请重试</div>
  </div>
</div>

<!-- 解锁后的内容界面 -->
<div class="content-screen" id="contentScreen">
  <div class="header">
    <h1>Boss自动投递助手</h1>
    <p>一键批量投递 Boss直聘 职位</p>
  </div>
  <div class="main" id="mainContent">
    <!-- 解密后的 HTML 注入这里 -->
  </div>
</div>

<!-- toast -->
<div class="toast" id="toast"></div>

<script>
// 加密数据（由 build.js 生成）
var ENCRYPTED = "${encryptedData}";

// AES-256-GCM 解密（使用 Web Crypto API）
async function decryptContent(base64Data, password) {
  try {
    var raw = atob(base64Data);
    var data = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) data[i] = raw.charCodeAt(i);

    var iv = data.slice(0, 12);
    var encryptedWithTag = data.slice(12);

    var encoder = new TextEncoder();
    var keyHash = await crypto.subtle.digest('SHA-256', encoder.encode(password));
    var key = await crypto.subtle.importKey('raw', keyHash, { name: 'AES-GCM' }, false, ['decrypt']);
    var decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv, tagLength: 128 }, key, encryptedWithTag
    );
    return new TextDecoder().decode(decrypted);
  } catch (e) {
    return null;
  }
}

function showToast(msg) {
  var t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(function () { t.classList.remove('show'); }, 2000);
}

// 解锁逻辑
async function unlock() {
  var pwd = document.getElementById('pwdInput').value;
  if (!pwd) return;

  var raw = await decryptContent(ENCRYPTED, pwd);
  if (!raw) {
    document.getElementById('errorMsg').style.display = 'block';
    document.getElementById('pwdInput').value = '';
    document.getElementById('pwdInput').focus();
    return;
  }

  var data = JSON.parse(raw);
  document.getElementById('lockScreen').style.display = 'none';
  document.getElementById('contentScreen').classList.add('visible');
  document.getElementById('mainContent').innerHTML = data.html;
  // 设置拖拽按钮的 href 为 bookmarklet 代码
  document.getElementById('drag-link').href = data.bookmarklet;
}

document.getElementById('unlockBtn').addEventListener('click', unlock);
document.getElementById('pwdInput').addEventListener('keydown', function (e) {
  if (e.key === 'Enter') unlock();
});
<\/script>
</body>
</html>`;

const outPath = path.join(__dirname, 'index.html');
fs.writeFileSync(outPath, html, 'utf8');
console.log('生成完成: ' + outPath);
console.log('加密密码: ' + PASSWORD);
console.log('Bookmarklet 长度: ' + bookmarkletCode.length + ' 字符');
