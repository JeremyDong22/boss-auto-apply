// server.js - v1
// Boss 自动投递 - Node.js + Express + MySQL 服务器
// 从 Cloudflare Worker + D1 迁移到 Zeabur 部署
// 保留所有原有功能：卡密验证、防暴力破解、设备绑定、使用统计

import express from 'express';
import mysql from 'mysql2/promise';
import cors from 'cors';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// ---- 中间件 ----
app.use(cors());
app.use(express.json());

// ---- 数据库连接池 ----
const pool = mysql.createPool({
    host: process.env.MYSQL_HOST || process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.MYSQL_PORT || process.env.DB_PORT || '3306'),
    user: process.env.MYSQL_USER || process.env.DB_USER || 'root',
    password: process.env.MYSQL_PASSWORD || process.env.DB_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || process.env.DB_NAME || 'zeabur',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    timezone: '+08:00'
});

// ---- 注入 Bookmarklet 代码 ----
let SCRIPT_CODE = '';
try {
    const v10Path = join(__dirname, 'bookmarklet_auto_apply_v10.js');
    const v10Content = readFileSync(v10Path, 'utf8');
    SCRIPT_CODE = v10Content.slice(v10Content.indexOf('(function () {'));
    console.log('Bookmarklet 代码加载成功，长度:', SCRIPT_CODE.length);
} catch (err) {
    console.error('加载 Bookmarklet 代码失败:', err.message);
}

// ---- 防暴力破解配置 ----
const MAX_ATTEMPTS_BEFORE_FIRST_LOCK = 5;
const LOCK_TIERS = [
    { threshold: 5, lock_minutes: 15 },
    { threshold: 10, lock_minutes: 60 },
    { threshold: 20, lock_minutes: 1440 }
];

// ---- 工具函数 ----

function getClientIP(req) {
    return req.headers['cf-connecting-ip']
        || req.headers['x-forwarded-for']?.split(',')[0]?.trim()
        || req.ip
        || 'unknown';
}

function generateKeyCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    let p1 = '', p2 = '';
    for (let i = 0; i < 4; i++) {
        p1 += chars[bytes[i] % chars.length];
        p2 += chars[bytes[i + 4] % chars.length];
    }
    return `BOSS-${p1}-${p2}`;
}

