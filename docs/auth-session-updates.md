# JWT và phiên đăng nhập

## Mô hình hiện tại

Một tài khoản có một phiên hoạt động. Access token và refresh token dùng secret riêng, thuật toán HS256; payload có user_id, email, role, fullName, tokenVersion và tokenType. Token còn có thời hạn và định danh do bộ ký tạo.

Role trong JWT không phải nguồn quyết định phân quyền. Mỗi request được bảo vệ tra lại user trong database và dùng role hiện tại. Request chỉ giữ principal gồm user_id, role, status, tokenVersion; không giữ password hash.

| Thao tác | Ảnh hưởng phiên |
| --- | --- |
| Login | Tăng tokenVersion, token của phiên cũ không còn hợp lệ |
| Refresh | Tăng tokenVersion, thay cả access token và refresh cookie |
| Logout | Tăng tokenVersion, thu hồi phiên và xóa cookie |
| Đổi mật khẩu cá nhân | Cập nhật hash và tăng tokenVersion nguyên tử; xóa cookie, yêu cầu login lại |
| Sửa họ tên cá nhân/admin | Không tăng tokenVersion, phiên tiếp tục hoạt động |
| Trạng thái khác active | Bị từ chối login, refresh và request được bảo vệ |

Việc cập nhật role/trạng thái qua API chưa được triển khai. Nếu quản trị thay role trong database, request tiếp theo dùng role mới; ADMIN không có quyền bỏ qua chính sách của route.

## Refresh cookie

- Tên: `refresh_token`.
- Thuộc tính: `HttpOnly`, `SameSite=Lax`, `Path=/api/auth`.
- `Secure=true` khi NODE_ENV là production.
- Cookie được đọc qua cookie-parser; refresh token không nằm trong response JSON.
- Logout và đổi mật khẩu xóa cookie bằng cùng path/options sau khi thao tác thành công.

**Giới hạn hiện tại:** maxAge của cookie đang cố định 7 ngày, trong khi thời hạn JWT refresh có thể cấu hình bằng JWT_REFRESH_EXPIRES. Mặc định hai giá trị cùng là 7 ngày; nếu đổi cấu hình, cần đồng bộ maxAge trong code. Backend vẫn xác thực thời hạn của JWT, không tin thời hạn lưu cookie.

Đổi mật khẩu dùng route `/api/users/me/password`; cookie path /api/auth khiến browser không gửi cookie vào route này, nhưng response vẫn có thể xóa cookie bằng đúng path đã tạo.

## Cấu hình

| Biến | Yêu cầu/mặc định |
| --- | --- |
| JWT_ACCESS_SECRET | Bắt buộc |
| JWT_REFRESH_SECRET | Bắt buộc; phải khác access secret |
| JWT_ACCESS_EXPIRES | 15m |
| JWT_REFRESH_EXPIRES | 7d |
| DB_SYNCHRONIZE | Không bắt buộc; nếu đặt sẽ ghi đè hành vi mặc định |

Thời hạn hỗ trợ số nguyên dương tính bằng giây, hoặc số nguyên kèm s/m/h/d/w. Giá trị không hợp lệ bị từ chối khi nạp cấu hình.

Database cần cột `Users.tokenVersion`, integer NOT NULL DEFAULT 0. Khi DB_SYNCHRONIZE không được đặt, synchronize mặc định bật ngoài production và tắt trong production. Với database chưa có cột và synchronize tắt, áp dụng [SQL bổ sung](./token-version.sql) trước triển khai. Không cần bảng role/permission mới cho phần phân quyền hiện tại.

## Tương thích

- Token cũ thiếu claims mà bộ xác thực hiện tại yêu cầu cần được thay bằng đăng nhập lại.
- Refresh token không được nhận qua JSON body.
- Sau refresh, bỏ access token cũ và dùng token mới; không chạy nhiều refresh song song.
- Sau đổi mật khẩu, xóa access token phía client và chuyển về đăng nhập.
- Các thay đổi API admin được mô tả tại [API Users](./users-api.md).
