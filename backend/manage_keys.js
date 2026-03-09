// manage_keys.js - v1
// 卡密管理 CLI 工具
// 用法:
//   node server/manage_keys.js generate                     → 生成 1 个卡密（默认30天/2设备）
//   node server/manage_keys.js generate --days 7 --devices 3 --count 10  → 批量生成
//   node server/manage_keys.js list                         → 列出所有卡密
//   node server/manage_keys.js info BOSS-XXXX-XXXX          → 查看详情
//   node server/manage_keys.js disable BOSS-XXXX-XXXX       → 禁用
//   node server/manage_keys.js enable BOSS-XXXX-XXXX        → 启用

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const KEYS_FILE = path.join(__dirname, 'keys.json');

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

// 生成 BOSS-XXXX-XXXX 格式的卡密
function generateKeyCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 去掉容易混淆的 I/O/0/1
    let part1 = '', part2 = '';
    for (let i = 0; i < 4; i++) {
        part1 += chars[crypto.randomInt(chars.length)];
        part2 += chars[crypto.randomInt(chars.length)];
    }
    return `BOSS-${part1}-${part2}`;
}

// 解析命令行参数
function parseArgs(args) {
    const result = {};
    for (let i = 0; i < args.length; i++) {
        if (args[i].startsWith('--') && i + 1 < args.length) {
            result[args[i].slice(2)] = args[i + 1];
            i++;
        }
    }
    return result;
}

const command = process.argv[2];
const args = parseArgs(process.argv.slice(3));

switch (command) {
    case 'generate': {
        const days = parseInt(args.days) || 30;
        const maxDevices = parseInt(args.devices) || 2;
        const count = parseInt(args.count) || 1;
        const keys = loadKeys();

        console.log(`生成 ${count} 个卡密（${days}天 / ${maxDevices}设备）:\n`);

        const newKeys = [];
        for (let i = 0; i < count; i++) {
            let code;
            do { code = generateKeyCode(); } while (keys[code]); // 避免重复

            keys[code] = {
                days: days,
                max_devices: maxDevices,
                created_at: new Date().toISOString(),
                activated_at: null,
                disabled: false,
                devices: []
            };
            newKeys.push(code);
            console.log(`  ${code}`);
        }

        saveKeys(keys);
        console.log(`\n已保存到 ${KEYS_FILE}`);
        break;
    }

    case 'list': {
        const keys = loadKeys();
        const entries = Object.entries(keys);

        if (entries.length === 0) {
            console.log('暂无卡密，使用 generate 命令创建');
            break;
        }

        console.log(`共 ${entries.length} 个卡密:\n`);
        console.log('卡密             | 状态   | 有效期 | 设备  | 激活时间');
        console.log('-'.repeat(70));

        for (const [code, key] of entries) {
            let status;
            if (key.disabled) {
                status = '已禁用';
            } else if (!key.activated_at) {
                status = '未激活';
            } else {
                const expiresAt = new Date(new Date(key.activated_at).getTime() + key.days * 24 * 60 * 60 * 1000);
                if (new Date() > expiresAt) {
                    status = '已过期';
                } else {
                    const remain = Math.ceil((expiresAt - new Date()) / (24 * 60 * 60 * 1000));
                    status = `剩${remain}天`;
                }
            }

            const devicesStr = `${key.devices.length}/${key.max_devices}`;
            const activatedStr = key.activated_at
                ? new Date(key.activated_at).toLocaleDateString('zh-CN')
                : '-';

            console.log(
                `${code} | ${status.padEnd(6)} | ${String(key.days).padStart(3)}天  | ${devicesStr.padEnd(5)} | ${activatedStr}`
            );
        }
        break;
    }

    case 'info': {
        const code = process.argv[3];
        if (!code) { console.log('用法: info <卡密>'); break; }

        const keys = loadKeys();
        const key = keys[code];
        if (!key) { console.log('卡密不存在: ' + code); break; }

        console.log(`卡密: ${code}`);
        console.log(`有效期: ${key.days} 天`);
        console.log(`最大设备数: ${key.max_devices}`);
        console.log(`创建时间: ${key.created_at}`);
        console.log(`激活时间: ${key.activated_at || '未激活'}`);
        console.log(`状态: ${key.disabled ? '已禁用' : '正常'}`);

        if (key.activated_at) {
            const expiresAt = new Date(new Date(key.activated_at).getTime() + key.days * 24 * 60 * 60 * 1000);
            const remain = Math.ceil((expiresAt - new Date()) / (24 * 60 * 60 * 1000));
            console.log(`到期时间: ${expiresAt.toLocaleDateString('zh-CN')} (${remain > 0 ? '剩余' + remain + '天' : '已过期'})`);
        }

        if (key.devices.length > 0) {
            console.log(`\n绑定设备 (${key.devices.length}/${key.max_devices}):`);
            key.devices.forEach((d, i) => {
                console.log(`  ${i + 1}. ${d.fingerprint.slice(0, 30)}...`);
                console.log(`     首次: ${d.first_seen}  最近: ${d.last_seen}`);
            });
        }
        break;
    }

    case 'disable': {
        const code = process.argv[3];
        if (!code) { console.log('用法: disable <卡密>'); break; }

        const keys = loadKeys();
        if (!keys[code]) { console.log('卡密不存在'); break; }

        keys[code].disabled = true;
        saveKeys(keys);
        console.log(`已禁用: ${code}`);
        break;
    }

    case 'enable': {
        const code = process.argv[3];
        if (!code) { console.log('用法: enable <卡密>'); break; }

        const keys = loadKeys();
        if (!keys[code]) { console.log('卡密不存在'); break; }

        keys[code].disabled = false;
        saveKeys(keys);
        console.log(`已启用: ${code}`);
        break;
    }

    default:
        console.log('Boss 自动投递 - 卡密管理工具\n');
        console.log('命令:');
        console.log('  generate [--days N] [--devices N] [--count N]  生成卡密');
        console.log('  list                                           列出所有卡密');
        console.log('  info <卡密>                                    查看详情');
        console.log('  disable <卡密>                                 禁用卡密');
        console.log('  enable <卡密>                                  启用卡密');
}
