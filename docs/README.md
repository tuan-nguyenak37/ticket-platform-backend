# Tài liệu backend

Tài liệu đối chiếu mã nguồn ngày 07/10/2026. Backend phục vụ sàn nhượng lại vé sự
kiện, dùng NestJS, TypeORM và PostgreSQL; ảnh/PDF lưu local. Người dùng có thể
vừa mua vừa bán theo thiết kế sản phẩm; hiện API tập trung vào tài khoản, sự kiện,
đăng bán, kiểm duyệt vé và Orders. Đã có API đơn hàng, thanh toán giả lập,
bàn giao file và tranh chấp; chưa tích hợp VNPay hoặc giao dịch tiền thật.

Luồng đăng bán: đăng vé → pending_review và job queued → worker đọc OCR/QR →
duyệt thành available hoặc từ chối thành rejected. Chỉ vé available của sự kiện
published chưa kết thúc xuất hiện công khai. Tự duyệt mặc định tắt.

| Tài liệu | Nội dung |
| --- | --- |
| [Tổng hợp API theo Module](./api-reference.md) | Tra cứu nhanh toàn bộ API theo module, role, tham số, response và ràng buộc |
| [API xác thực](./auth-api.md) | Đăng ký, đăng nhập, refresh, logout và định dạng response |
| [JWT và phiên đăng nhập](./auth-session-updates.md) | Cookie, thu hồi token, cấu hình và yêu cầu database |
| [API người dùng](./users-api.md) | Hồ sơ cá nhân, đổi mật khẩu và API quản trị |
| [API vé](./tickets-api.md) | Đăng vé, danh sách public, vé tôi đăng, lọc/tìm kiếm/phân trang và hủy đăng bán |
| [Orders và thanh toán](./orders-api.md) | Không giữ vé, chốt giao dịch, thanh toán giả lập, nhận vé, tranh chấp và đối soát |
| [SQL Orders](./orders-schema.sql) | Ba bảng và ràng buộc chốt vé khi synchronize tắt |
| [Collection Orders](./postman/orders.postman_collection.json) | Luồng mua, thanh toán giả lập, tranh chấp, hoàn tiền và chi trả |
| [Kiểm tra/duyệt vé](./ticket-review-automation.md) | OCR local, QR/barcode, chống trùng, tự duyệt và duyệt thủ công |
| [SQL kiểm tra vé](./ticket-review-automation.sql) | Schema/index cho môi trường tắt synchronize |
| [API sự kiện](./events-api.md) | Đủ 11 endpoint: đường dẫn, tham số, kiểu dữ liệu và ví dụ response thành công chi tiết |
| [API thể loại sự kiện](./event-categories-api.md) | Danh sách category đang hoạt động, public cho trang chủ, tìm kiếm và form sự kiện |
| [SQL chỉ dùng banner](./event-banner-only.sql) | Bỏ cột ảnh đại diện và mô tả ngắn cũ khi synchronize tắt |
| [SQL ghim sự kiện](./event-pinning.sql) | Thêm isPinned, pinnedAt và index khi synchronize tắt |
| [Upload local](./uploads.md) | Cấu hình upload dùng chung |
| [CRUD sự kiện](./events-crud.md) | Tra cứu đầu vào/đầu ra, vòng đời và phạm vi quyền |
| [Collection CRUD](./postman/events-crud.postman_collection.json) | Các request hợp lệ: category public, CRUD sự kiện, refresh và hồ sơ |
| [Phân quyền](./authorization.md) | Chính sách route, quyền sở hữu, audit và ma trận nghiệp vụ tương lai |
| [Trạng thái kiểm chứng](./verification-status.md) | Kết quả đã có và các bước chưa thực hiện |
| [SQL tokenVersion](./token-version.sql) | Bổ sung cột phiên đăng nhập khi database chưa có |
| [Collection Auth](./postman/login.postman_collection.json) | Login, refresh bằng cookie, hồ sơ hiện tại và logout |
| [Collection Tickets](./postman/tickets.postman_collection.json) | Đăng, tìm kiếm, hủy, kiểm duyệt và xem vé tôi đăng |
| [Postman local](./postman/local-setup.md) | Cấu hình environment và cách dùng các collection |
| [Hướng dẫn kiểm thử từng Module](./module-testing-guide.md) | Tài liệu hướng dẫn chi tiết cách chạy Unit, E2E và Postman cho từng module |
| [Báo cáo kết quả kiểm thử hệ thống](./software-test-report.md) | Báo cáo lịch sử và cập nhật kiểm chứng 11/10: 217 test đạt, 14 test bỏ qua; còn lỗi TypeScript trong test |
| [Đặc tả kiểm thử Auth](./test-cases/auth-module-test-specification.md) | Kịch bản kiểm thử đăng ký, đăng nhập, cookie và phân quyền |
| [Đặc tả kiểm thử Users](./test-cases/user-module-test-specification.md) | Kịch bản và dữ liệu kiểm thử tài khoản |
| [Đặc tả kiểm thử Events](./test-cases/events-module-test-specification.md) | Kịch bản quản lý sự kiện và ghim |
| [Đặc tả kiểm thử Tickets](./test-cases/tickets-module-test-specification.md) | Kịch bản đăng, xem và hủy vé |
| [Đặc tả kiểm thử Orders](./test-cases/orders-module-test-specification.md) | Kịch bản tạo đơn, idempotency, thanh toán và tranh chấp |

## Thông tin chung

- Prefix API: `/api`; chưa có prefix phiên bản `/v1`.
- Cổng lấy từ `PORT`, mặc định 3000. Ví dụ trong tài liệu dùng `http://localhost:7000/api` theo cấu hình local đã sử dụng.
- Request JSON dùng `Content-Type: application/json`.
- Endpoint bảo vệ dùng `Authorization: Bearer <accessToken>`.
- Refresh dùng cookie `refresh_token`; không truyền refresh token trong JSON.
- Server tạo request ID và trả header `X-Request-Id`.

## Thay đổi ảnh hưởng client

- Dùng `GET/PATCH /api/users/me` cho hồ sơ cá nhân.
- `PATCH /api/users/:id` chỉ cho ADMIN sửa `fullName`; không còn nhận email hoặc password.
- `DELETE /api/users/:id` đã bỏ.
- Đổi mật khẩu qua `PATCH /api/users/me/password`, sau đó đăng nhập lại.
- MODERATOR chưa có quyền quản lý người khác.
- Module vé đã có đăng vé, danh sách công khai, vé tôi đăng, hủy đăng bán và API kiểm duyệt cho ADMIN/MODERATOR. Không tự duyệt vé mình đăng.
- `/api/tickets/me` là vé đã đăng bán. Xem đơn mua qua `/api/orders/me?side=buyer`;
  nhận file vé đã mua qua `/api/orders/me/:id/file`.
- Tạo đơn không giữ vé; thanh toán được backend chốt trước nhận vé, khoản thành
  công đến sau chuyển refund_pending. Mock chỉ bật rõ ràng ở development/test.
- Đặc tả test và collection không chứng minh đã chạy thành công; xem trạng thái kiểm chứng theo từng mốc thời gian.
