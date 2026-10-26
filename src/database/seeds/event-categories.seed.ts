import { DataSource } from 'typeorm';

export const EVENT_CATEGORIES_SEED = [
  { categoryId: 'event_cat_live_music', code: 'LIVE_MUSIC', name: 'Nhạc sống' },
  {
    categoryId: 'event_cat_performing_arts',
    code: 'PERFORMING_ARTS',
    name: 'Sân khấu & Nghệ thuật',
  },
  { categoryId: 'event_cat_sports', code: 'SPORTS', name: 'Thể thao' },
  {
    categoryId: 'event_cat_workshops',
    code: 'WORKSHOPS',
    name: 'Hội thảo & Workshop',
  },
  {
    categoryId: 'event_cat_experiences',
    code: 'EXPERIENCES',
    name: 'Tham quan & Trải nghiệm',
  },
  { categoryId: 'event_cat_other', code: 'OTHER', name: 'Khác' },
] as const;

export async function seedEventCategories(
  dataSource: DataSource,
): Promise<void> {
  await dataSource.transaction(async (manager) => {
    for (const category of EVENT_CATEGORIES_SEED) {
      await manager.query(
        'INSERT INTO event_categories(category_id, code, name) VALUES($1,$2,$3) ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name',
        [category.categoryId, category.code, category.name],
      );
    }
  });
}
