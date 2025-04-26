import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity({ name: 'music_history' })
export class MusicHistory {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', length: 64 })
  userId!: string;

  @Column({ type: 'varchar', length: 64 })
  guildId!: string;

  @Column({ type: 'text' })
  videoUrl!: string;

  @Column({ type: 'varchar', length: 32 })
  ytId!: string;

  @Column({ type: 'datetime' })
  startTime!: Date;

  @Column({ type: 'datetime', nullable: true })
  endTime?: Date;

  @Column({ type: 'datetime' })
  expireTime!: Date;

  @Column({ type: 'int' })
  duration!: number; // 영상 길이(초)

  @Column({ type: 'int', default: 0 })
  lastSeek!: number; // 마지막 재생 위치(초)

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
