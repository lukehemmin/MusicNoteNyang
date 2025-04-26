import { AppDataSource } from './data-source';
import { MusicHistory } from './musicHistory.entity';
import { LessThan } from 'typeorm';

export const musicHistoryRepo = AppDataSource.getRepository(MusicHistory);

// 재생 기록 저장
export async function saveMusicHistory(data: Partial<MusicHistory>) {
  const repo = musicHistoryRepo;
  const entity = repo.create(data);
  return repo.save(entity);
}

// 마지막 재생 기록 조회 (userId, guildId, ytId 기준)
export async function getLastHistory(userId: string, guildId: string, ytId: string) {
  return musicHistoryRepo.findOne({
    where: { userId, guildId, ytId },
    order: { updatedAt: 'DESC' },
  });
}

// 재생 위치/만료시간/URL 등 업데이트
export async function updateHistorySeekAndExpire(id: number, lastSeek: number, expireTime: Date, videoUrl: string) {
  return musicHistoryRepo.update(id, { lastSeek, expireTime, videoUrl });
}

// 일정 시간마다 만료된 기록 삭제
export async function deleteExpiredHistories() {
  await musicHistoryRepo.delete({
    expireTime: LessThan(new Date())
  });
}
