import { GuildVolume } from './volume.entity';
import { DataSource } from 'typeorm';
import { AppDataSource } from './data-source';

const repo = () => AppDataSource.getRepository(GuildVolume);

export async function getGuildVolume(guildId: string): Promise<number> {
    const found = await repo().findOneBy({ guildId });
    return found?.volume ?? 50;
}

export async function setGuildVolume(guildId: string, volume: number) {
    let entity = await repo().findOneBy({ guildId });
    if (!entity) {
        entity = repo().create({ guildId, volume });
    } else {
        entity.volume = volume;
    }
    await repo().save(entity);
}
