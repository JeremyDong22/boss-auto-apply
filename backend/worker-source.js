// worker-source.js - v6 - 联系方式 + 定价方案均可在 admin 后台管理
// Cloudflare Worker 版卡密验证服务器
// 由 build.js 注入 bookmarklet 代码后生成 _worker.js 部署
// D1 绑定名: DB

const SCRIPT_CODE = "%%BOOKMARKLET%%";

// ---- 防暴力破解配置 ----
const MAX_ATTEMPTS_BEFORE_FIRST_LOCK = 5;
const LOCK_TIERS = [
    { threshold: 5, lock_minutes: 15 },
    { threshold: 10, lock_minutes: 60 },
    { threshold: 20, lock_minutes: 1440 }
];

// ---- 工具函数 ----

function jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization'
        }
    });
}

function getClientIP(request) {
    return request.headers.get('CF-Connecting-IP')
        || request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim()
        || 'unknown';
}

// 生成 BOSS-XXXX-XXXX 格式卡密
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

function now() { return new Date().toISOString(); }

// 北京时间日期字符串（UTC+8）
function beijingDate() {
    const d = new Date(Date.now() + 8 * 3600000);
    return d.toISOString().slice(0, 10);
}

function beijingTime() {
    const d = new Date(Date.now() + 8 * 3600000);
    return d.toISOString().slice(0, 19).replace('T', ' ');
}

// ---- 防暴力破解（D1 存储） ----

async function checkRateLimit(db, ip) {
    const row = await db.prepare('SELECT * FROM rate_limits WHERE ip = ?').bind(ip).first();
    if (!row) return { blocked: false, remain_attempts: MAX_ATTEMPTS_BEFORE_FIRST_LOCK };

    if (row.blocked_until && new Date() < new Date(row.blocked_until)) {
        const remainMin = Math.ceil((new Date(row.blocked_until) - new Date()) / 60000);
        return { blocked: true, msg: `操作过于频繁，请 ${remainMin} 分钟后再试`, remain_attempts: 0 };
    }

    return { blocked: false, remain_attempts: Math.max(0, MAX_ATTEMPTS_BEFORE_FIRST_LOCK - row.failures) };
}

async function recordFailure(db, ip) {
    const row = await db.prepare('SELECT * FROM rate_limits WHERE ip = ?').bind(ip).first();
    const count = row ? row.failures + 1 : 1;

    let blockedUntil = null;
    let lockMinutes = 0;
    for (let i = LOCK_TIERS.length - 1; i >= 0; i--) {
        if (count >= LOCK_TIERS[i].threshold) {
            lockMinutes = LOCK_TIERS[i].lock_minutes;
            blockedUntil = new Date(Date.now() + lockMinutes * 60000).toISOString();
            break;
        }
    }

    await db.prepare(
        'INSERT INTO rate_limits (ip, failures, blocked_until, last_attempt) VALUES (?, ?, ?, ?) ' +
        'ON CONFLICT(ip) DO UPDATE SET failures = ?, blocked_until = ?, last_attempt = ?'
    ).bind(ip, count, blockedUntil, now(), count, blockedUntil, now()).run();

    const remain = Math.max(0, MAX_ATTEMPTS_BEFORE_FIRST_LOCK - count);
    return { locked: !!blockedUntil, lock_minutes: lockMinutes, remain_attempts: remain, total_failures: count };
}

async function clearFailures(db, ip) {
    await db.prepare('DELETE FROM rate_limits WHERE ip = ?').bind(ip).run();
}

// ---- 卡密验证核心 ----

