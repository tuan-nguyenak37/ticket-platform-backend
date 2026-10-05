import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventCategoryResponseDto } from './dto/event-category-response.dto';
import { EventCategory } from './entities/event-category.entity';

@Injectable()
export class EventCategoriesService {
  constructor(
    @InjectRepository(EventCategory)
    private readonly categoryRepository: Repository<EventCategory>,
  ) {}

  async list(): Promise<EventCategoryResponseDto[]> {
    const categories = await this.categoryRepository.find({
      where: { isActive: true },
      select: {
        category_id: true,
        name: true,
        slug: true,
        description: true,
        isActive: true,
      },
      order: { name: 'ASC', category_id: 'ASC' },
    });

    return categories.map((category) => EventCategoryResponseDto.from(category));
  }
}
