import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('resume_state')
export class ResumeState {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column()
    guildId!: string;

    @Column()
    voiceChannelId!: string;

    @Column()
    textChannelId!: string;

    @Column()
    trackUrl!: string;

    @Column({ nullable: true })
    title?: string;

    @Column({ nullable: true })
    requestedBy?: string;

    @Column({ type: 'int', default: 0 })
    seekTime!: number; // 초 단위

    @Column({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
    startedAt!: Date;

    @Column({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' })
    updatedAt!: Date;
}