function now() {
    return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

function beijingDate() {
    const d = new Date(Date.now() + 8 * 3600000);
    return d.toISOString().slice(0, 10);
}

function beijingTime() {
    const d = new Date(Date.now() + 8 * 3600000);
    return d.toISOString().slice(0, 19).replace('T', ' ');
}

// ---- 防暴力破解（MySQL 存储） ----

async function checkRateLimit(ip) {
    const [rows] = await pool.execute('SELECT * FROM rate_limits WHERE ip = ?', [ip]);
    const row = rows[0];

    if (!row) return { blocked: false, remain_attempts: MAX_ATTEMPTS_BEFORE_FIRST_LOCK };

    if (row.blocked_until && new Date() < new Date(row.blocked_until)) {
        const remainMin = Math.ceil((new Date(row.blocked_until) - new Date()) / 60000);
        return { blocked: true, msg: `操作过于频繁，请 ${remainMin} 分钟后再试`, remain_attempts: 0 };
    }

    return { blocked: false, remain_attempts: Math.max(0, MAX_ATTEMPTS_BEFORE_FIRST_LOCK - row.failures) };
}

async function recordFailure(ip) {
    const [rows] = await pool.execute('SELECT * FROM rate_limits WHERE ip = ?', [ip]);
    const row = rows[0];
    const count = row ? row.failures + 1 : 1;

    let blockedUntil = null;
    let lockMinutes = 0;
    for (let i = LOCK_TIERS.length - 1; i >= 0; i--) {
        if (count >= LOCK_TIERS[i].threshold) {
            lockMinutes = LOCK_TIERS[i].lock_minutes;
            blockedUntil = new Date(Date.now() + lockMinutes * 60000).toISOString().slice(0, 19).replace('T', ' ');
            break;
        }
    }

    await pool.execute(
        `INSERT INTO rate_limits (ip, failures, blocked_until, last_attempt)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE failures = ?, blocked_until = ?, last_attempt = ?`,
        [ip, count, blockedUntil, now(), count, blockedUntil, now()]
    );

    const remain = Math.max(0, MAX_ATTEMPTS_BEFORE_FIRST_LOCK - count);
    return { locked: !!blockedUntil, lock_minutes: lockMinutes, remain_attempts: remain, total_failures: count };
}

async function clearFailures(ip) {
    await pool.execute('DELETE FROM rate_limits WHERE ip = ?', [ip]);
}

// ---- 卡密验证核心 ----

async function validateKey(keyCode, fingerprint) {
    const [rows] = await pool.execute('SELECT * FROM licenses WHERE code = ?', [keyCode]);
    const key = rows[0];

    if (!key) return { valid: false, reason: 'not_found', msg: '卡密无效' };
    if (key.disabled) return { valid: false, reason: 'disabled', msg: '卡密已被禁用，请联系管理员' };

    let activatedAt = key.activated_at;
    if (!activatedAt) {
        activatedAt = now();
        await pool.execute('UPDATE licenses SET activated_at = ? WHERE code = ?', [activatedAt, keyCode]);
    }

    const expiresAt = new Date(new Date(activatedAt).getTime() + key.days * 24 * 60 * 60 * 1000);
    if (new Date() > expiresAt) {
        return { valid: false, reason: 'expired', msg: '卡密已过期，请联系管理员续费' };
    }

    if (fingerprint) {
        const [existing] = await pool.execute(
            'SELECT * FROM devices WHERE license_code = ? AND fingerprint = ?',
            [keyCode, fingerprint]
        );

        if (existing.length > 0) {
            await pool.execute(
                'UPDATE devices SET last_seen = ? WHERE license_code = ? AND fingerprint = ?',
                [now(), keyCode, fingerprint]
            );
        } else {
            const [deviceCount] = await pool.execute(
                'SELECT COUNT(*) as cnt FROM devices WHERE license_code = ?',
                [keyCode]
            );

            if (deviceCount[0].cnt >= key.max_devices) {
                return { valid: false, msg: `设备数已达上限（最多 ${key.max_devices} 台），请联系客服` };
            }
            await pool.execute(
                'INSERT INTO devices (license_code, fingerprint, first_seen, last_seen) VALUES (?, ?, ?, ?)',
                [keyCode, fingerprint, now(), now()]
            );
        }
    }

    const remainDays = Math.ceil((expiresAt - new Date()) / (24 * 60 * 60 * 1000));
    return {
        valid: true, msg: 'OK',
        info: { remain_days: remainDays, expires_at: expiresAt.toISOString(), devices_used: 0, max_devices: key.max_devices }
    };
}

// ---- 超薄 loader：返回完整的登录面板 + 验证逻辑 JS ----
function buildLoaderJS(apiBase) {
    return `(function() {
    var k = localStorage.getItem('boss_auto_key');
    var api = '${apiBase}';

    function showPanel(errMsg) {
        var old = document.getElementById('aa-login'); if (old) old.remove();
        var d = document.createElement('div'); d.id = 'aa-login';
        d.innerHTML = '<div style="position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.45);z-index:99998"></div>'
            + '<div style="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:99999;background:#fff;padding:36px 32px;border-radius:16px;box-shadow:0 8px 40px rgba(0,0,0,0.25);font-family:system-ui;text-align:center;min-width:320px">'
                + '<div id="aa-login-close" style="position:absolute;top:10px;right:14px;cursor:pointer;font-size:28px;color:#999;line-height:1;font-weight:300">×</div>'
                + '<div style="font-size:22px;font-weight:bold;color:#00bebd;margin-bottom:6px">Boss 自动投递</div>'
                + '<div style="color:#999;font-size:13px;margin-bottom:20px">请输入卡密激活使用</div>'
                + '<input id="aa-login-input" type="text" placeholder="BOSS-XXXX-XXXX" maxlength="14" style="width:100%;padding:13px;border:2px solid #eee;border-radius:8px;font-size:17px;font-family:monospace;text-align:center;text-transform:uppercase;outline:none;box-sizing:border-box;transition:border-color 0.2s" autocomplete="off" spellcheck="false">'
                + '<div id="aa-login-err" style="color:#e74c3c;font-size:13px;margin-top:10px;display:none"></div>'
                + '<button id="aa-login-btn" style="width:100%;padding:13px;margin-top:14px;background:linear-gradient(135deg,#00bebd,#00a8a7);color:#fff;border:none;border-radius:8px;font-size:16px;font-weight:600;cursor:pointer;transition:opacity 0.2s">激活</button>'
                + '<div style="color:#bbb;font-size:11px;margin-top:12px">卡密将自动记住，下次无需重复输入</div>'
            + '</div>';
        document.body.appendChild(d);
        var inp = document.getElementById('aa-login-input'); inp.focus();

        if (errMsg) {
            var ee = document.getElementById('aa-login-err');
            ee.textContent = errMsg; ee.style.display = 'block';
        }

        inp.oninput = function() {
            var v = this.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
            if (v.length > 4 && v.slice(0, 4) === 'BOSS') v = v.slice(0, 4) + '-' + v.slice(4);
            if (v.length > 9 && v.charAt(9) !== '-') v = v.slice(0, 9) + '-' + v.slice(9);
            this.value = v.slice(0, 14);
        };

        document.getElementById('aa-login-btn').onclick = function() {
            var v = document.getElementById('aa-login-input').value.trim().toUpperCase();
            var err = document.getElementById('aa-login-err');
            if (!v) { err.textContent = '请输入卡密'; err.style.display = 'block'; return; }
            err.style.display = 'none';
            localStorage.setItem('boss_auto_key', v); ld(v);
        };

        document.getElementById('aa-login-input').onkeydown = function(e) { if (e.key === 'Enter') document.getElementById('aa-login-btn').click(); };
        d.firstChild.onclick = function() { d.remove(); };
        document.getElementById('aa-login-close').onclick = function() { d.remove(); };
    }

    function ld(key) {
        var fp = btoa(screen.width + '|' + screen.height + '|' + screen.colorDepth + '|' + navigator.language + '|' + new Date().getTimezoneOffset() + '|' + navigator.platform);
        window.__BOSS_KEY = key;
        window.__BOSS_API = api;
        var btn = document.getElementById('aa-login-btn');
        if (btn) { btn.textContent = '验证中...'; btn.disabled = true; }
        fetch(api + '/api/verify?key=' + key + '&fp=' + encodeURIComponent(fp))
            .then(function(r) { return r.json(); })
            .then(function(d) {
                if (!d.ok) {
                    localStorage.removeItem('boss_auto_key');
                    var ee = document.getElementById('aa-login-err');
                    if (ee) {
                        ee.textContent = d.msg; ee.style.display = 'block';
                        if (btn) { btn.textContent = '激活'; btn.disabled = false; }
                    } else {
                        showPanel(d.msg);
                    }
                    return;
                }
                window.__BOSS_INFO = d.info;
                var el = document.getElementById('aa-login'); if (el) el.remove();
                var s = document.createElement('script'); s.textContent = d.code; document.head.appendChild(s);
            })
            .catch(function(e) {
                var ee = document.getElementById('aa-login-err');
                if (ee) {
                    ee.textContent = '连接服务器失败'; ee.style.display = 'block';
                    if (btn) { btn.textContent = '激活'; btn.disabled = false; }
                } else {
                    showPanel('连接服务器失败');
                }
            });
    }

    if (k) { ld(k); return; }
    showPanel();
})();`;
}

// ---- 路由处理 ----

// 健康检查端点
app.get('/health', async (req, res) => {
    try {
        await pool.query('SELECT 1');
        res.json({
            status: 'ok',
            timestamp: new Date().toISOString(),
            database: 'connected'
        });
    } catch (err) {
        res.status(503).json({
            status: 'error',
            timestamp: new Date().toISOString(),
            database: 'disconnected',
            error: err.message
        });
    }
});

// 超薄 loader 端点
app.get('/api/loader', (req, res) => {
    const apiBase = `${req.protocol}://${req.get('host')}`;
    res.type('text/javascript').send(buildLoaderJS(apiBase));
});

// 卡密验证端点
app.get('/api/verify', async (req, res) => {
    try {
        const keyCode = req.query.key;
        const fp = req.query.fp;
        const ip = getClientIP(req);

        const rateCheck = await checkRateLimit(ip);
        if (rateCheck.blocked) return res.status(429).json({ ok: false, msg: rateCheck.msg, blocked: true });
        if (!keyCode) return res.status(400).json({ ok: false, msg: '缺少卡密' });

        const result = await validateKey(keyCode, fp);
        if (!result.valid) {
            if (result.reason === 'disabled' || result.reason === 'expired') {
                return res.status(403).json({ ok: false, msg: result.msg });
            }
            const failure = await recordFailure(ip);
            const msg = failure.locked
                ? `卡密无效，已锁定 ${failure.lock_minutes} 分钟`
                : result.msg + (failure.remain_attempts > 0 ? `（还剩 ${failure.remain_attempts} 次机会）` : '');
            return res.status(403).json({ ok: false, msg, remain_attempts: failure.remain_attempts, blocked: failure.locked });
        }

        await clearFailures(ip);
        res.json({ ok: true, code: SCRIPT_CODE, info: result.info });
    } catch (err) {
        console.error('验证错误:', err);
        res.status(500).json({ ok: false, msg: '服务器错误' });
    }
});

// 卡密检查端点（不绑定设备）
app.get('/api/check', async (req, res) => {
    try {
        const keyCode = req.query.key;
        const ip = getClientIP(req);

        const rateCheck = await checkRateLimit(ip);
        if (rateCheck.blocked) return res.status(429).json({ ok: false, msg: rateCheck.msg, blocked: true });
        if (!keyCode) return res.status(400).json({ ok: false, msg: '缺少卡密' });

        const result = await validateKey(keyCode, null);
        if (!result.valid) {
            if (result.reason === 'disabled' || result.reason === 'expired') {
                return res.status(403).json({ ok: false, msg: result.msg });
            }
            const failure = await recordFailure(ip);
            const msg = failure.locked
                ? `卡密无效，已锁定 ${failure.lock_minutes} 分钟`
                : result.msg + (failure.remain_attempts > 0 ? `（还剩 ${failure.remain_attempts} 次机会）` : '');
            return res.status(403).json({ ok: false, msg, remain_attempts: failure.remain_attempts, blocked: failure.locked });
        }

        await clearFailures(ip);
        res.json({ ok: true, info: result.info });
    } catch (err) {
        console.error('检查错误:', err);
        res.status(500).json({ ok: false, msg: '服务器错误' });
    }
});

// 公开接口：获取联系方式 + 定价方案
app.get('/api/contact', async (req, res) => {
    try {
        const [wechatId] = await pool.execute("SELECT value FROM settings WHERE `key` = 'wechat_id'");
        const [wechatQr] = await pool.execute("SELECT value FROM settings WHERE `key` = 'wechat_qrcode'");
        const [pricingRow] = await pool.execute("SELECT value FROM settings WHERE `key` = 'pricing'");

        const defaultPricing = [
            { name: '体验卡', price: 1, unit: '元', duration: '1天' },
            { name: '周卡', price: 5, unit: '元', duration: '7天', popular: true },
            { name: '月卡', price: 15, unit: '元', duration: '30天' }
        ];

        let pricing = defaultPricing;
        try {
            if (pricingRow[0]?.value) pricing = JSON.parse(pricingRow[0].value);
        } catch(e) {}

        res.json({
            ok: true,
            wechat_id: wechatId[0]?.value || '',
            wechat_qrcode: wechatQr[0]?.value || '',
            pricing
        });
    } catch (err) {
        console.error('获取联系方式错误:', err);
        res.status(500).json({ ok: false, msg: '服务器错误' });
    }
});

// 投递上报 API
app.post('/api/report', async (req, res) => {
    try {
        const keyCode = req.body.key;
        if (!keyCode) return res.status(400).json({ ok: false });

        const [key] = await pool.execute('SELECT code FROM licenses WHERE code = ?', [keyCode]);
        if (key.length === 0) return res.status(403).json({ ok: false });

        const date = beijingDate();
        const time = beijingTime();

        await pool.execute(
            'INSERT INTO apply_logs (license_code, job_name, salary, applied_at) VALUES (?, ?, ?, ?)',
            [keyCode, req.body.job || '', req.body.salary || '', time]
        );

        await pool.execute(
            `INSERT INTO daily_stats (license_code, date, applied, skipped) VALUES (?, ?, 1, 0)
             ON DUPLICATE KEY UPDATE applied = applied + 1`,
            [keyCode, date]
        );

        res.json({ ok: true });
    } catch (err) {
        console.error('上报错误:', err);
        res.status(500).json({ ok: false });
    }
});

// ---- 管理员 API ----

// 管理员登录
app.post('/api/admin/login', async (req, res) => {
    try {
        const ip = getClientIP(req);
        const rateCheck = await checkRateLimit(ip);
        if (rateCheck.blocked) return res.status(429).json({ ok: false, msg: rateCheck.msg, blocked: true });

        const password = process.env.ADMIN_PASSWORD || 'bossboss';

        if (req.body.password !== password) {
            const failure = await recordFailure(ip);
            const msg = failure.locked
                ? `错误次数过多，已锁定 ${failure.lock_minutes} 分钟`
                : `密码错误（还剩 ${failure.remain_attempts} 次机会）`;
            return res.status(403).json({ ok: false, msg, remain_attempts: failure.remain_attempts, blocked: failure.locked });
        }

        await clearFailures(ip);
        res.json({ ok: true });
    } catch (err) {
        console.error('登录错误:', err);
        res.status(500).json({ ok: false, msg: '服务器错误' });
    }
});

// 认证守卫中间件
function adminAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    const password = process.env.ADMIN_PASSWORD || 'bossboss';
    if (!authHeader || authHeader !== `Bearer ${password}`) {
        return res.status(401).json({ ok: false, msg: '未授权' });
    }
    next();
}

