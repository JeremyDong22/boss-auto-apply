// local_license_server.js - v1
// 本地卡密验证服务器 - 最小可行性测试
// 用法: node local_license_server.js
// 测试卡密: BOSS-TEST-2024

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3456;

// 唯一测试卡密
const VALID_KEY = 'BOSS-TEST-2024';

// 读取 v10 bookmarklet 可读版源码（跳过注释头和压缩行，取 IIFE 部分）
const v10Path = path.join(__dirname, 'bookmarklet_auto_apply_v10.js');
const v10Content = fs.readFileSync(v10Path, 'utf8');
// 提取可读版源码：从 "(function () {" 开始到文件末尾
const readableStart = v10Content.indexOf('(function () {');
const scriptCode = v10Content.slice(readableStart);

const server = http.createServer((req, res) => {
    // CORS：允许任何网站的 bookmarklet 调用
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // 预检请求
    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    const url = new URL(req.url, `http://localhost:${PORT}`);

    // 验证接口: GET /verify?key=BOSS-TEST-2024
    if (url.pathname === '/verify') {
        const key = url.searchParams.get('key');
        console.log(`[${new Date().toLocaleTimeString()}] 验证请求: key=${key}`);

        res.setHeader('Content-Type', 'application/json; charset=utf-8');

        if (!key) {
            res.writeHead(400);
            res.end(JSON.stringify({ ok: false, msg: '缺少卡密参数' }));
            return;
        }

        if (key !== VALID_KEY) {
            res.writeHead(403);
            res.end(JSON.stringify({ ok: false, msg: '卡密无效或已过期' }));
            console.log('  → 拒绝：卡密无效');
            return;
        }

        // 卡密有效，返回投递脚本代码
        res.writeHead(200);
        res.end(JSON.stringify({ ok: true, code: scriptCode }));
        console.log('  → 通过：返回投递脚本 (' + scriptCode.length + ' 字符)');
        return;
    }

    // 状态页
    if (url.pathname === '/') {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.writeHead(200);
        res.end(`<h2>卡密验证服务器运行中</h2>
<p>端口: ${PORT}</p>
<p>测试卡密: <code>${VALID_KEY}</code></p>
<p>验证接口: <code>GET /verify?key=卡密</code></p>
<hr>
<h3>测试加载器书签</h3>
<p>将下面这个链接拖到书签栏，然后在 zhipin.com 上点击测试：</p>
<p><a href="javascript:void(fetch('http://localhost:${PORT}/verify?key=${VALID_KEY}').then(function(r){return r.json()}).then(function(d){if(!d.ok){alert(d.msg);return}var s=document.createElement('script');s.textContent=d.code;document.head.appendChild(s)}).catch(function(e){alert('连接服务器失败: '+e.message)}))">Boss自动投递(测试)</a> ← 拖我到书签栏</p>`);
        return;
    }

    res.writeHead(404);
    res.end('Not Found');
});

server.listen(PORT, () => {
    console.log('=================================');
    console.log('卡密验证服务器已启动');
    console.log(`地址: http://localhost:${PORT}`);
    console.log(`测试卡密: ${VALID_KEY}`);
    console.log('=================================');
    console.log('');
    console.log('测试步骤：');
    console.log(`1. 浏览器打开 http://localhost:${PORT} 获取测试书签`);
    console.log('2. 把书签拖到书签栏');
    console.log('3. 打开 https://www.zhipin.com/web/geek/jobs');
    console.log('4. 点击书签栏中的「Boss自动投递(测试)」');
    console.log('5. 看这里的终端输出和 zhipin 页面上是否出现面板');
    console.log('');
    console.log('等待请求...');
});
