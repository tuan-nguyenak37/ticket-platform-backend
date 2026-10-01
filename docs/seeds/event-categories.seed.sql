-- Seed dữ liệu mẫu cho bảng event_categories
-- Đảm bảo an toàn khi chạy lại nhiều lần (ON CONFLICT trên cột slug)

INSERT INTO event_categories (category_id, name, slug, description, "isActive", "createdAt", "updatedAt")
VALUES
  ('event_cat_music', 'Âm nhạc', 'am-nhac', 'Liveshow, concert, đêm nhạc và các sự kiện âm nhạc', true, NOW(), NOW()),
  ('event_cat_sports', 'Thể thao', 'the-thao', 'Các giải đấu, trận đấu thể thao, marathon và hoạt động thể chất', true, NOW(), NOW()),
  ('event_cat_workshop', 'Workshop / Hội thảo', 'workshop-hoi-thao', 'Các buổi workshop, hội thảo chia sẻ kiến thức, kỹ năng', true, NOW(), NOW()),
  ('event_cat_theater', 'Sân khấu', 'san-khau', 'Kịch nói, nhạc kịch, cải lương, xiếc và các buổi biểu diễn sân khấu', true, NOW(), NOW()),
  ('event_cat_festival', 'Festival', 'festival', 'Lễ hội văn hóa, lễ hội ẩm thực, hội chợ và festival', true, NOW(), NOW()),
  ('event_cat_entertainment', 'Giải trí', 'giai-tri', 'Các sự kiện vui chơi giải trí, fan meeting và triển lãm trải nghiệm', true, NOW(), NOW()),
  ('event_cat_other', 'Khác', 'khac', 'Các sự kiện thuộc thể loại khác', true, NOW(), NOW())
ON CONFLICT (slug) DO UPDATE
SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  "isActive" = EXCLUDED."isActive",
  "updatedAt" = NOW();