// 获取所有卡密
app.get('/api/admin/keys', adminAuth, async (req, res) => {
    try {
        const [rows] = await pool.execute('SELECT * FROM licenses ORDER BY created_at DESC');
        const keys = [];
        let stats = { total: 0, active: 0, inactive: 0, expired: 0, disabled: 0 };

        for (const key of rows) {
            const [devices] = await pool.execute('SELECT * FROM devices WHERE license_code = ?', [key.code]);

            let status, statusLabel, remainDays = null;
            if (key.disabled) {
                status = 'disabled'; statusLabel = '已禁用'; stats.disabled++;
            } else if (!key.activated_at) {
                status = 'inactive'; statusLabel = '未激活'; stats.inactive++;
            } else {
                const expiresAt = new Date(new Date(key.activated_at).getTime() + key.days * 24 * 60 * 60 * 1000);
                if (new Date() > expiresAt) {
                    status = 'expired'; statusLabel = '已过期'; stats.expired++;
                } else {
                    remainDays = Math.ceil((expiresAt - new Date()) / (24 * 60 * 60 * 1000));
                    status = 'active'; statusLabel = `剩余${remainDays}天`; stats.active++;
                }
            }
            stats.total++;

            const [applyRow] = await pool.execute(
                'SELECT SUM(applied) as total_applied FROM daily_stats WHERE license_code = ?',
                [key.code]
            );

            keys.push({
                code: key.code, days: key.days, max_devices: key.max_devices,
                created_at: key.created_at, activated_at: key.activated_at,
                disabled: !!key.disabled, note: key.note || '', status, status_label: statusLabel,
                remain_days: remainDays, devices,
                total_applied: applyRow[0]?.total_applied || 0
            });
        }

        res.json({ ok: true, stats, keys });
    } catch (err) {
        console.error('获取卡密错误:', err);
        res.status(500).json({ ok: false, msg: '服务器错误' });
    }
});

