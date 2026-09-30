# Tài liệu backend

Tài liệu cập nhật theo mã nguồn Auth/Users ngày 30/09/2026.

| Tài liệu | Nội dung |
| --- | --- |
| [API xác thực](./auth-api.md) | Đăng ký, đăng nhập, refresh, logout và định dạng response |
| [JWT và phiên đăng nhập](./auth-session-updates.md) | Cookie, thu hồi token, cấu hình và yêu cầu database |
| [API người dùng](./users-api.md) | Hồ sơ cá nhân, đổi mật khẩu và API quản trị |
| [Phân quyền](./authorization.md) | Chính sách route, quyền sở hữu, audit và ma trận nghiệp vụ tương lai |
| [Trạng thái kiểm chứng](./verification-status.md) | Kết quả đã có và các bước chưa thực hiện |
| [SQL tokenVersion](./token-version.sql) | Bổ sung cột phiên đăng nhập khi database chưa có |
| [Collection login](./postman/login.postman_collection.json) | Collection login/cookie đã có; chưa bao phủ phân quyền mới |

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
