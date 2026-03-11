// license_server.js - v3
// 卡密验证服务器（本地开发版）
// 新增：IP 防暴力破解（5次→锁15分钟，10次→锁1小时，20次→锁24小时）
// 用法: node backend/license_server.js
// 数据存储: backend/keys.json（自动创建）

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = 3456;
const KEYS_FILE = path.join(__dirname, 'keys.json');
const V10_PATH = path.join(__dirname, '..', 'bookmarklet_auto_apply_v10.js');
const FRONTEND_DIR = path.join(__dirname, '..', 'frontend');

// ---- 防暴力破解：基于 IP 的失败次数追踪 ----
// 内存存储（重启清零，生产环境用 KV/D1 持久化）
const failedAttempts = {};  // { ip: { count, blocked_until, last_attempt } }

// 锁定阶梯：失败次数 → 锁定时长（分钟）
const LOCK_TIERS = [
    { threshold: 5, lock_minutes: 15 },
    { threshold: 10, lock_minutes: 60 },
    { threshold: 20, lock_minutes: 1440 }   // 24小时
];
const MAX_ATTEMPTS_BEFORE_FIRST_LOCK = 5;

function getClientIP(req) {
    return req.headers['x-forwarded-for']?.split(',')[0]?.trim()
        || req.headers['x-real-ip']
        || req.socket.remoteAddress
        || 'unknown';
}

// 检查 IP 是否被锁定，返回 { blocked, msg, remain_attempts }
function checkRateLimit(ip) {
    const record = failedAttempts[ip];
    if (!record) {
        return { blocked: false, remain_attempts: MAX_ATTEMPTS_BEFORE_FIRST_LOCK };
    }

    // 检查是否在锁定期内
    if (record.blocked_until && new Date() < new Date(record.blocked_until)) {
        const remainMin = Math.ceil((new Date(record.blocked_until) - new Date()) / 60000);
        return {
            blocked: true,
            msg: `操作过于频繁，请 ${remainMin} 分钟后再试`,
            remain_attempts: 0
        };
    }

    // 锁定已过期，但不清零 count（累计计算）
    const remain = MAX_ATTEMPTS_BEFORE_FIRST_LOCK - record.count;
    return {
        blocked: false,
        remain_attempts: Math.max(0, remain)
    };
}

// 记录一次失败，返回锁定信息
function recordFailure(ip) {
    if (!failedAttempts[ip]) {
        failedAttempts[ip] = { count: 0, blocked_until: null, last_attempt: null };
    }
    const record = failedAttempts[ip];
    record.count++;
    record.last_attempt = new Date().toISOString();

    // 检查是否触发锁定
    for (let i = LOCK_TIERS.length - 1; i >= 0; i--) {
        if (record.count >= LOCK_TIERS[i].threshold) {
            record.blocked_until = new Date(Date.now() + LOCK_TIERS[i].lock_minutes * 60000).toISOString();
            console.log(`  → IP ${ip} 已锁定 ${LOCK_TIERS[i].lock_minutes} 分钟（累计失败 ${record.count} 次）`);
            return {
                locked: true,
                lock_minutes: LOCK_TIERS[i].lock_minutes,
                total_failures: record.count
            };
        }
    }

    const remain = MAX_ATTEMPTS_BEFORE_FIRST_LOCK - record.count;
    return { locked: false, remain_attempts: Math.max(0, remain), total_failures: record.count };
}

// 验证成功后清除该 IP 的失败记录
function clearFailures(ip) {
    delete failedAttempts[ip];
}

// 读取 v10 可读版源码
const v10Content = fs.readFileSync(V10_PATH, 'utf8');
const readableStart = v10Content.indexOf('(function () {');
const SCRIPT_CODE = v10Content.slice(readableStart);

// ---- 数据操作 ----

function loadKeys() {
    if (!fs.existsSync(KEYS_FILE)) {
        fs.writeFileSync(KEYS_FILE, '{}');
        return {};
    }
    return JSON.parse(fs.readFileSync(KEYS_FILE, 'utf8'));
}

function saveKeys(keys) {
    fs.writeFileSync(KEYS_FILE, JSON.stringify(keys, null, 2));
}

