import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { MusicHistory } from './musicHistory.entity';
import { GuildVolume } from './volume.entity';
import { ResumeState } from './resumeState.entity';
import dotenv from 'dotenv';
dotenv.config();

export const AppDataSource = new DataSource({
  type: (process.env.DB_TYPE as any) || 'mariadb',
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '3306', 10),
  username: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  synchronize: true, // 앱 실행 시 테이블 자동 생성/업데이트
  logging: false,
  entities: [MusicHistory, GuildVolume, ResumeState],
});
