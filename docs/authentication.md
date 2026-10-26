# Xác thực JWT cho web

## Endpoint

| Phương thức | Route | Chức năng |
| --- | --- | --- |
| POST | `/api/auth/register` | Đăng ký người dùng thường |
| POST | `/api/auth/browser/login` | Trả hồ sơ/access token, đặt refresh cookie |
| POST | `/api/auth/browser/refresh` | Xoay refresh, cấp access mới |
| POST | `/api/auth/browser/logout` | Thu hồi phiên dù access hết hạn |
| GET | `/api/auth/browser/session` | Hồ sơ tối thiểu cho SSR, không xoay token |
| GET/PATCH | `/api/users/me` | Đọc/cập nhật hồ sơ chính mình |
| PATCH | `/api/users/me/password` | Đổi mật khẩu và thu hồi phiên |

## Lưu trữ và thời hạn

Access JWT gửi qua `Authorization: Bearer`; frontend giữ trong bộ nhớ, không
persist. Refresh JWT chỉ nằm trong cookie `ticketverse_refresh`, HttpOnly,
SameSite=Lax, Path=/, Secure ở production; không trả qua JSON hoặc HTML.
Các route thay đổi cookie kiểm tra `Origin` theo `FRONTEND_URL`; phản hồi
xác thực đặt `Cache-Control: no-store`.

Access mặc định `15m`; deadline phiên theo `JWT_REFRESH_EXPIRES`, mặc định `7d`
tính từ đăng nhập. Xoay refresh không kéo dài deadline ban đầu. Redis lưu hash
refresh, không lưu token nguyên bản; Lua so sánh và thay hash nguyên tử để
mỗi token chỉ cấp token mới thành công một lần.

## Lỗi và quyền truy cập

- Access hết hạn trả `401 AUTH_ACCESS_EXPIRED` trước khi chạy nghiệp vụ.
- Refresh đã xoay trả `409 AUTH_REFRESH_CONFLICT` nếu phiên còn tồn tại;
  không cấp token mới và không đặt/xóa cookie.
- Token sai, hết hạn hoặc phiên bị thu hồi trả 401.
- Redis lỗi trả 503, không được coi là phiên hợp lệ hoặc tự động đăng xuất.

Guard kiểm tra quyền, trạng thái tài khoản và phiên Redis hiện hành, không chỉ
tin claims. Refresh cookie không thể xác thực API nghiệp vụ. Endpoint SSR chỉ
đọc hồ sơ sau khi xác minh refresh và hash hiện hành, không xoay/cấp access.

## Tương thích

Các route `/api/auth/login`, `/api/auth/refresh`, `/api/auth/logout` được giữ
cho client cũ. Web dùng `/browser/*` để logout được khi access hết hạn.
Phiên opaque trước đây cần đăng nhập lại một lần.

Xem [hồ sơ cá nhân](profile-api.md), [chính sách bảo mật](../SECURITY.md) và
[checklist nghiệm thu phiên](release-checklist.md).
