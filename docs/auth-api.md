# API xác thực

Base URL ví dụ: `http://localhost:7000/api`. Xem [phiên đăng nhập](./auth-session-updates.md) và [phân quyền](./authorization.md) để biết cách kiểm tra token/quyền.

## Định dạng phản hồi

Thành công: kết quả endpoint nằm trong `data`.

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Request successful",
  "data": {},
  "timestamp": "2026-09-30T00:00:00.000Z"
}
```

Lỗi: `message` có thể là chuỗi hoặc mảng thông báo validation; không có `data`.

```json
{
  "success": false,
  "statusCode": 400,
  "message": ["email must be an email"],
  "path": "/api/auth/login",
  "timestamp": "2026-09-30T00:00:00.000Z"
}
```

Các timestamp và giá trị mẫu chỉ mang tính minh họa. Header `X-Request-Id` dùng để đối chiếu nhật ký, không phải một trường trong JSON.

## Endpoint

| Method | Path | Chính sách | Thành công |
| --- | --- | --- | --- |
| POST | /auth/register | Public | 201, thông tin user |
| POST | /auth/login | Public | 200, accessToken và user; refresh cookie |
| POST | /auth/refresh | Public ở lớp access guard; bắt buộc refresh cookie hợp lệ | 200, accessToken và user; refresh cookie mới |
| POST | /auth/logout | Authenticated | 200, thông báo đăng xuất |

### Đăng ký

```json
{
  "email": "person@example.com",
  "password": "ExamplePass123",
  "fullName": "Nguyễn Văn A"
}
```

| Trường | Yêu cầu |
| --- | --- |
| email | Bắt buộc, đúng định dạng email; trim và chuyển chữ thường |
| password | Bắt buộc, chuỗi dài 6–32 ký tự; không trim |
| fullName | Không bắt buộc; chuỗi tối đa 100 ký tự; bỏ trống trường thì lưu null |

Password được băm bằng bcrypt với cost 10. Role luôn là USER; client không được gửi role, status hoặc trường ngoài DTO. Response dùng [UserResponseDto](./users-api.md#dữ-liệu-user-trả-về), không trả password hash hoặc tokenVersion.

Mã lỗi: 400 khi dữ liệu không hợp lệ; 409 khi email đã tồn tại hoặc có xung đột unique trong database. Tài khoản có email đang thuộc bản ghi deleted vẫn không thể đăng ký lại với email đó.

### Đăng nhập

```json
{
  "email": " Person@Example.com ",
  "password": "ExamplePass123"
}
```

Email được chuẩn hóa như đăng ký. Password phải là chuỗi không rỗng. User phải có trạng thái active.

Dữ liệu thành công:

```json
{
  "accessToken": "<JWT access token>",
  "user": {
    "user_id": "<user_id>",
    "email": "person@example.com",
    "role": "user"
  }
}
```

Phần user được rút gọn trong ví dụ; danh sách trường đầy đủ nằm trong tài liệu Users. Refresh token chỉ được gửi qua `Set-Cookie`, không có trong JSON.

- 400: thiếu trường, sai kiểu/định dạng hoặc gửi thêm trường không được phép.
- 401: email không tồn tại, mật khẩu sai hoặc trạng thái tài khoản không phải active.
- Login thành công thay thế phiên cũ của tài khoản.

### Refresh

Gửi `POST /api/auth/refresh` với cookie `refresh_token`. Body có thể để trống. Không hỗ trợ lấy refresh token từ body.

Server kiểm tra chữ ký, thời hạn, loại token, user, trạng thái và phiên bản phiên. Thành công trả access token mới trong `data.accessToken`, thông tin user và thay refresh cookie.

Cookie thiếu, sai, hết hạn, đã sử dụng hoặc phiên bị thu hồi trả 401. Client cần tuần tự hóa refresh; khi hai yêu cầu cùng dùng một token, tối đa một yêu cầu đổi phiên thành công.

### Logout

Gửi `POST /api/auth/logout` với Bearer access token hợp lệ. Server thu hồi phiên rồi xóa refresh cookie tại `/api/auth`.

```json
{
  "message": "Đăng xuất thành công"
}
```

Đây là nội dung `data` trong response chuẩn. Token thiếu/hết hạn/bị thu hồi trả 401; logout không tự dùng refresh cookie để thay access token.

## Ví dụ sử dụng cookie jar

Các lệnh sau dành cho shell hỗ trợ cú pháp cURL này; thay thông tin mẫu bằng tài khoản test của bạn.

```bash
curl -c cookies.txt -X POST http://localhost:7000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"person@example.com","password":"ExamplePass123"}'

curl -b cookies.txt -c cookies.txt -X POST http://localhost:7000/api/auth/refresh

curl -b cookies.txt -c cookies.txt -X POST http://localhost:7000/api/auth/logout \
  -H "Authorization: Bearer <accessToken mới nhất>"
```

Postman có thể lưu và gửi cookie tự động. Sau refresh cần cập nhật Bearer access token. Với trình duyệt gọi khác origin, cần cấu hình CORS/credentials tương ứng; không suy ra backend đã bật CORS từ ví dụ này.
