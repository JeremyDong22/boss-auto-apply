// init-db.js - 远程初始化 Zeabur MySQL 数据库
import mysql from 'mysql2/promise';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const config = {
    host: '47.108.220.1',
    port: 31414,
    user: 'root',
    password: 'Hlhnj30v2WsY1e94K8BzJUNXrwL67MD5',
    database: 'zeabur',
    multipleStatements: true
};

async function initDatabase() {
    console.log('连接到 Zeabur MySQL...');
    const connection = await mysql.createConnection(config);

    console.log('读取 schema-mysql.sql...');
    const sql = readFileSync(join(__dirname, 'schema-mysql.sql'), 'utf8');

    console.log('执行 SQL...');
    await connection.query(sql);

    console.log('✅ 数据库初始化成功！');
    await connection.end();
}

initDatabase().catch(err => {
    console.error('❌ 初始化失败:', err.message);
    process.exit(1);
});
