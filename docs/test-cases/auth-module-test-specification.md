# Báo Cáo Đặc Tả Test Cases & Dữ Liệu Kiểm Thử (Auth Module)

> **Dự án**: Nền tảng bán lại vé trực tuyến (Ticket Resell Platform)\
> **Module**: Xác thực & Phân quyền Hệ thống (`Auth Module`)\
> **Framework & Thư viện**: NestJS, Jest, JWT, Passport, bcrypt, cookie-parser\
> **Tài liệu tham khảo**: [auth-api.md](../auth-api.md), [authorization.md](../authorization.md)

---

## 1. Mục Tiêu & Phạm Vi Kiểm Thử

### 1.1. Mục tiêu
- Đảm bảo quy trình đăng ký tài khoản (`POST /api/auth/register`) mã hóa mật khẩu bằng bcrypt an toàn và khởi tạo role `user` mặc định.
- Đảm bảo quy trình đăng nhập (`POST /api/auth/login`) sinh Access Token (thời hạn ngắn) và Refresh Token được lưu an toàn trong HTTP-only Cookie (`refresh_token`).
- Kiểm tra tính bảo mật của luồng làm mới phiên (`POST /api/auth/refresh`): xoay vòng token, từ chối refresh token giả mạo hoặc hết hạn.
- Đảm bảo đăng xuất (`POST /api/auth/logout`) và đổi mật khẩu hủy phiên làm việc và xóa sạch cookie refresh token.
- Đảm bảo ma trận phân quyền RBAC (`AccessTokenGuard`, `RolesGuard`, `AccessPolicy`) chặn truy cập trái phép của người dùng chưa xác thực hoặc không đủ quyền.

---

## 2. Danh Mục Mock Data (Dữ Liệu Thử Nghiệm)

| Dữ Liệu Mock | Mục Đích |
| :--- | :--- |
| `mockAuthUserPrincipal` | Principal đại diện cho người dùng thường (`USER`) đang hoạt động |
| `mockAuthAdminPrincipal` | Principal đại diện cho Quản trị viên (`ADMIN`) |
| `mockRegisterDto` | Payload đăng ký chuẩn: email hợp lệ, mật khẩu đủ độ dài, họ tên |
| `mockLoginDto` | Payload đăng nhập chuẩn tương ứng với tài khoản đăng ký |
| `mockAuthTokens` | Access Token và Refresh Token giả lập dùng trong unit test |

---

## 3. Ma Trận Test Cases Chi Tiết (Test Matrix)

### Phân nhóm A: Đăng ký & Đăng nhập (`POST /api/auth/register`, `POST /api/auth/login`)

| Mã TC | Phân loại | Điều kiện | Dữ liệu đầu vào | Kết quả mong đợi |
| :--- | :--- | :--- | :--- | :--- |
| **TC-AUTH-01** | Positive | Email chưa tồn tại | RegisterDto hợp lệ | - HTTP 201 Created<br>- Tạo user mới, mật khẩu được hash |
| **TC-AUTH-02** | Conflict | Email đã tồn tại | Email đã có trong hệ thống | - HTTP 409 Conflict<br>- 'Email already exists' |
| **TC-AUTH-03** | Positive | Tài khoản active, mật khẩu đúng | LoginDto hợp lệ | - HTTP 200 OK<br>- Trả về accessToken trong body<br>- Ghi HttpOnly Cookie `refresh_token`<br>- Body không chứa `refreshToken` thô |
| **TC-AUTH-04** | Negative | Sai mật khẩu hoặc email không tồn tại | Mật khẩu sai | - HTTP 401 Unauthorized<br>- 'Invalid credentials' |
| **TC-AUTH-05** | Security | Tài khoản bị tạm khóa (`suspended`) | LoginDto tài khoản suspended | - HTTP 401 Unauthorized<br>- 'Account is suspended' |

### Phân nhóm B: Làm mới phiên & Đăng xuất (`POST /api/auth/refresh`, `POST /api/auth/logout`)

| Mã TC | Phân loại | Điều kiện | Dữ liệu đầu vào | Kết quả mong đợi |
| :--- | :--- | :--- | :--- | :--- |
| **TC-AUTH-06** | Positive | Cookie `refresh_token` hợp lệ và còn hạn | Cookie hợp lệ | - HTTP 200 OK<br>- Cấp accessToken mới<br>- Ghi đè cookie refresh token mới |
| **TC-AUTH-07** | Negative | Thiếu cookie hoặc cookie rỗng | Request không có cookie | - HTTP 401 Unauthorized<br>- 'Missing refresh token' |
| **TC-AUTH-08** | Positive | User đã đăng nhập gửi yêu cầu đăng xuất | Bearer token hợp lệ | - HTTP 200 OK<br>- Xóa Cookie `refresh_token`<br>- Thu hồi phiên |

### Phân nhóm C: Bảo vệ API bằng Guard & Policy (`AccessTokenGuard`, `RolesGuard`)

| Mã TC | Phân loại | Điều kiện | Endpoint | Kết quả mong đợi |
| :--- | :--- | :--- | :--- | :--- |
| **TC-AUTH-09** | Security | Request không có Bearer token | Endpoint `@Authenticated()` | - HTTP 401 Unauthorized |
| **TC-AUTH-10** | Security | User role thường truy cập endpoint admin | Endpoint `@Roles(ADMIN)` | - HTTP 403 Forbidden |
| **TC-AUTH-11** | Security | Token đã bị thu hồi do đổi mật khẩu (`tokenVersion` lệch) | Token cũ sau đổi mật khẩu | - HTTP 401 Unauthorized |
