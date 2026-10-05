# Tài liệu backend

Tài liệu cập nhật theo mã nguồn Auth/Users ngày 30/09/2026.

| Tài liệu | Nội dung |
| --- | --- |
| [Tổng hợp API theo Module](./api-reference.md) | Tra cứu nhanh toàn bộ API theo module, role, tham số, response và ràng buộc |
| [API xác thực](./auth-api.md) | Đăng ký, đăng nhập, refresh, logout và định dạng response |
| [JWT và phiên đăng nhập](./auth-session-updates.md) | Cookie, thu hồi token, cấu hình và yêu cầu database |
| [API người dùng](./users-api.md) | Hồ sơ cá nhân, đổi mật khẩu và API quản trị |
| [API sự kiện](./events-api.md) | Đủ 11 endpoint: đường dẫn, tham số, kiểu dữ liệu và ví dụ response thành công chi tiết |
| [API thể loại sự kiện](./event-categories-api.md) | Danh sách category đang hoạt động, public cho trang chủ, tìm kiếm và form sự kiện |
| [SQL ghim sự kiện](./event-pinning.sql) | Thêm isPinned, pinnedAt và index khi synchronize tắt |
| [Upload local](./uploads.md) | Cấu hình upload dùng chung |
| [CRUD sự kiện](./events-crud.md) | Tra cứu đầu vào/đầu ra, vòng đời và phạm vi quyền |
| [Collection CRUD](./postman/events-crud.postman_collection.json) | Các request hợp lệ: category public, CRUD sự kiện, refresh và hồ sơ |
| [Phân quyền](./authorization.md) | Chính sách route, quyền sở hữu, audit và ma trận nghiệp vụ tương lai |
| [Trạng thái kiểm chứng](./verification-status.md) | Kết quả đã có và các bước chưa thực hiện |
| [SQL tokenVersion](./token-version.sql) | Bổ sung cột phiên đăng nhập khi database chưa có |
| [Collection Auth](./postman/login.postman_collection.json) | Login, refresh bằng cookie, hồ sơ hiện tại và logout |

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
- Tài liệu nghiệp vụ vé/đơn hàng là thiết kế tương lai, không phải danh sách endpoint đã triển khai.
