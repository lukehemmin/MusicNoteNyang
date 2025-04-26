import { AppDataSource } from './data-source';

export async function initDb() {
  if (!AppDataSource.isInitialized) {
    await AppDataSource.initialize();
    console.log('MariaDB 연결 및 테이블 자동 생성 완료!');
  }
}
