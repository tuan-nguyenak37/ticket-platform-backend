import { DataSource } from 'typeorm';
import { EventCategory } from '../../modules/events/entities/event-category.entity';

export interface EventCategorySeedItem {
  category_id?: string;
  name: string;
  slug: string;
  description: string;
  isActive: boolean;
}

export const EVENT_CATEGORIES_SEED: EventCategorySeedItem[] = [
  {
    category_id: 'event_cat_music',
    name: 'Âm nhạc',
    slug: 'am-nhac',
    description: 'Liveshow, concert, đêm nhạc và các sự kiện âm nhạc',
    isActive: true,
  },
  {
    category_id: 'event_cat_sports',
    name: 'Thể thao',
    slug: 'the-thao',
    description: 'Các giải đấu, trận đấu thể thao, marathon và hoạt động thể chất',
    isActive: true,
  },
  {
    category_id: 'event_cat_workshop',
    name: 'Workshop / Hội thảo',
    slug: 'workshop-hoi-thao',
    description: 'Các buổi workshop, hội thảo chia sẻ kiến thức, kỹ năng',
    isActive: true,
  },
  {
    category_id: 'event_cat_theater',
    name: 'Sân khấu',
    slug: 'san-khau',
    description: 'Kịch nói, nhạc kịch, cải lương, xiếc và các buổi biểu diễn sân khấu',
    isActive: true,
  },
  {
    category_id: 'event_cat_festival',
    name: 'Festival',
    slug: 'festival',
    description: 'Lễ hội văn hóa, lễ hội ẩm thực, hội chợ và festival',
    isActive: true,
  },
  {
    category_id: 'event_cat_entertainment',
    name: 'Giải trí',
    slug: 'giai-tri',
    description: 'Các sự kiện vui chơi giải trí, fan meeting và triển lãm trải nghiệm',
    isActive: true,
  },
  {
    category_id: 'event_cat_other',
    name: 'Khác',
    slug: 'khac',
    description: 'Các sự kiện thuộc thể loại khác',
    isActive: true,
  },
];

export async function seedEventCategories(dataSource: DataSource): Promise<void> {
  const repo = dataSource.getRepository(EventCategory);

  for (const item of EVENT_CATEGORIES_SEED) {
    const existing = await repo.findOne({ where: { slug: item.slug } });
    if (!existing) {
      const category = repo.create(item);
      await repo.save(category);
    }
  }
}
