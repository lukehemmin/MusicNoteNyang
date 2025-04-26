import mariadb from 'mariadb';

const pool = mariadb.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    connectionLimit: 5
});

export async function ensureMusicChannelTables() {
    const conn = await pool.getConnection();
    // 음악 채널 테이블
    await conn.query(`
        CREATE TABLE IF NOT EXISTS music_channel (
            guild_id VARCHAR(32) PRIMARY KEY,
            channel_id VARCHAR(32) NOT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    // 음악 상태 메시지 테이블
    await conn.query(`
        CREATE TABLE IF NOT EXISTS music_message (
            guild_id VARCHAR(32) PRIMARY KEY,
            message_id VARCHAR(32) NOT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    conn.release();
}
