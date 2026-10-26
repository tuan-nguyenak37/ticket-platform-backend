import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('event_categories')
export class EventCategory {
  @PrimaryColumn({ name: 'category_id', type: 'varchar', length: 40 })
  categoryId!: string;

  @Column({ type: 'varchar', length: 40, unique: true })
  code!: string;

  @Column({ type: 'varchar', length: 150 })
  name!: string;
}