async function validateKey(db, keyCode, fingerprint) {
    const key = await db.prepare('SELECT * FROM licenses WHERE code = ?').bind(keyCode).first();
    if (!key) return { valid: false, reason: 'not_found', msg: '卡密无效' };
    if (key.disabled) return { valid: false, reason: 'disabled', msg: '卡密已被禁用，请联系管理员' };

    // 首次激活
    let activatedAt = key.activated_at;
    if (!activatedAt) {
        activatedAt = now();
        await db.prepare('UPDATE licenses SET activated_at = ? WHERE code = ?').bind(activatedAt, keyCode).run();
    }

    // 检查过期
    const expiresAt = new Date(new Date(activatedAt).getTime() + key.days * 24 * 60 * 60 * 1000);
    if (new Date() > expiresAt) {
        return { valid: false, reason: 'expired', msg: `卡密已过期，请联系管理员续费` };
    }

    // 设备指纹
    if (fingerprint) {
        const existing = await db.prepare(
            'SELECT * FROM devices WHERE license_code = ? AND fingerprint = ?'
        ).bind(keyCode, fingerprint).first();

        if (existing) {
            await db.prepare(
                'UPDATE devices SET last_seen = ? WHERE license_code = ? AND fingerprint = ?'
            ).bind(now(), keyCode, fingerprint).run();
        } else {
            const deviceCount = await db.prepare(
                'SELECT COUNT(*) as cnt FROM devices WHERE license_code = ?'
            ).bind(keyCode).first();

            if (deviceCount.cnt >= key.max_devices) {
                return { valid: false, msg: `设备数已达上限（最多 ${key.max_devices} 台），请联系客服` };
            }
            await db.prepare(
                'INSERT INTO devices (license_code, fingerprint, first_seen, last_seen) VALUES (?, ?, ?, ?)'
            ).bind(keyCode, fingerprint, now(), now()).run();
        }
    }

    const remainDays = Math.ceil((expiresAt - new Date()) / (24 * 60 * 60 * 1000));
    return {
        valid: true, msg: 'OK',
        info: { remain_days: remainDays, expires_at: expiresAt.toISOString(), devices_used: 0, max_devices: key.max_devices }
    };
}

// ---- 超薄 loader：返回完整的登录面板 + 验证逻辑 JS ----
// v2: 修复自动验证失败时不显示登录面板的 bug（提取 showPanel 函数）
// 由 /api/loader 路由返回，书签只需 fetch 这个端点再 eval
function buildLoaderJS(apiBase) {
    return `(function() {
    var k = localStorage.getItem('boss_auto_key');
    var api = '${apiBase}';

    // 显示登录面板（可选预填错误信息）
    function showPanel(errMsg) {
        var old = document.getElementById('aa-login'); if (old) old.remove();
        var d = document.createElement('div'); d.id = 'aa-login';
        d.innerHTML = '<div style="position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.45);z-index:99998"></div>'
            + '<div style="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:99999;background:#fff;padding:36px 32px;border-radius:16px;box-shadow:0 8px 40px rgba(0,0,0,0.25);font-family:system-ui;text-align:center;min-width:320px">'
                + '<div id="aa-login-close" style="position:absolute;top:10px;right:14px;cursor:pointer;font-size:28px;color:#999;line-height:1;font-weight:300">\\u00d7</div>'
                + '<div style="font-size:22px;font-weight:bold;color:#00bebd;margin-bottom:6px">Boss 自动投递</div>'
                + '<div style="color:#999;font-size:13px;margin-bottom:20px">请输入卡密激活使用</div>'
                + '<input id="aa-login-input" type="text" placeholder="BOSS-XXXX-XXXX" maxlength="14" style="width:100%;padding:13px;border:2px solid #eee;border-radius:8px;font-size:17px;font-family:monospace;text-align:center;text-transform:uppercase;outline:none;box-sizing:border-box;transition:border-color 0.2s" autocomplete="off" spellcheck="false">'
                + '<div id="aa-login-err" style="color:#e74c3c;font-size:13px;margin-top:10px;display:none"></div>'
                + '<button id="aa-login-btn" style="width:100%;padding:13px;margin-top:14px;background:linear-gradient(135deg,#00bebd,#00a8a7);color:#fff;border:none;border-radius:8px;font-size:16px;font-weight:600;cursor:pointer;transition:opacity 0.2s">激活</button>'
                + '<div style="color:#bbb;font-size:11px;margin-top:12px">卡密将自动记住，下次无需重复输入</div>'
            + '</div>';
        document.body.appendChild(d);
        var inp = document.getElementById('aa-login-input'); inp.focus();

        // 如果有预填错误信息，显示出来
        if (errMsg) {
            var ee = document.getElementById('aa-login-err');
            ee.textContent = errMsg; ee.style.display = 'block';
        }

        // 自动格式化输入
        inp.oninput = function() {
            var v = this.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
            if (v.length > 4 && v.slice(0, 4) === 'BOSS') v = v.slice(0, 4) + '-' + v.slice(4);
            if (v.length > 9 && v.charAt(9) !== '-') v = v.slice(0, 9) + '-' + v.slice(9);
            this.value = v.slice(0, 14);
        };

        // 点击激活
        document.getElementById('aa-login-btn').onclick = function() {
            var v = document.getElementById('aa-login-input').value.trim().toUpperCase();
            var err = document.getElementById('aa-login-err');
            if (!v) { err.textContent = '请输入卡密'; err.style.display = 'block'; return; }
            err.style.display = 'none';
            localStorage.setItem('boss_auto_key', v); ld(v);
        };

        // 回车触发
        document.getElementById('aa-login-input').onkeydown = function(e) { if (e.key === 'Enter') document.getElementById('aa-login-btn').click(); };

        // 点遮罩或 X 关闭
        d.firstChild.onclick = function() { d.remove(); };
        document.getElementById('aa-login-close').onclick = function() { d.remove(); };
    }

    // 验证 key → 成功则注入投递脚本
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
                        // 面板已存在，直接显示错误
                        ee.textContent = d.msg; ee.style.display = 'block';
                        if (btn) { btn.textContent = '激活'; btn.disabled = false; }
                    } else {
                        // 面板不存在（自动验证路径），显示面板并带上错误信息
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

    // 有 key → 直接验证
    if (k) { ld(k); return; }

    // 无 key → 显示登录面板
    showPanel();
})();`;
}

