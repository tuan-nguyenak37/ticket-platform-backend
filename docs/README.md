# Tài liệu backend

Tài liệu bên dưới mô tả snapshot backend được quản lý trong Git, thay cho các
API export, SQL thủ công và báo cáo legacy còn nằm cục bộ. Bắt đầu từ
[README](../README.md) để cấu hình và chạy dự án.

## Người dùng và quản trị

- [Xác thực JWT và refresh token](authentication.md)
- [Hồ sơ cá nhân](profile-api.md)
- [Quản trị người dùng](user-administration.md)
- [Thay đổi vai trò](user-role-changes.md)
- [Hồ sơ Organizer](organizer-profiles.md)
- [Tài khoản nhận tiền Organizer](organizer-payout-account.md)
- [Thống kê Admin](admin-statistics.md)

JWT, refresh cookie một lần và SSR được mô tả trong tài liệu xác thực.
Refresh token không dùng để xác thực API nghiệp vụ.

## Sự kiện và giao dịch

- [Sự kiện](event-management.md), [suất diễn](showing-management.md),
  [hạng vé/tồn kho](ticket-tier-management.md), [ảnh sự kiện](event-image-uploads.md)
- [Duyệt sự kiện](event-review-workflow.md), [giảm giá](event-discounts.md)
- [Giữ vé](order-reservations.md), [chốt giao dịch](order-settlement.md)
- [Xử lý bằng chứng thanh toán](payment-processing.md), [VNPay](vnpay-integration.md)
- [Phát hành vé](ticket-issuance.md), [QR/PDF/email](ticket-delivery.md)
- [Check-in theo suất diễn](ticket-check-in.md)
- [Danh sách khách và xuất CSV](event-attendees.md)
- [Bán lại](resale-v2.md), [schema tương thích](resale-storage.md),
  [chi trả người bán](automatic-payouts.md)
- [Báo cáo bán vé Organizer](organizer-sales-reports.md)
- [Thông báo trong web](web-notifications.md)

## Phát triển và vận hành

- [Danh mục sự kiện phát triển](category-catalog.md)
- [Hướng dẫn đóng góp](../CONTRIBUTING.md)
- [Quy trình Git và thiết lập GitHub](git-workflow.md)
- [Chính sách bảo mật](../SECURITY.md)
- [Checklist phát hành](release-checklist.md)
- [Phạm vi mã nguồn và artifact bị loại](source-scope.md)
- [Trạng thái kiểm chứng](verification-status.md)
- [Rà soát và đồng bộ mã local](local-reconciliation.md)

`payment-foundation.md` ghi lại bước nền tảng trước tích hợp nhà cung cấp, không
phải kết luận snapshot cuối chưa có VNPay. Báo cáo kiểm thử lịch sử không chứng
minh mã hiện tại đã nghiệm thu. Không chạy SQL/script legacy để thiết lập schema.
