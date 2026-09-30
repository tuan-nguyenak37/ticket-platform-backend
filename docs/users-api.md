# API người dùng

Prefix: `/api/users`. Các endpoint dưới đây đều yêu cầu Bearer access token hợp lệ và tài khoản active. Kết quả nằm trong `data` của response chuẩn.

## Ma trận API hiện tại

| Method | Path | USER | MODERATOR | ADMIN | Thành công |
| --- | --- | --- | --- | --- | --- |
| GET | /me | Chính mình | Chính mình | Chính mình | 200 |
| PATCH | /me | Chính mình | Chính mình | Chính mình | 200 |
| PATCH | /me/password | Chính mình | Chính mình | Chính mình | 200 |
| GET | / | Không | Không | Được | 200 |
| GET | /:id | Không | Không | Được | 200 |
| POST | / | Không | Không | Được | 201 |
| PATCH | /:id | Không | Không | Được | 200 |

Các path /me được khai báo trước /:id. ID user là chuỗi, không chuyển sang số. Người dùng thường phải dùng /me ngay cả khi muốn xem user_id của chính mình; /:id là API quản trị.

## Hồ sơ cá nhân

### GET /api/users/me

ID lấy từ principal đã xác thực, không nhận userId trong request body. Trả UserResponseDto của người gọi. Tài nguyên không còn nằm trong phạm vi truy vấn trả 404.

### PATCH /api/users/me

```json
{
  "fullName": "  Nguyễn Văn A  "
}
```

- fullName bắt buộc, kiểu string, trim trước khi kiểm tra; dài 1–100 ký tự.
- Chuỗi rỗng/chỉ khoảng trắng, null, số hoặc trường bị thiếu đều không hợp lệ.
- Không nhận email, password, userId/user_id, role, status, trường xác minh hoặc điểm uy tín.
- Thành công trả hồ sơ cập nhật, giữ phiên đăng nhập hiện tại.
- Truy vấn cập nhật ràng buộc user_id của người gọi, trạng thái active và tokenVersion hiện tại.
- 400 nếu body không hợp lệ; 409 nếu điều kiện cập nhật không còn khớp do tài khoản/phiên thay đổi.

### PATCH /api/users/me/password

```json
{
  "currentPassword": "OldPassword123",
  "newPassword": "NewPassword456"
}
```

currentPassword là chuỗi không rỗng. newPassword dài 6–32 ký tự, khác mật khẩu hiện tại; không trim password.

Server đối chiếu mật khẩu hiện tại với bcrypt, sau đó cập nhật hash và tăng tokenVersion trong cùng một lệnh có điều kiện theo user_id, trạng thái, phiên và hash cũ. Hai thao tác dùng cùng dữ liệu cũ không thể ghi đè nhau.

Thành công:

```json
{
  "message": "Đổi mật khẩu thành công, hãy đăng nhập lại"
}
```

Thông báo nằm trong data. Response xóa refresh cookie; access/refresh token cũ không còn hợp lệ. Endpoint không trả token mới.

- 400: mật khẩu hiện tại sai, mật khẩu mới giống mật khẩu cũ hoặc body không hợp lệ.
- 401: token không hợp lệ hoặc phiên không còn hợp lệ ở bước guard.
- 409: tài khoản thay đổi trong lúc xử lý; không ghi đè dữ liệu mới.
- Thao tác thất bại không cập nhật password và không chủ động xóa cookie.

## Quản trị người dùng

Tất cả các thao tác quản trị đều kiểm tra ADMIN ở guard và tại service.

### GET /api/users

Trả mảng tối đa 100 user có status khác deleted. Sắp xếp createdAt giảm dần, sau đó user_id tăng dần. Hiện chưa có query phân trang hoặc tổng số bản ghi. Tài khoản suspended/banned vẫn có thể xuất hiện trong danh sách admin.

### GET /api/users/:id

Trả UserResponseDto. User không tồn tại hoặc có status deleted trả 404.

### POST /api/users

Dùng cùng dữ liệu đăng ký: email, password, fullName tùy chọn. Password được băm; role luôn USER. Không tạo ADMIN/MODERATOR qua endpoint này.

Thành công trả user mới với mã 201. Body sai trả 400; email trùng trả 409.

### PATCH /api/users/:id

Chỉ nhận `{ "fullName": "Tên mới" }`, cùng validation với cập nhật hồ sơ cá nhân. Thành công trả user cập nhật, không thu hồi token của user đó. Target không tồn tại/deleted trả 404.

**Thay đổi so với API trước:** không còn đổi email hoặc đặt password của người khác. Gửi các trường đó trả 400, kể cả ADMIN.

### Endpoint đã bỏ

`DELETE /api/users/:id` không còn được đăng ký. Chưa có API xóa tài khoản, đổi role, khóa/mở khóa hoặc reset mật khẩu của người khác.

## Dữ liệu user trả về

UserResponseDto chỉ cho phép các trường:

| Nhóm | Trường |
| --- | --- |
| Định danh và hồ sơ | user_id, email, phone, fullName, avatarUrl |
| Vai trò và trạng thái | role, status |
| Xác minh | emailVerified, phoneVerified, identityVerified |
| Thống kê | reputationScore, successfulSales, successfulBuys, disputeCount |
| Thời gian | lastLoginAt, createdAt, updatedAt |

phone, fullName, avatarUrl và lastLoginAt có thể là null. Không trả password, password hash, tokenVersion hoặc trường entity mới chưa được đưa vào danh sách cho phép.

Đây là DTO cho chủ tài khoản hoặc API quản trị, **không phải DTO công khai của người bán**. Module tin đăng tương lai cần DTO riêng để không lộ email/phone và dữ liệu nội bộ.
