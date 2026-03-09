// build.js - v1
// Cloudflare Pages 构建脚本
// 读取 bookmarklet v10 源码，注入到 worker-source.js，输出 _worker.js
// 在 Cloudflare Pages 构建时自动执行: Build command = node build.js

const fs = require('fs');
const path = require('path');

// 读取 v10 可读版源码（IIFE 部分）
const v10Path = path.join(__dirname, '..', 'bookmarklet_auto_apply_v10.js');
const v10Content = fs.readFileSync(v10Path, 'utf8');
const iife = v10Content.slice(v10Content.indexOf('(function () {'));

// 读取 worker 模板
const workerSource = fs.readFileSync(path.join(__dirname, 'worker-source.js'), 'utf8');

// 注入 bookmarklet 代码（转义反引号和 ${} 防止模板字符串问题）
const escaped = iife.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$');
const output = workerSource.replace('"%%BOOKMARKLET%%"', '`' + escaped + '`');

// 写入 _worker.js（Cloudflare Pages Advanced Mode 入口文件）
fs.writeFileSync(path.join(__dirname, '_worker.js'), output);
console.log('构建完成: _worker.js');
console.log('Bookmarklet 代码长度: ' + iife.length + ' 字符');