// 生成卡密
app.post('/api/admin/generate', adminAuth, async (req, res) => {
    try {
        const days = parseInt(req.body.days) || 30;
        const maxDevices = parseInt(req.body.max_devices) || 2;
        const count = Math.min(parseInt(req.body.count) || 1, 100);
        const note = (req.body.note || '').slice(0, 200);

        const generated = [];
        for (let i = 0; i < count; i++) {
            let code = generateKeyCode();
            await pool.execute(
                'INSERT INTO licenses (code, days, max_devices, created_at, disabled, note) VALUES (?, ?, ?, ?, 0, ?)',
                [code, days, maxDevices, now(), note]
            );
            generated.push(code);
        }

        res.json({ ok: true, generated });
    } catch (err) {
        console.error('生成卡密错误:', err);
        res.status(500).json({ ok: false, msg: '服务器错误' });
    }
});

// 禁用卡密
app.post('/api/admin/disable', adminAuth, async (req, res) => {
    try {
        const [result] = await pool.execute('UPDATE licenses SET disabled = 1 WHERE code = ?', [req.body.key]);
        if (result.affectedRows === 0) return res.status(404).json({ ok: false, msg: '卡密不存在' });
        res.json({ ok: true });
    } catch (err) {
        console.error('禁用卡密错误:', err);
        res.status(500).json({ ok: false, msg: '服务器错误' });
    }
});

