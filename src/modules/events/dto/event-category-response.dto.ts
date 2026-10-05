import { EventCategory } from '../entities/event-category.entity';

export class EventCategoryResponseDto {
  category_id!: string;
  name!: string;
  slug!: string;
  description!: string | null;
  isActive!: boolean;

  static from(category: EventCategory): EventCategoryResponseDto {
    return {
      category_id: category.category_id,
      name: category.name,
      slug: category.slug,
      description: category.description,
      isActive: category.isActive,
    };
  }
}
