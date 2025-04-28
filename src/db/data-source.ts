import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { MusicHistory } from './musicHistory.entity';
import { GuildVolume } from './volume.entity';
import { ResumeState } from './resumeState.entity';
import dotenv from 'dotenv';
dotenv.config();

// DB 타입별 분기(타입 단언 X, 각 DB 옵션에 맞게 type 지정)
const dbType = (process.env.DB_TYPE as string) || 'mariadb';

let dataSource;
if (dbType === 'mariadb' || dbType === 'mysql') {
  dataSource = new DataSource({
    type: dbType,
    host: process.env.DB_HOST!,
    port: Number(process.env.DB_PORT),
    username: process.env.DB_USER!,
    password: process.env.DB_PASSWORD!,
    database: process.env.DB_DATABASE!,
    synchronize: true,
    logging: false,
    entities: [MusicHistory, GuildVolume, ResumeState],
  });
} else if (dbType === 'postgres') {
  dataSource = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST!,
    port: Number(process.env.DB_PORT),
    username: process.env.DB_USER!,
    password: process.env.DB_PASSWORD!,
    database: process.env.DB_DATABASE!,
    synchronize: true,
    logging: false,
    entities: [MusicHistory, GuildVolume, ResumeState],
  });
} else if (dbType === 'sqlite') {
  dataSource = new DataSource({
    type: 'sqlite',
    database: process.env.DB_DATABASE!,
    synchronize: true,
    logging: false,
    entities: [MusicHistory, GuildVolume, ResumeState],
  });
} else if (dbType === 'mssql') {
  dataSource = new DataSource({
    type: 'mssql',
    host: process.env.DB_HOST!,
    port: Number(process.env.DB_PORT),
    username: process.env.DB_USER!,
    password: process.env.DB_PASSWORD!,
    database: process.env.DB_DATABASE!,
    synchronize: true,
    logging: false,
    entities: [MusicHistory, GuildVolume, ResumeState],
  });
} else {
  throw new Error(`[DB] 지원하지 않는 DB 타입: ${dbType}`);
}

export const AppDataSource = dataSource;
