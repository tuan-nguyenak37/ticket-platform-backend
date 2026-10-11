import { Event } from '../entities/event.entity';
import { EventCategory } from '../entities/event-category.entity';
import { EventStatus } from '../entities/enums/event-status.enum';
import type { Principal } from '../../auth/authorization/principal';
import { UserRole } from '../../users/entities/enums/user-role.enum';
import { UserStatus } from '../../users/entities/enums/user-status.enum';
import { CreateEventDto } from '../dto/create-event.dto';
import { UpdateEventDto } from '../dto/update-event.dto';

export function createMockCategory(
  overrides: Partial<EventCategory> = {},
): EventCategory {
  const category = new EventCategory();
  category.category_id = 'event_cat_music';
  category.name = 'Âm nhạc';
  category.slug = 'am-nhac';
  category.description = 'Liveshow, concert và đại nhạc hội';
  category.isActive = true;
  category.createdAt = new Date('2026-01-01T00:00:00Z');
  category.updatedAt = new Date('2026-01-01T00:00:00Z');
  return Object.assign(category, overrides);
}

export const mockActiveCategory = createMockCategory();

export const mockInactiveCategory = createMockCategory({
  category_id: 'event_cat_inactive',
  name: 'Thể loại ngừng hoạt động',
  isActive: false,
});

export function createMockEvent(overrides: Partial<Event> = {}): Event {
  const event = new Event();
  event.event_id = 'evt_test_001';
  event.name = 'Đại Nhạc Hội Mùa Hè 2026';
  event.description = 'Chương trình ca nhạc quy tụ các nghệ sĩ hàng đầu';
  event.categoryId = mockActiveCategory.category_id;
  event.category = mockActiveCategory;
  event.venueName = 'Sân vận động Quân khu 7';
  event.address = '202 Hoàng Văn Thụ, TP. Hồ Chí Minh';
  event.status = EventStatus.PUBLISHED;
  event.isPinned = false;
  event.pinnedAt = null;
  event.startTime = new Date(Date.now() + 86400000 * 5); // 5 days in future
  event.endTime = new Date(Date.now() + 86400000 * 6); // 6 days in future
  event.bannerUrl = '/api/events/evt_test_001/images/banner?file=evt_banner_001.jpg';
  event.createdBy = 'usr_admin_001';
  event.createdAt = new Date('2026-02-01T00:00:00Z');
  event.updatedAt = new Date('2026-02-01T00:00:00Z');
  return Object.assign(event, overrides);
}

export const mockPublishedEvent = createMockEvent();

export const mockDraftEvent = createMockEvent({
  event_id: 'evt_draft_002',
  status: EventStatus.DRAFT,
});

export const mockCancelledEvent = createMockEvent({
  event_id: 'evt_cancelled_003',
  status: EventStatus.CANCELLED,
});

export const mockEndedEvent = createMockEvent({
  event_id: 'evt_ended_004',
  startTime: new Date(Date.now() - 86400000 * 10),
  endTime: new Date(Date.now() - 86400000 * 2),
});

export const mockPinnedEvent = createMockEvent({
  event_id: 'evt_pinned_005',
  isPinned: true,
  pinnedAt: new Date(),
});

export const mockAdminPrincipal: Principal = {
  user_id: 'usr_admin_001',
  role: UserRole.ADMIN,
  status: UserStatus.ACTIVE,
  tokenVersion: 0,
};

export const mockModPrincipal: Principal = {
  user_id: 'usr_mod_002',
  role: UserRole.MODERATOR,
  status: UserStatus.ACTIVE,
  tokenVersion: 0,
};

export const mockUserPrincipal: Principal = {
  user_id: 'usr_normal_003',
  role: UserRole.USER,
  status: UserStatus.ACTIVE,
  tokenVersion: 1,
};

export const mockBannerFile: Express.Multer.File = {
  fieldname: 'banner',
  originalname: 'banner.jpg',
  encoding: '7bit',
  mimetype: 'image/jpeg',
  buffer: Buffer.from('mock jpeg banner content'),
  size: 2048,
  stream: null as any,
  destination: '',
  filename: 'mock-banner-saved.jpg',
  path: '',
};

export const mockCreateEventDto: CreateEventDto = {
  name: 'Đại Nhạc Hội Mùa Hè 2026',
  description: 'Mô tả chi tiết',
  venueName: 'Sân vận động Quân khu 7',
  address: '202 Hoàng Văn Thụ, TP. Hồ Chí Minh',
  categoryId: 'event_cat_music',
  status: EventStatus.PUBLISHED,
  startTime: new Date(Date.now() + 86400000 * 5).toISOString(),
  endTime: new Date(Date.now() + 86400000 * 6).toISOString(),
};

export const mockUpdateEventDto: UpdateEventDto = {
  name: 'Tên Sự Kiện Đã Đổi',
  venueName: 'Địa điểm mới',
};