// 生成 BOSS-XXXX-XXXX 格式卡密
function generateKeyCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let p1 = '', p2 = '';
    for (let i = 0; i < 4; i++) {
        p1 += chars[crypto.randomInt(chars.length)];
        p2 += chars[crypto.randomInt(chars.length)];
    }
    return `BOSS-${p1}-${p2}`;
}

// 计算单个卡密的状态摘要
function getKeyStatus(key) {
    if (key.disabled) return { status: 'disabled', label: '已禁用' };
    if (!key.activated_at) return { status: 'inactive', label: '未激活' };

    const expiresAt = new Date(new Date(key.activated_at).getTime() + key.days * 24 * 60 * 60 * 1000);
    const now = new Date();
    if (now > expiresAt) return { status: 'expired', label: '已过期' };

    const remain = Math.ceil((expiresAt - now) / (24 * 60 * 60 * 1000));
    return { status: 'active', label: `剩余${remain}天`, remain_days: remain, expires_at: expiresAt.toISOString() };
}

// 检查卡密有效性（客户端调用）
function validateKey(keyCode, fingerprint) {
    const keys = loadKeys();
    const key = keys[keyCode];

    if (!key) return { valid: false, msg: '卡密无效' };
    if (key.disabled) return { valid: false, msg: '卡密已被禁用' };

    if (!key.activated_at) {
        key.activated_at = new Date().toISOString();
        console.log(`  → 首次激活卡密: ${keyCode}`);
    }

    const activatedAt = new Date(key.activated_at);
    const expiresAt = new Date(activatedAt.getTime() + key.days * 24 * 60 * 60 * 1000);
    const now = new Date();
    if (now > expiresAt) {
        return { valid: false, msg: `卡密已过期（${expiresAt.toLocaleDateString('zh-CN')} 到期）` };
    }

    if (fingerprint) {
        const existing = key.devices.find(d => d.fingerprint === fingerprint);
        if (existing) {
            existing.last_seen = new Date().toISOString();
        } else {
            if (key.devices.length >= key.max_devices) {
                return { valid: false, msg: `设备数已达上限（最多 ${key.max_devices} 台），请联系客服` };
            }
            key.devices.push({
                fingerprint,
                first_seen: new Date().toISOString(),
                last_seen: new Date().toISOString()
            });
            console.log(`  → 新设备绑定 (${key.devices.length}/${key.max_devices}): ${fingerprint.slice(0, 20)}...`);
        }
    }

    saveKeys(keys);
    const remainDays = Math.ceil((expiresAt - now) / (24 * 60 * 60 * 1000));
    return {
        valid: true, msg: 'OK',
        info: { remain_days: remainDays, expires_at: expiresAt.toISOString(), devices_used: key.devices.length, max_devices: key.max_devices }
    };
}

// 读取 POST body
function readBody(req) {
    return new Promise((resolve) => {
        let data = '';
        req.on('data', chunk => data += chunk);
        req.on('end', () => {
            try { resolve(JSON.parse(data)); }
            catch { resolve({}); }
        });
    });
}

// ---- HTTP 服务器 ----

