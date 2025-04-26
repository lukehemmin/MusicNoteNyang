import mariadb from 'mariadb';

const pool = mariadb.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    connectionLimit: 5
});

export async function setMusicChannel(guildId: string, channelId: string) {
    const conn = await pool.getConnection();
    await conn.query(
        'REPLACE INTO music_channel (guild_id, channel_id) VALUES (?, ?)',
        [guildId, channelId]
    );
    conn.release();
}

export async function getMusicChannel(guildId: string): Promise<string | null> {
    const conn = await pool.getConnection();
    const rows = await conn.query(
        'SELECT channel_id FROM music_channel WHERE guild_id = ?',
        [guildId]
    );
    conn.release();
    return rows[0]?.channel_id || null;
}

export async function setMusicMessage(guildId: string, messageId: string) {
    const conn = await pool.getConnection();
    await conn.query(
        'REPLACE INTO music_message (guild_id, message_id) VALUES (?, ?)',
        [guildId, messageId]
    );
    conn.release();
}

export async function getMusicMessage(guildId: string): Promise<string | null> {
    const conn = await pool.getConnection();
    const rows = await conn.query(
        'SELECT message_id FROM music_message WHERE guild_id = ?',
        [guildId]
    );
    conn.release();
    return rows[0]?.message_id || null;
}
