import { AppDataSource } from './data-source';
import { ResumeState } from './resumeState.entity';

export async function saveResumeState(data: {
    guildId: string;
    voiceChannelId: string;
    textChannelId: string;
    trackUrl: string;
    title?: string;
    requestedBy?: string;
    seekTime: number;
    startedAt: Date;
}) {
    const repo = AppDataSource.getRepository(ResumeState);
    let entity = await repo.findOneBy({ guildId: data.guildId });
    if (!entity) {
        entity = repo.create(data);
    } else {
        Object.assign(entity, data);
    }
    await repo.save(entity);
}

export async function getResumeState(guildId: string): Promise<ResumeState | null> {
    const repo = AppDataSource.getRepository(ResumeState);
    return await repo.findOneBy({ guildId });
}

export async function clearResumeState(guildId: string) {
    const repo = AppDataSource.getRepository(ResumeState);
    await repo.delete({ guildId });
}
