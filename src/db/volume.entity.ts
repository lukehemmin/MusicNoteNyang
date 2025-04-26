import { Entity, PrimaryColumn, Column } from 'typeorm';

@Entity('guild_volume')
export class GuildVolume {
    @PrimaryColumn()
    guildId!: string;

    @Column({ type: 'int', default: 50 })
    volume!: number;
}
