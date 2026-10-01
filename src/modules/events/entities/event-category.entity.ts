import {
  BeforeInsert,
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { generateId } from '../../../common/utils/generateId';
import { Event } from './event.entity';

@Entity('event_categories')
export class EventCategory {
  @PrimaryColumn({
    type: 'varchar',
    length: 40,
  })
  category_id!: string;

  @Column({
    type: 'varchar',
    length: 100,
    unique: true,
  })
  name!: string;

  @Column({
    type: 'varchar',
    length: 100,
    unique: true,
  })
  slug!: string;

  @Column({
    type: 'text',
    nullable: true,
  })
  description!: string | null;

  @Column({
    type: 'boolean',
    default: true,
  })
  isActive!: boolean;

  @CreateDateColumn({
    type: 'timestamptz',
  })
  createdAt!: Date;

  @UpdateDateColumn({
    type: 'timestamptz',
  })
  updatedAt!: Date;

  @OneToMany(() => Event, (event) => event.category)
  events!: Event[];

  @BeforeInsert()
  generateCategoryId() {
    if (!this.category_id) {
      this.category_id = generateId('event_cat_');
    }
  }
}
