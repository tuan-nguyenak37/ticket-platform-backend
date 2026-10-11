# Báo Cáo Đặc Tả Test Cases & Dữ Liệu Kiểm Thử (User Module)

> **Dự án**: Nền tảng bán lại vé trực tuyến (Ticket Resell Platform)\
> **Module**: Quản lý Người Dùng & Hồ Sơ Cá Nhân (`Users Module`)\
> **Framework & Thư viện**: NestJS, Jest, TypeORM, class-validator\
> **Tài liệu tham khảo**: [users-api.md](../users-api.md), [authorization.md](../authorization.md)

---

## 1. Mục Tiêu & Phạm Vi Kiểm Thử

### 1.1. Mục tiêu
- Đảm bảo tính toàn vẹn và an toàn của các thao tác quản lý tài khoản người dùng và hồ sơ cá nhân.
- Xác thực cơ chế phân quyền (Role-Based Access Control): Phân tách rõ ràng quyền của `USER`, `MODERATOR`, và `ADMIN`.
- Đảm bảo cơ chế bảo mật phiên đăng nhập (`tokenVersion` và xóa cookie refresh token) hoạt động chính xác khi người dùng đổi mật khẩu hoặc bị vô hiệu hóa tài khoản.
- Đảm bảo kiểm soát dữ liệu nhạy cảm: Tuyệt đối không để lộ mật khẩu, hash mật khẩu, hoặc `tokenVersion` ra ngoài API response.

### 1.2. Phạm vi kiểm thử
- **Logic dịch vụ (`UsersService`)**: Hồ sơ cá nhân (`getProfile`, `updateProfile`), Đổi mật khẩu (`changePassword`), Quản trị người dùng (`findAll`, `findOne`, `createForAdmin`, `update`), Xoay vòng phiên (`rotateTokenVersion`), Bắt lỗi trùng lặp CSDL (`rethrowDatabaseError`).
- **Giao diện điều khiển API (`UsersController`)**: 7 endpoints RESTful, các bộ lọc bảo vệ Guard (`@Authenticated`, `@Roles`), xử lý HTTP status code, và dọn dẹp cookie.
- **Ràng buộc dữ liệu (DTOs)**: `CreateUserDto`, `UpdateUserDto`, `ChangePasswordDto`.

---

## 2. Danh Mục Mock Data (Dữ Liệu Thử Nghiệm)

Dưới đây là bảng dữ liệu mẫu được định nghĩa sẵn trong hệ thống (file code [users.mock-data.ts](../../src/modules/users/test/users.mock-data.ts) và file SQL [mock-users.seed.sql](../seeds/mock-users.seed.sql)) để phục vụ việc kiểm thử tự động và kiểm thử thủ công:

| ID Người Dùng | Email | Mật Khẩu Thô | Vai Trò | Trạng Thái | Mô Tả Mục Đích Test |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `usr_mock_admin_001` | `admin@ticketplatform.test` | `Password123@` | `admin` | `active` | Tài khoản Quản trị viên kiểm thử các API `/api/users/*` |
| `usr_mock_moderator_002`| `mod@ticketplatform.test` | `Password123@` | `moderator` | `active` | Kiểm duyệt viên kiểm tra phân quyền bị từ chối ở API admin |
| `usr_mock_user_buyer_003`| `user.buyer@ticketplatform.test` | `Password123@` | `user` | `active` | Người dùng mua vé thông thường, dùng kiểm thử `/api/users/me` |
| `usr_mock_user_seller_004`| `user.seller@ticketplatform.test`| `Password123@` | `user` | `active` | Người bán vé đã xác minh uy tín |
| `usr_mock_user_suspended_005`|`suspended.user@ticketplatform.test`| `Password123@` | `user` | `suspended` | Tài khoản bị tạm khóa kiểm tra chặn truy cập (401) |
| `usr_mock_user_deleted_006`| `deleted.user@ticketplatform.test` | `Password123@` | `user` | `deleted` | Tài khoản đã xóa, kiểm tra bị ẩn khỏi danh sách và chi tiết (404) |

### Dữ liệu Mock DTO Payloads
- **Mẫu đổi mật khẩu hợp lệ**:
  ```json
  { "currentPassword": "Password123@", "newPassword": "NewSecurePassword456@" }
  ```
- **Mẫu đổi mật khẩu sai mật khẩu hiện tại**:
  ```json
  { "currentPassword": "WrongPassword999@", "newPassword": "NewSecurePassword456@" }
  ```
- **Mẫu đổi mật khẩu trùng mật khẩu cũ**:
  ```json
  { "currentPassword": "Password123@", "newPassword": "Password123@" }
  ```
- **Mẫu cập nhật tên hợp lệ**:
  ```json
  { "fullName": "   Nguyễn Văn An   " }
  ```
- **Mẫu cập nhật tên không hợp lệ (rỗng)**:
  ```json
  { "fullName": "   " }
  ```

---