// ---- 路由处理 ----

export default {
    async fetch(request, env) {
        if (request.method === 'OPTIONS') {
            return new Response(null, {
                status: 204,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
                }
            });
        }

        const url = new URL(request.url);
        const db = env.DB;
        const ip = getClientIP(request);

        // ---- 客户端 API ----

        // 超薄 loader 端点：返回登录面板 + 验证逻辑的完整 JS
        if (url.pathname === '/api/loader') {
            return new Response(buildLoaderJS(url.origin), {
                headers: {
                    'Content-Type': 'text/javascript; charset=utf-8',
                    'Access-Control-Allow-Origin': '*',
                    'Cache-Control': 'no-cache'
                }
            });
        }

        if (url.pathname === '/api/verify') {
            const keyCode = url.searchParams.get('key');
            const fp = url.searchParams.get('fp');

            const rateCheck = await checkRateLimit(db, ip);
            if (rateCheck.blocked) return jsonResponse({ ok: false, msg: rateCheck.msg, blocked: true }, 429);
            if (!keyCode) return jsonResponse({ ok: false, msg: '缺少卡密' }, 400);

            const result = await validateKey(db, keyCode, fp);
            if (!result.valid) {
                // 禁用/过期的卡密直接返回提示，不计入暴力破解次数
                if (result.reason === 'disabled' || result.reason === 'expired') {
                    return jsonResponse({ ok: false, msg: result.msg }, 403);
                }
                const failure = await recordFailure(db, ip);
                const msg = failure.locked
                    ? `卡密无效，已锁定 ${failure.lock_minutes} 分钟`
                    : result.msg + (failure.remain_attempts > 0 ? `（还剩 ${failure.remain_attempts} 次机会）` : '');
                return jsonResponse({ ok: false, msg, remain_attempts: failure.remain_attempts, blocked: failure.locked }, 403);
            }

            await clearFailures(db, ip);
            return jsonResponse({ ok: true, code: SCRIPT_CODE, info: result.info });
        }

        if (url.pathname === '/api/check') {
            const keyCode = url.searchParams.get('key');

            const rateCheck = await checkRateLimit(db, ip);
            if (rateCheck.blocked) return jsonResponse({ ok: false, msg: rateCheck.msg, blocked: true }, 429);
            if (!keyCode) return jsonResponse({ ok: false, msg: '缺少卡密' }, 400);

            const result = await validateKey(db, keyCode, null);
            if (!result.valid) {
                // 禁用/过期的卡密直接返回提示，不计入暴力破解次数
                if (result.reason === 'disabled' || result.reason === 'expired') {
                    return jsonResponse({ ok: false, msg: result.msg }, 403);
                }
                const failure = await recordFailure(db, ip);
                const msg = failure.locked
                    ? `卡密无效，已锁定 ${failure.lock_minutes} 分钟`
                    : result.msg + (failure.remain_attempts > 0 ? `（还剩 ${failure.remain_attempts} 次机会）` : '');
                return jsonResponse({ ok: false, msg, remain_attempts: failure.remain_attempts, blocked: failure.locked }, 403);
            }

            await clearFailures(db, ip);
            return jsonResponse({ ok: true, info: result.info });
        }

        // 公开接口：获取联系方式 + 定价方案（前端展示用）
        if (url.pathname === '/api/contact') {
            const wechatId = await db.prepare("SELECT value FROM settings WHERE key = 'wechat_id'").first();
            const wechatQr = await db.prepare("SELECT value FROM settings WHERE key = 'wechat_qrcode'").first();
            const pricingRow = await db.prepare("SELECT value FROM settings WHERE key = 'pricing'").first();
            const defaultPricing = [
                { name: '体验卡', price: 1, unit: '元', duration: '1天' },
                { name: '周卡', price: 5, unit: '元', duration: '7天', popular: true },
                { name: '月卡', price: 15, unit: '元', duration: '30天' }
            ];
            let pricing = defaultPricing;
            try { if (pricingRow?.value) pricing = JSON.parse(pricingRow.value); } catch(e) {}
            return jsonResponse({
                ok: true,
                wechat_id: wechatId?.value || '',
                wechat_qrcode: wechatQr?.value || '',
                pricing
            });
        }

        // ---- 投递上报 API（bookmarklet 静默调用） ----

        if (url.pathname === '/api/report' && request.method === 'POST') {
            const body = await request.json().catch(() => ({}));
            const keyCode = body.key;
            if (!keyCode) return jsonResponse({ ok: false }, 400);

            // 简单验证 key 存在
            const key = await db.prepare('SELECT code FROM licenses WHERE code = ?').bind(keyCode).first();
            if (!key) return jsonResponse({ ok: false }, 403);

            const date = beijingDate();
            const time = beijingTime();

            // 写入详细日志
            await db.prepare(
                'INSERT INTO apply_logs (license_code, job_name, salary, applied_at) VALUES (?, ?, ?, ?)'
            ).bind(keyCode, body.job || '', body.salary || '', time).run();

            // 更新每日汇总
            await db.prepare(
                'INSERT INTO daily_stats (license_code, date, applied, skipped) VALUES (?, ?, 1, 0) ' +
                'ON CONFLICT(license_code, date) DO UPDATE SET applied = applied + 1'
            ).bind(keyCode, date).run();

            return jsonResponse({ ok: true });
        }

        // ---- 管理员 API ----

        // 管理员登录（复用现有防暴力破解机制）
        if (url.pathname === '/api/admin/login' && request.method === 'POST') {
            const rateCheck = await checkRateLimit(db, ip);
            if (rateCheck.blocked) return jsonResponse({ ok: false, msg: rateCheck.msg, blocked: true }, 429);

            const body = await request.json().catch(() => ({}));
            const password = env.ADMIN_PASSWORD || 'bossboss';

            if (body.password !== password) {
                const failure = await recordFailure(db, ip);
                const msg = failure.locked
                    ? `错误次数过多，已锁定 ${failure.lock_minutes} 分钟`
                    : `密码错误（还剩 ${failure.remain_attempts} 次机会）`;
                return jsonResponse({ ok: false, msg, remain_attempts: failure.remain_attempts, blocked: failure.locked }, 403);
            }

            await clearFailures(db, ip);
            return jsonResponse({ ok: true });
        }

        // 认证守卫：其他所有 admin 路由需要 Bearer token
        if (url.pathname.startsWith('/api/admin/')) {
            const authHeader = request.headers.get('Authorization');
            const password = env.ADMIN_PASSWORD || 'bossboss';
            if (!authHeader || authHeader !== `Bearer ${password}`) {
                return jsonResponse({ ok: false, msg: '未授权' }, 401);
            }
        }

        if (url.pathname === '/api/admin/keys' && request.method === 'GET') {
            const rows = await db.prepare('SELECT * FROM licenses ORDER BY created_at DESC').all();
            const keys = [];
            let stats = { total: 0, active: 0, inactive: 0, expired: 0, disabled: 0 };

            for (const key of rows.results) {
                const devices = await db.prepare(
                    'SELECT * FROM devices WHERE license_code = ?'
                ).bind(key.code).all();

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

                keys.push({
                    code: key.code, days: key.days, max_devices: key.max_devices,
                    created_at: key.created_at, activated_at: key.activated_at,
                    disabled: !!key.disabled, status, status_label: statusLabel,
                    remain_days: remainDays, devices: devices.results
                });
            }

            return jsonResponse({ ok: true, stats, keys });
        }

        if (url.pathname === '/api/admin/generate' && request.method === 'POST') {
            const body = await request.json().catch(() => ({}));
            const days = parseInt(body.days) || 30;
            const maxDevices = parseInt(body.max_devices) || 2;
            const count = Math.min(parseInt(body.count) || 1, 100);
            const note = (body.note || '').slice(0, 200);

            const generated = [];
            for (let i = 0; i < count; i++) {
                let code = generateKeyCode();
                await db.prepare(
                    'INSERT INTO licenses (code, days, max_devices, created_at, disabled, note) VALUES (?, ?, ?, ?, 0, ?)'
                ).bind(code, days, maxDevices, now(), note).run();
                generated.push(code);
            }

            return jsonResponse({ ok: true, generated });
        }

        if (url.pathname === '/api/admin/disable' && request.method === 'POST') {
            const body = await request.json().catch(() => ({}));
            const result = await db.prepare('UPDATE licenses SET disabled = 1 WHERE code = ?').bind(body.key).run();
            if (result.meta.changes === 0) return jsonResponse({ ok: false, msg: '卡密不存在' }, 404);
            return jsonResponse({ ok: true });
        }

        if (url.pathname === '/api/admin/enable' && request.method === 'POST') {
            const body = await request.json().catch(() => ({}));
            const result = await db.prepare('UPDATE licenses SET disabled = 0 WHERE code = ?').bind(body.key).run();
            if (result.meta.changes === 0) return jsonResponse({ ok: false, msg: '卡密不存在' }, 404);
            return jsonResponse({ ok: true });
        }

        if (url.pathname === '/api/admin/note' && request.method === 'POST') {
            const body = await request.json().catch(() => ({}));
            const note = (body.note || '').slice(0, 200);
            const result = await db.prepare('UPDATE licenses SET note = ? WHERE code = ?').bind(note, body.key).run();
            if (result.meta.changes === 0) return jsonResponse({ ok: false, msg: '卡密不存在' }, 404);
            return jsonResponse({ ok: true });
        }

        if (url.pathname === '/api/admin/delete' && request.method === 'POST') {
            const body = await request.json().catch(() => ({}));
            // 先删关联设备，再删卡密
            await db.prepare('DELETE FROM devices WHERE license_code = ?').bind(body.key).run();
            const result = await db.prepare('DELETE FROM licenses WHERE code = ?').bind(body.key).run();
            if (result.meta.changes === 0) return jsonResponse({ ok: false, msg: '卡密不存在' }, 404);
            return jsonResponse({ ok: true });
        }

        if (url.pathname === '/api/admin/blocked' && request.method === 'GET') {
            const nowStr = now();
            const rows = await db.prepare(
                'SELECT * FROM rate_limits WHERE blocked_until IS NOT NULL AND blocked_until > ?'
            ).bind(nowStr).all();
            const blocked = rows.results.map(r => ({
                ip: r.ip, failures: r.failures,
                blocked_until: r.blocked_until,
                remain_min: Math.ceil((new Date(r.blocked_until) - new Date()) / 60000)
            }));
            return jsonResponse({ ok: true, blocked });
        }

        if (url.pathname === '/api/admin/unblock' && request.method === 'POST') {
            const body = await request.json().catch(() => ({}));
            await db.prepare('DELETE FROM rate_limits WHERE ip = ?').bind(body.ip).run();
            return jsonResponse({ ok: true });
        }

        // 查看某个卡密的投递统计（每日汇总 + 最近详细记录）
        if (url.pathname === '/api/admin/stats' && request.method === 'GET') {
            const keyCode = url.searchParams.get('key');
            if (!keyCode) return jsonResponse({ ok: false, msg: '缺少卡密' }, 400);

            // 每日汇总（最近30天）
            const dailyRows = await db.prepare(
                'SELECT * FROM daily_stats WHERE license_code = ? ORDER BY date DESC LIMIT 30'
            ).bind(keyCode).all();

            // 最近投递详情（最近50条）
            const logRows = await db.prepare(
                'SELECT * FROM apply_logs WHERE license_code = ? ORDER BY applied_at DESC LIMIT 50'
            ).bind(keyCode).all();

            // 累计投递总数
            const totalRow = await db.prepare(
                'SELECT SUM(applied) as total_applied FROM daily_stats WHERE license_code = ?'
            ).bind(keyCode).first();

            return jsonResponse({
                ok: true,
                total_applied: totalRow?.total_applied || 0,
                daily: dailyRows.results,
                logs: logRows.results
            });
        }

        // ---- 联系方式管理（微信号 + 二维码） ----

        // 管理员获取/更新联系方式 + 定价
        if (url.pathname === '/api/admin/contact' && request.method === 'GET') {
            const wechatId = await db.prepare("SELECT value FROM settings WHERE key = 'wechat_id'").first();
            const wechatQr = await db.prepare("SELECT value FROM settings WHERE key = 'wechat_qrcode'").first();
            const pricingRow = await db.prepare("SELECT value FROM settings WHERE key = 'pricing'").first();
            const defaultPricing = [
                { name: '体验卡', price: 1, unit: '元', duration: '1天' },
                { name: '周卡', price: 5, unit: '元', duration: '7天', popular: true },
                { name: '月卡', price: 15, unit: '元', duration: '30天' }
            ];
            let pricing = defaultPricing;
            try { if (pricingRow?.value) pricing = JSON.parse(pricingRow.value); } catch(e) {}
            return jsonResponse({
                ok: true,
                wechat_id: wechatId?.value || '',
                wechat_qrcode: wechatQr?.value || '',
                pricing
            });
        }

        if (url.pathname === '/api/admin/contact' && request.method === 'POST') {
            const body = await request.json().catch(() => ({}));
            if (body.wechat_id !== undefined) {
                await db.prepare(
                    "INSERT INTO settings (key, value) VALUES ('wechat_id', ?) ON CONFLICT(key) DO UPDATE SET value = ?"
                ).bind(body.wechat_id, body.wechat_id).run();
            }
            if (body.wechat_qrcode !== undefined) {
                await db.prepare(
                    "INSERT INTO settings (key, value) VALUES ('wechat_qrcode', ?) ON CONFLICT(key) DO UPDATE SET value = ?"
                ).bind(body.wechat_qrcode, body.wechat_qrcode).run();
            }
            if (body.pricing !== undefined) {
                const pricingJson = JSON.stringify(body.pricing);
                await db.prepare(
                    "INSERT INTO settings (key, value) VALUES ('pricing', ?) ON CONFLICT(key) DO UPDATE SET value = ?"
                ).bind(pricingJson, pricingJson).run();
            }
            return jsonResponse({ ok: true });
        }

        // 清理90天前的详细日志（可手动触发或定时调用）
        if (url.pathname === '/api/admin/cleanup' && request.method === 'POST') {
            const cutoff = new Date(Date.now() - 90 * 24 * 3600000 + 8 * 3600000)
                .toISOString().slice(0, 10);
            const result = await db.prepare(
                'DELETE FROM apply_logs WHERE applied_at < ?'
            ).bind(cutoff).run();
            return jsonResponse({ ok: true, deleted: result.meta.changes });
        }

        return jsonResponse({ error: 'Not Found' }, 404);
    }
};
