-- Seed dữ liệu mẫu cho bảng "events" phục vụ kiểm thử hệ thống
-- Yêu cầu bảng event_categories và users (mock-users.seed.sql) đã được nạp trước

INSERT INTO events (
  "event_id",
  "name",
  "description",
  "bannerUrl",
  "startTime",
  "endTime",
  "venueName",
  "address",
  "category_id",
  "status",
  "isPinned",
  "pinnedAt",
  "createdBy",
  "createdAt",
  "updatedAt"
)
VALUES
  (
    'evt_mock_001',
    'Concert Âm Nhạc Mùa Hè 2026',
    'Đại nhạc hội quy tụ các ca sĩ hàng đầu với hệ thống âm thanh ánh sáng hiện đại.',
    '/api/events/evt_mock_001/images/banner?file=evt_mock_001_banner.jpg',
    NOW() + INTERVAL '10 days',
    NOW() + INTERVAL '11 days',
    'Sân vận động Quốc gia Mỹ Đình',
    'Đường Lê Đức Thọ, Mỹ Đình, Nam Từ Liêm, Hà Nội',
    'event_cat_music',
    'published',
    true,
    NOW() - INTERVAL '1 days',
    'usr_mock_admin_001',
    NOW() - INTERVAL '5 days',
    NOW() - INTERVAL '1 days'
  ),
  (
    'evt_draft_002',
    'Triển Lãm Nghệ Thuật Đương Đại 2026',
    'Triển lãm mỹ thuật của các họa sĩ trẻ toàn quốc.',
    '/api/events/evt_draft_002/images/banner?file=evt_draft_002_banner.jpg',
    NOW() + INTERVAL '20 days',
    NOW() + INTERVAL '25 days',
    'Bảo tàng Mỹ thuật TP. Hồ Chí Minh',
    '97A Phó Đức Chính, Phường Nguyễn Thái Bình, Quận 1, TP. HCM',
    'event_cat_entertainment',
    'draft',
    false,
    NULL,
    'usr_mock_admin_001',
    NOW() - INTERVAL '2 days',
    NOW() - INTERVAL '2 days'
  ),
  (
    'evt_ended_003',
    'Chung Kết Giải Đua Xe Thể Thao Mùa Xuân',
    'Giải đua đã khép lại thành công tốt đẹp.',
    '/api/events/evt_ended_003/images/banner?file=evt_ended_003_banner.jpg',
    NOW() - INTERVAL '5 days',
    NOW() - INTERVAL '4 days',
    'Trường đua Đại Nam',
    'Hiệp An, Thủ Dầu Một, Bình Dương',
    'event_cat_sports',
    'published',
    false,
    NULL,
    'usr_mock_admin_001',
    NOW() - INTERVAL '20 days',
    NOW() - INTERVAL '4 days'
  )
ON CONFLICT ("event_id") DO NOTHING;
