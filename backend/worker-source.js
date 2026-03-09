// worker-source.js - v2 - 添加管理员认证
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
            'Access-Control-Allow-Headers': 'Content-Type'
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
    if (!key) return { valid: false, msg: '卡密无效' };
    if (key.disabled) return { valid: false, msg: '卡密已被禁用' };

    // 首次激活
    let activatedAt = key.activated_at;
    if (!activatedAt) {
        activatedAt = now();
        await db.prepare('UPDATE licenses SET activated_at = ? WHERE code = ?').bind(activatedAt, keyCode).run();
    }

    // 检查过期
    const expiresAt = new Date(new Date(activatedAt).getTime() + key.days * 24 * 60 * 60 * 1000);
    if (new Date() > expiresAt) {
        return { valid: false, msg: `卡密已过期（${expiresAt.toLocaleDateString('zh-CN')} 到期）` };
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

// ---- 路由处理 ----

export default {
    async fetch(request, env) {
        if (request.method === 'OPTIONS') {
            return new Response(null, {
                status: 204,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type'
                }
            });
        }

        const url = new URL(request.url);
        const db = env.DB;
        const ip = getClientIP(request);

        // ---- 客户端 API ----

        if (url.pathname === '/api/verify') {
            const keyCode = url.searchParams.get('key');
            const fp = url.searchParams.get('fp');

            const rateCheck = await checkRateLimit(db, ip);
            if (rateCheck.blocked) return jsonResponse({ ok: false, msg: rateCheck.msg, blocked: true }, 429);
            if (!keyCode) return jsonResponse({ ok: false, msg: '缺少卡密' }, 400);

            const result = await validateKey(db, keyCode, fp);
            if (!result.valid) {
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
                const failure = await recordFailure(db, ip);
                const msg = failure.locked
                    ? `卡密无效，已锁定 ${failure.lock_minutes} 分钟`
                    : result.msg + (failure.remain_attempts > 0 ? `（还剩 ${failure.remain_attempts} 次机会）` : '');
                return jsonResponse({ ok: false, msg, remain_attempts: failure.remain_attempts, blocked: failure.locked }, 403);
            }

            await clearFailures(db, ip);
            return jsonResponse({ ok: true, info: result.info });
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

            const generated = [];
            for (let i = 0; i < count; i++) {
                let code = generateKeyCode();
                await db.prepare(
                    'INSERT INTO licenses (code, days, max_devices, created_at, disabled) VALUES (?, ?, ?, ?, 0)'
                ).bind(code, days, maxDevices, now()).run();
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

        return jsonResponse({ error: 'Not Found' }, 404);
    }
};
