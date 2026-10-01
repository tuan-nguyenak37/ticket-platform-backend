import { Event } from '../entities/event.entity';

export class EventResponseDto {
  static from(event: Event) {
    return {
      event_id: event.event_id,
      name: event.name,
      shortDescription: event.shortDescription,
      description: event.description,
      thumbnailUrl: event.thumbnailUrl,
      bannerUrl: event.bannerUrl,
      startTime: event.startTime,
      endTime: event.endTime,
      venueName: event.venueName,
      address: event.address,
      categoryId: event.categoryId,
      status: event.status,
      createdBy: event.createdBy,
      createdAt: event.createdAt,
      updatedAt: event.updatedAt,
    };
  }
}
