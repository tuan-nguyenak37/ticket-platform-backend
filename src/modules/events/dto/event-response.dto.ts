import { Event } from '../entities/event.entity';
import { EventPhase } from './list-events.dto';

export class EventResponseDto {
  static from(event: Event, now = new Date()) {
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
      isPinned: event.isPinned,
      pinnedAt: event.pinnedAt,
      phase:
        now < event.startTime
          ? EventPhase.UPCOMING
          : now < event.endTime
            ? EventPhase.ONGOING
            : EventPhase.ENDED,
      createdBy: event.createdBy,
      createdAt: event.createdAt,
      updatedAt: event.updatedAt,
    };
  }

  static public(event: Event, now = new Date()) {
    const { createdBy: _createdBy, ...response } = this.from(event, now);
    return response;
  }
}