## 3. Ma Trận Test Cases Chi Tiết (Test Matrix)

### Phân nhóm A: Quản lý Hồ sơ Cá nhân (`/api/users/me`)

| Mã TC | Endpoint / Chức năng | Phân loại | Điều kiện tiên quyết | Dữ liệu đầu vào | Các bước thực hiện | Kết quả mong đợi |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **TC-USR-01** | `GET /api/users/me` | Positive | User đã đăng nhập, tài khoản `status = 'active'` | Bearer Token của `usr_mock_user_buyer_003` | 1. Gửi request `GET /api/users/me`<br>2. Kiểm tra mã phản hồi và cấu trúc dữ liệu trả về | - HTTP 200 OK<br>- Trả về `UserResponseDto`<br>- **Không có** trường `password` và `tokenVersion` |
| **TC-USR-02** | `GET /api/users/me` | Negative | Tài khoản bị tạm dừng (`status = 'suspended'`) | Bearer Token của `usr_mock_user_suspended_005` | 1. Gửi request `GET /api/users/me` | - HTTP 401 Unauthorized<br>- Bị từ chối tại Guard/selfScope |
| **TC-USR-03** | `GET /api/users/me` | Negative | Token có chữ ký hợp lệ nhưng User không còn trong DB khi guard kiểm tra | Bearer Token với user_id không tồn tại | 1. Gửi request `GET /api/users/me` | - HTTP 401 Unauthorized tại AccessTokenGuard<br>- Service getProfile chỉ trả 404 nếu đã qua guard nhưng truy vấn hồ sơ không còn khớp |
| **TC-USR-04** | `PATCH /api/users/me` | Positive | User đã đăng nhập, tài khoản active | Body: `{"fullName": "  Trần Văn Bình  "}` | 1. Gửi `PATCH /api/users/me`<br>2. CSDL cập nhật fullName đã trim | - HTTP 200 OK<br>- Trả về hồ sơ có `fullName = "Trần Văn Bình"` |
| **TC-USR-05** | `PATCH /api/users/me` | Negative | User đã đăng nhập | Body: `{"fullName": "   "}` | 1. Gửi `PATCH /api/users/me` với khoảng trắng | - HTTP 400 Bad Request<br>- Báo lỗi validation độ dài tối thiểu 1 ký tự |
| **TC-USR-06** | `PATCH /api/users/me` | Negative | User đã đăng nhập | Body: `{"fullName": "a".repeat(101)}` | 1. Gửi `PATCH /api/users/me` với chuỗi 101 ký tự | - HTTP 400 Bad Request<br>- Báo lỗi vượt quá 100 ký tự |
| **TC-USR-07** | `PATCH /api/users/me` | Concurrency | User đã qua guard; status/tokenVersion đổi trước UPDATE | Body: `{"fullName": "Tên Mới"}` | 1. Làm điều kiện selfScope không còn khớp (`affected = 0`)<br>2. Gọi cập nhật hồ sơ | - HTTP 409 Conflict<br>- Báo: 'Tài khoản đã thay đổi, hãy đăng nhập lại'<br>- Hai request chỉ sửa tên không tự làm tăng tokenVersion và không mặc nhiên gây 409 |

---

### Phân nhóm B: Đổi Mật Khẩu Cá Nhân (`PATCH /api/users/me/password`)

| Mã TC | Endpoint / Chức năng | Phân loại | Điều kiện tiên quyết | Dữ liệu đầu vào | Các bước thực hiện | Kết quả mong đợi |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **TC-USR-08** | `PATCH /api/users/me/password` | Positive | User đã đăng nhập | Body: `{"currentPassword": "Password123@", "newPassword": "NewPassword456@"}` | 1. Gửi `PATCH /api/users/me/password`<br>2. Kiểm tra DB và response cookie | - HTTP 200 OK<br>- Message: 'Đổi mật khẩu thành công, hãy đăng nhập lại'<br>- Cookie `refresh_token` tại /api/auth bị xóa<br>- DB tăng `tokenVersion` lên 1 đơn vị |
| **TC-USR-09** | `PATCH /api/users/me/password` | Negative | User đã đăng nhập | Body: `{"currentPassword": "WrongPassword!", "newPassword": "NewPassword456@"}` | 1. Gửi `PATCH /api/users/me/password` với mật khẩu hiện tại sai | - HTTP 400 Bad Request<br>- Thông báo: 'Mật khẩu hiện tại không đúng'<br>- Mật khẩu cũ không đổi, cookie không bị xóa |
| **TC-USR-10** | `PATCH /api/users/me/password` | Negative | User đã đăng nhập | Body: `{"currentPassword": "Password123@", "newPassword": "Password123@"}` | 1. Gửi `PATCH /api/users/me/password` với mật khẩu mới trùng mật khẩu cũ | - HTTP 400 Bad Request<br>- Thông báo: 'Mật khẩu mới phải khác mật khẩu hiện tại' |
| **TC-USR-11** | `PATCH /api/users/me/password` | Boundary | User đã đăng nhập | Body: `{"currentPassword": "Password123@", "newPassword": "12345"}` | 1. Gửi mật khẩu mới ngắn hơn 6 ký tự | - HTTP 400 Bad Request<br>- Lỗi validation: độ dài tối thiểu 6 ký tự |
| **TC-USR-12** | `PATCH /api/users/me/password` | Boundary | User đã đăng nhập | Body: `{"currentPassword": "Password123@", "newPassword": "a".repeat(33)}` | 1. Gửi mật khẩu mới dài hơn 32 ký tự | - HTTP 400 Bad Request<br>- Lỗi validation: độ dài tối đa 32 ký tự |
| **TC-USR-13** | `PATCH /api/users/me/password` | Concurrency | User đã đăng nhập | Body hợp lệ | 1. Gửi request đổi mật khẩu khi phiên bị thay đổi song song (`affected = 0`) | - HTTP 409 Conflict<br>- Thông báo: 'Tài khoản đã thay đổi, hãy thử lại' |