// 启用卡密
app.post('/api/admin/enable', adminAuth, async (req, res) => {
    try {
        const [result] = await pool.execute('UPDATE licenses SET disabled = 0 WHERE code = ?', [req.body.key]);
        if (result.affectedRows === 0) return res.status(404).json({ ok: false, msg: '卡密不存在' });
        res.json({ ok: true });
    } catch (err) {
        console.error('启用卡密错误:', err);
        res.status(500).json({ ok: false, msg: '服务器错误' });
    }
});

// 更新卡密备注
app.post('/api/admin/note', adminAuth, async (req, res) => {
    try {
        const note = (req.body.note || '').slice(0, 200);
        const [result] = await pool.execute('UPDATE licenses SET note = ? WHERE code = ?', [note, req.body.key]);
        if (result.affectedRows === 0) return res.status(404).json({ ok: false, msg: '卡密不存在' });
        res.json({ ok: true });
    } catch (err) {
        console.error('更新备注错误:', err);
        res.status(500).json({ ok: false, msg: '服务器错误' });
    }
});

// 删除卡密
app.post('/api/admin/delete', adminAuth, async (req, res) => {
    try {
        await pool.execute('DELETE FROM devices WHERE license_code = ?', [req.body.key]);
        const [result] = await pool.execute('DELETE FROM licenses WHERE code = ?', [req.body.key]);
        if (result.affectedRows === 0) return res.status(404).json({ ok: false, msg: '卡密不存在' });
        res.json({ ok: true });
    } catch (err) {
        console.error('删除卡密错误:', err);
        res.status(500).json({ ok: false, msg: '服务器错误' });
    }
});

