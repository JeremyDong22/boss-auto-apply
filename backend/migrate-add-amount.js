// migrate-add-amount.js - 为 licenses 表添加 amount 字段
import mysql from 'mysql2/promise';

const config = {
    host: '47.108.220.1',
    port: 31414,
    user: 'root',
    password: 'Hlhnj30v2WsY1e94K8BzJUNXrwL67MD5',
    database: 'zeabur'
};

async function migrate() {
    console.log('连接到 Zeabur MySQL...');
    const connection = await mysql.createConnection(config);

    try {
        // 检查字段是否已存在
        const [columns] = await connection.query(
            "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = 'zeabur' AND TABLE_NAME = 'licenses' AND COLUMN_NAME = 'amount'"
        );

        if (columns.length > 0) {
            console.log('⚠️  amount 字段已存在，跳过迁移');
            return;
        }

        console.log('添加 amount 字段...');
        await connection.query(
            'ALTER TABLE licenses ADD COLUMN amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00 AFTER max_devices'
        );

        console.log('✅ 迁移成功！amount 字段已添加到 licenses 表');
    } catch (err) {
        console.error('❌ 迁移失败:', err.message);
        throw err;
    } finally {
        await connection.end();
    }
}

migrate().catch(err => {
    console.error('执行失败:', err);
    process.exit(1);
});