const server = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    const url = new URL(req.url, `http://localhost:${PORT}`);

    // ---- 客户端 API（带防暴力破解） ----

    const ip = getClientIP(req);

    if (url.pathname === '/api/verify') {
        const keyCode = url.searchParams.get('key');
        const fp = url.searchParams.get('fp');
        console.log(`[${new Date().toLocaleTimeString()}] /api/verify key=${keyCode} ip=${ip}`);

        // 检查 IP 是否被锁定
        const rateCheck = checkRateLimit(ip);
        if (rateCheck.blocked) {
            console.log(`  → IP 被锁定: ${rateCheck.msg}`);
            res.writeHead(429); res.end(JSON.stringify({ ok: false, msg: rateCheck.msg, blocked: true })); return;
        }

        if (!keyCode) { res.writeHead(400); res.end(JSON.stringify({ ok: false, msg: '缺少卡密' })); return; }

        const result = validateKey(keyCode, fp);
        if (!result.valid) {
            const failure = recordFailure(ip);
            const msg = failure.locked
                ? `卡密无效，已锁定 ${failure.lock_minutes} 分钟`
                : result.msg + (failure.remain_attempts > 0 ? `（还剩 ${failure.remain_attempts} 次机会）` : '');
            console.log(`  → 拒绝: ${result.msg} (IP 累计失败 ${failure.total_failures} 次)`);
            res.writeHead(403); res.end(JSON.stringify({ ok: false, msg, remain_attempts: failure.remain_attempts || 0, blocked: !!failure.locked })); return;
        }

        clearFailures(ip);
        console.log(`  → 通过: 剩余${result.info.remain_days}天`);
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.writeHead(200); res.end(JSON.stringify({ ok: true, code: SCRIPT_CODE, info: result.info })); return;
    }

    if (url.pathname === '/api/check') {
        const keyCode = url.searchParams.get('key');

        // 检查 IP 是否被锁定
        const rateCheck = checkRateLimit(ip);
        if (rateCheck.blocked) {
            res.writeHead(429); res.end(JSON.stringify({ ok: false, msg: rateCheck.msg, blocked: true })); return;
        }

        if (!keyCode) { res.writeHead(400); res.end(JSON.stringify({ ok: false, msg: '缺少卡密' })); return; }

        const result = validateKey(keyCode, null);
        if (!result.valid) {
            const failure = recordFailure(ip);
            const msg = failure.locked
                ? `卡密无效，已锁定 ${failure.lock_minutes} 分钟`
                : result.msg + (failure.remain_attempts > 0 ? `（还剩 ${failure.remain_attempts} 次机会）` : '');
            res.writeHead(403); res.end(JSON.stringify({ ok: false, msg, remain_attempts: failure.remain_attempts || 0, blocked: !!failure.locked })); return;
        }

        clearFailures(ip);

        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.writeHead(200); res.end(JSON.stringify({ ok: true, info: result.info })); return;
    }

    // ---- 管理员 API ----

    // 管理员登录（复用现有防暴力破解机制）
    if (url.pathname === '/api/admin/login' && req.method === 'POST') {
        const rateCheck = checkRateLimit(ip);
        if (rateCheck.blocked) {
            res.writeHead(429);
            res.end(JSON.stringify({ ok: false, msg: rateCheck.msg, blocked: true }));
            return;
        }

        let body = {};
        try {
            const chunks = [];
            for await (const chunk of req) chunks.push(chunk);
            body = JSON.parse(Buffer.concat(chunks).toString());
        } catch (e) {}

        const password = 'bossboss';  // 本地开发默认密码

        if (body.password !== password) {
            const failure = recordFailure(ip);
            const msg = failure.locked
                ? `错误次数过多，已锁定 ${failure.lock_minutes} 分钟`
                : `密码错误（还剩 ${failure.remain_attempts} 次机会）`;
            res.writeHead(403);
            res.end(JSON.stringify({ ok: false, msg, remain_attempts: failure.remain_attempts, blocked: failure.locked }));
            return;
        }

        clearFailures(ip);
        res.writeHead(200);
        res.end(JSON.stringify({ ok: true }));
        return;
    }

    // 列出所有卡密（含完整信息）
    if (url.pathname === '/api/admin/keys' && req.method === 'GET') {
        const keys = loadKeys();
        const list = Object.entries(keys).map(([code, key]) => {
            const st = getKeyStatus(key);
            return {
                code,
                days: key.days,
                max_devices: key.max_devices,
                created_at: key.created_at,
                activated_at: key.activated_at,
                disabled: key.disabled,
                status: st.status,
                status_label: st.label,
                remain_days: st.remain_days || null,
                devices: key.devices
            };
        });

        // 统计
        const stats = {
            total: list.length,
            active: list.filter(k => k.status === 'active').length,
            inactive: list.filter(k => k.status === 'inactive').length,
            expired: list.filter(k => k.status === 'expired').length,
            disabled: list.filter(k => k.status === 'disabled').length
        };

        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.writeHead(200); res.end(JSON.stringify({ ok: true, stats, keys: list })); return;
    }

    // 生成新卡密
    if (url.pathname === '/api/admin/generate' && req.method === 'POST') {
        const body = await readBody(req);
        const days = parseInt(body.days) || 30;
        const maxDevices = parseInt(body.max_devices) || 2;
        const count = Math.min(parseInt(body.count) || 1, 100);

        const keys = loadKeys();
        const generated = [];
        for (let i = 0; i < count; i++) {
            let code;
            do { code = generateKeyCode(); } while (keys[code]);
            keys[code] = {
                days, max_devices: maxDevices,
                created_at: new Date().toISOString(),
                activated_at: null, disabled: false, devices: []
            };
            generated.push(code);
        }
        saveKeys(keys);

        console.log(`[${new Date().toLocaleTimeString()}] 生成 ${count} 个卡密: ${generated.join(', ')}`);
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.writeHead(200); res.end(JSON.stringify({ ok: true, generated })); return;
    }

    // 禁用卡密
    if (url.pathname === '/api/admin/disable' && req.method === 'POST') {
        const body = await readBody(req);
        const keys = loadKeys();
        if (!keys[body.key]) { res.writeHead(404); res.end(JSON.stringify({ ok: false, msg: '卡密不存在' })); return; }
        keys[body.key].disabled = true;
        saveKeys(keys);
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.writeHead(200); res.end(JSON.stringify({ ok: true })); return;
    }

    // 启用卡密
    if (url.pathname === '/api/admin/enable' && req.method === 'POST') {
        const body = await readBody(req);
        const keys = loadKeys();
        if (!keys[body.key]) { res.writeHead(404); res.end(JSON.stringify({ ok: false, msg: '卡密不存在' })); return; }
        keys[body.key].disabled = false;
        saveKeys(keys);
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.writeHead(200); res.end(JSON.stringify({ ok: true })); return;
    }

    // 删除卡密
    if (url.pathname === '/api/admin/delete' && req.method === 'POST') {
        const body = await readBody(req);
        const keys = loadKeys();
        if (!keys[body.key]) { res.writeHead(404); res.end(JSON.stringify({ ok: false, msg: '卡密不存在' })); return; }
        delete keys[body.key];
        saveKeys(keys);
        console.log(`[${new Date().toLocaleTimeString()}] 删除卡密: ${body.key}`);
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.writeHead(200); res.end(JSON.stringify({ ok: true })); return;
    }

    // 卡密使用统计（本地版：无 DB，返回空数据）
    if (url.pathname === '/api/admin/stats' && req.method === 'GET') {
        const keyCode = url.searchParams.get('key');
        if (!keyCode) { res.writeHead(400); res.end(JSON.stringify({ ok: false, msg: '缺少卡密' })); return; }
        res.writeHead(200);
        res.end(JSON.stringify({ ok: true, total_applied: 0, daily: [], logs: [] }));
        return;
    }

    // 查看被锁定的 IP
    if (url.pathname === '/api/admin/blocked' && req.method === 'GET') {
        const now = new Date();
        const blocked = Object.entries(failedAttempts)
            .filter(([, r]) => r.blocked_until && new Date(r.blocked_until) > now)
            .map(([ip, r]) => ({
                ip,
                failures: r.count,
                blocked_until: r.blocked_until,
                remain_min: Math.ceil((new Date(r.blocked_until) - now) / 60000)
            }));
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.writeHead(200); res.end(JSON.stringify({ ok: true, blocked })); return;
    }

    // 解锁 IP
    if (url.pathname === '/api/admin/unblock' && req.method === 'POST') {
        const body = await readBody(req);
        if (failedAttempts[body.ip]) {
            delete failedAttempts[body.ip];
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.writeHead(200); res.end(JSON.stringify({ ok: true })); return;
        }
        res.writeHead(404); res.end(JSON.stringify({ ok: false, msg: 'IP 不存在' })); return;
    }

    // ---- 静态文件服务（前端页面） ----

    if (url.pathname === '/' || url.pathname === '/index.html') {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.writeHead(200); res.end(fs.readFileSync(path.join(FRONTEND_DIR, 'index.html'))); return;
    }
    if (url.pathname === '/admin' || url.pathname === '/admin.html') {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.writeHead(200); res.end(fs.readFileSync(path.join(FRONTEND_DIR, 'admin.html'))); return;
    }

    res.writeHead(404); res.end(JSON.stringify({ error: 'Not Found' }));
});

server.listen(PORT, () => {
    console.log('====================================');
    console.log(' 卡密验证服务器 v3');
    console.log(` 地址: http://localhost:${PORT}`);
    console.log(` 客户页: http://localhost:${PORT}/`);
    console.log(` 管理后台: http://localhost:${PORT}/admin`);
    console.log(` 数据: ${KEYS_FILE}`);
    console.log('====================================');
    console.log('等待请求...');
});