// 获取被封禁的 IP
app.get('/api/admin/blocked', adminAuth, async (req, res) => {
    try {
        const nowStr = now();
        const [rows] = await pool.execute(
            'SELECT * FROM rate_limits WHERE blocked_until IS NOT NULL AND blocked_until > ?',
            [nowStr]
        );
        const blocked = rows.map(r => ({
            ip: r.ip, failures: r.failures,
            blocked_until: r.blocked_until,
            remain_min: Math.ceil((new Date(r.blocked_until) - new Date()) / 60000)
        }));
        res.json({ ok: true, blocked });
    } catch (err) {
        console.error('获取封禁列表错误:', err);
        res.status(500).json({ ok: false, msg: '服务器错误' });
    }
});

// 解封 IP
app.post('/api/admin/unblock', adminAuth, async (req, res) => {
    try {
        await pool.execute('DELETE FROM rate_limits WHERE ip = ?', [req.body.ip]);
        res.json({ ok: true });
    } catch (err) {
        console.error('解封错误:', err);
        res.status(500).json({ ok: false, msg: '服务器错误' });
    }
});

// 查看卡密投递统计
app.get('/api/admin/stats', adminAuth, async (req, res) => {
    try {
        const keyCode = req.query.key;
        if (!keyCode) return res.status(400).json({ ok: false, msg: '缺少卡密' });

        const [dailyRows] = await pool.execute(
            'SELECT * FROM daily_stats WHERE license_code = ? ORDER BY date DESC LIMIT 30',
            [keyCode]
        );

        const [logRows] = await pool.execute(
            'SELECT * FROM apply_logs WHERE license_code = ? ORDER BY applied_at DESC LIMIT 50',
            [keyCode]
        );

        const [totalRow] = await pool.execute(
            'SELECT SUM(applied) as total_applied FROM daily_stats WHERE license_code = ?',
            [keyCode]
        );

        res.json({
            ok: true,
            total_applied: totalRow[0]?.total_applied || 0,
            daily: dailyRows,
            logs: logRows
        });
    } catch (err) {
        console.error('获取统计错误:', err);
        res.status(500).json({ ok: false, msg: '服务器错误' });
    }
});