---

### Phân nhóm C: Quản Trị Người Dùng Cho Admin (`/api/users`)

| Mã TC | Endpoint / Chức năng | Phân loại | Điều kiện tiên quyết | Dữ liệu đầu vào | Các bước thực hiện | Kết quả mong đợi |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **TC-USR-14** | `GET /api/users` | Positive | Đăng nhập với tài khoản `role = 'admin'` | Bearer Token của `usr_mock_admin_001` | 1. Admin gửi `GET /api/users` | - HTTP 200 OK<br>- Trả về mảng tối đa 100 user<br>- Sắp xếp `createdAt DESC`<br>- **Không chứa** user có `status = 'deleted'` |
| **TC-USR-15** | `GET /api/users` | Security | Đăng nhập với tài khoản `role = 'user'` hoặc `'moderator'` | Bearer Token của `usr_mock_user_buyer_003` | 1. User thường gửi `GET /api/users` | - HTTP 403 Forbidden<br>- Báo lỗi: 'Chỉ quản trị viên được quản lý người dùng' |
| **TC-USR-16** | `GET /api/users/:id` | Positive | Đăng nhập với quyền Admin | Param: `id = 'usr_mock_user_buyer_003'` | 1. Admin gửi `GET /api/users/usr_mock_user_buyer_003` | - HTTP 200 OK<br>- Trả về đúng thông tin user chi tiết theo DTO chuẩn |
| **TC-USR-17** | `GET /api/users/:id` | Negative | Đăng nhập với quyền Admin | Param: `id = 'usr_mock_user_deleted_006'` (User đã xóa) | 1. Admin gửi request xem user có trạng thái `deleted` | - HTTP 404 Not Found<br>- Thông báo: 'Không tìm thấy người dùng' |
| **TC-USR-18** | `POST /api/users` | Positive | Đăng nhập với quyền Admin | Body: `{"email": "created.by.admin@test.com", "password": "Password123@", "fullName": "Admin Tạo"}` | 1. Admin tạo tài khoản mới | - HTTP 201 Created<br>- Mật khẩu được băm an toàn<br>- Role mặc định là `user` |
| **TC-USR-19** | `POST /api/users` | Negative | Đăng nhập với quyền Admin | Body: Email đã tồn tại trong CSDL | 1. Admin tạo tài khoản với email trùng lặp | - HTTP 409 Conflict<br>- Thông báo: 'Email đã tồn tại trên hệ thống' |
| **TC-USR-20** | `PATCH /api/users/:id` | Positive | Đăng nhập với quyền Admin | Param: ID user hợp lệ; Body: `{"fullName": "Tên Đã Sửa Bởi Admin"}` | 1. Admin cập nhật tên người dùng | - HTTP 200 OK<br>- Trả về user sau cập nhật với tên mới |
| **TC-USR-21** | `PATCH /api/users/:id` | Negative | Đăng nhập với quyền Admin | Param: ID user đã bị xóa hoặc không tồn tại | 1. Admin gửi cập nhật cho user không tồn tại | - HTTP 404 Not Found<br>- Báo lỗi: 'Không tìm thấy người dùng' |
| **TC-USR-22** | `rotateTokenVersion` | Security / Session | Gọi từ logic xác thực / đăng nhập | User object với `user_id` và `tokenVersion` cũ | 1. Gọi hàm xoay vòng token | - Trả về `tokenVersion` mới = cũ + 1<br>- Ném `401 Unauthorized` nếu phiên bị trùng lặp cập nhật |

---

## 4. Hướng Dẫn Thực Thi Kiểm Thử Tự Động

Để chạy toàn bộ bộ kiểm thử tự động của User Module:
```powershell
# Chạy Unit Tests cho User Module
npm test -- src/modules/users --runInBand

# Chạy kiểm tra độ bao phủ mã nguồn (Code Coverage)
npm test -- src/modules/users --coverage
```