// 管理员获取联系方式
app.get('/api/admin/contact', adminAuth, async (req, res) => {
    try {
        const [wechatId] = await pool.execute("SELECT value FROM settings WHERE `key` = 'wechat_id'");
        const [wechatQr] = await pool.execute("SELECT value FROM settings WHERE `key` = 'wechat_qrcode'");
        const [pricingRow] = await pool.execute("SELECT value FROM settings WHERE `key` = 'pricing'");

        const defaultPricing = [
            { name: '体验卡', price: 1, unit: '元', duration: '1天' },
            { name: '周卡', price: 5, unit: '元', duration: '7天', popular: true },
            { name: '月卡', price: 15, unit: '元', duration: '30天' }
        ];

        let pricing = defaultPricing;
        try {
            if (pricingRow[0]?.value) pricing = JSON.parse(pricingRow[0].value);
        } catch(e) {}

        res.json({
            ok: true,
            wechat_id: wechatId[0]?.value || '',
            wechat_qrcode: wechatQr[0]?.value || '',
            pricing
        });
    } catch (err) {
        console.error('获取联系方式错误:', err);
        res.status(500).json({ ok: false, msg: '服务器错误' });
    }
});

// 管理员更新联系方式
app.post('/api/admin/contact', adminAuth, async (req, res) => {
    try {
        if (req.body.wechat_id !== undefined) {
            await pool.execute(
                "INSERT INTO settings (`key`, value) VALUES ('wechat_id', ?) ON DUPLICATE KEY UPDATE value = ?",
                [req.body.wechat_id, req.body.wechat_id]
            );
        }
        if (req.body.wechat_qrcode !== undefined) {
            await pool.execute(
                "INSERT INTO settings (`key`, value) VALUES ('wechat_qrcode', ?) ON DUPLICATE KEY UPDATE value = ?",
                [req.body.wechat_qrcode, req.body.wechat_qrcode]
            );
        }
        if (req.body.pricing !== undefined) {
            const pricingJson = JSON.stringify(req.body.pricing);
            await pool.execute(
                "INSERT INTO settings (`key`, value) VALUES ('pricing', ?) ON DUPLICATE KEY UPDATE value = ?",
                [pricingJson, pricingJson]
            );
        }
        res.json({ ok: true });
    } catch (err) {
        console.error('更新联系方式错误:', err);
        res.status(500).json({ ok: false, msg: '服务器错误' });
    }
});

// 清理90天前的详细日志
app.post('/api/admin/cleanup', adminAuth, async (req, res) => {
    try {
        const cutoff = new Date(Date.now() - 90 * 24 * 3600000 + 8 * 3600000)
            .toISOString().slice(0, 10);
        const [result] = await pool.execute(
            'DELETE FROM apply_logs WHERE applied_at < ?',
            [cutoff]
        );
        res.json({ ok: true, deleted: result.affectedRows });
    } catch (err) {
        console.error('清理日志错误:', err);
        res.status(500).json({ ok: false, msg: '服务器错误' });
    }
});

// 404 处理
app.use((req, res) => {
    res.status(404).json({ error: 'Not Found' });
});

// 启动服务器
app.listen(PORT, async () => {
    console.log(`Boss 自动投递服务器启动成功`);
    console.log(`端口: ${PORT}`);
    console.log(`环境: ${process.env.NODE_ENV || 'development'}`);

    try {
        await pool.query('SELECT 1');
        console.log('数据库连接成功');
    } catch (err) {
        console.error('数据库连接失败:', err.message);
        console.error('请检查环境变量配置和数据库状态');
    }
});

// 优雅关闭
process.on('SIGTERM', async () => {
    console.log('收到 SIGTERM 信号，正在关闭服务器...');
    await pool.end();
    process.exit(0);
});









