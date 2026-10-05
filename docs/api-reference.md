# Tài liệu API Backend (Chi tiết Request & Response JSON)

Quy chuẩn chung:
- **Base URL**: `http://localhost:7000/api`
- Tất cả API trả về cấu trúc bọc chuẩn:
  ```json
  {
    "success": true,
    "statusCode": 200,
    "message": "Request successful",
    "data": { /* dữ liệu mô tả bên dưới */ },
    "timestamp": "2026-10-01T00:00:00.000Z"
  }
  ```

---

## 1. Module Auth (`/api/auth`)

### 1.1. `POST /api/auth/register`
* **Chức năng**: Đăng ký tài khoản người dùng mới.
* **Role**: `Public`.
* **Request Body (JSON)**:
  ```json
  {
    "email": "user@example.com",
    "password": "Password123",
    "fullName": "Nguyễn Văn A"
  }
  ```
* **Response `data` (201 Created)**:
  ```json
  {
    "user_id": "user_7f8a9b0c1d2e3f4a",
    "email": "user@example.com",
    "fullName": "Nguyễn Văn A",
    "phone": null,
    "avatarUrl": null,
    "role": "user",
    "status": "active",
    "emailVerified": false,
    "phoneVerified": false,
    "identityVerified": false,
    "reputationScore": 0,
    "successfulSales": 0,
    "successfulBuys": 0,
    "disputeCount": 0,
    "lastLoginAt": null,
    "createdAt": "2026-10-01T08:00:00.000Z",
    "updatedAt": "2026-10-01T08:00:00.000Z"
  }
  ```
* **Yêu cầu khác**: Email unique (trùng trả 409). Password >= 6 ký tự, mã hóa bcrypt. Không trả password.

---

### 1.2. `POST /api/auth/login`
* **Chức năng**: Đăng nhập lấy access token.
* **Role**: `Public`.
* **Request Body (JSON)**:
  ```json
  {
    "email": "user@example.com",
    "password": "Password123"
  }
  ```
* **Response `data` (200 OK)**:
  ```json
  {
    "accessToken": "eyJhbGciOiJIUzI1NiIsIn...",
    "user": {
      "user_id": "user_7f8a9b0c1d2e3f4a",
      "email": "user@example.com",
      "fullName": "Nguyễn Văn A",
      "role": "user",
      "status": "active"
    }
  }
  ```
* **Yêu cầu khác**: Server tự set Cookie HTTP-Only `refresh_token` (hạn 7 ngày). Cập nhật `lastLoginAt`.

---

### 1.3. `POST /api/auth/refresh`
* **Chức năng**: Cấp mới accessToken khi token cũ hết hạn.
* **Role**: `Public` (dựa trên cookie).
* **Request**: Gửi kèm Cookie `refresh_token`.
* **Response `data` (200 OK)**:
  ```json
  {
    "accessToken": "eyJhbGciOiJIUzI1NiIsIn...",
    "user": {
      "user_id": "user_7f8a9b0c1d2e3f4a",
      "email": "user@example.com",
      "fullName": "Nguyễn Văn A",
      "role": "user",
      "status": "active"
    }
  }
  ```
* **Yêu cầu khác**: Cấp mới lại cookie `refresh_token` (Rotation). Nếu `tokenVersion` sai trả 401.

---

### 1.4. `POST /api/auth/logout`
* **Chức năng**: Đăng xuất, hủy toàn bộ phiên làm việc.
* **Role**: `Authenticated`.
* **Request**: Header `Authorization: Bearer <accessToken>`.
* **Response `data` (200 OK)**:
  ```json
  {
    "success": true,
    "message": "Logged out successfully"
  }
  ```
* **Yêu cầu khác**: Tăng `tokenVersion` +1 trong DB để vô hiệu hóa tất cả refresh token cũ. Xóa cookie.

---

## 2. Module Users (`/api/users`)

### 2.1. `GET /api/users/me`
* **Chức năng**: Xem thông tin hồ sơ của chính mình.
* **Role**: `Authenticated` (`USER`, `MODERATOR`, `ADMIN`).
* **Request**: Header `Authorization: Bearer <accessToken>`.
* **Response `data` (200 OK)**:
  ```json
  {
    "user_id": "user_7f8a9b0c1d2e3f4a",
    "email": "user@example.com",
    "phone": "0912345678",
    "fullName": "Nguyễn Văn A",
    "avatarUrl": "https://example.com/avatar.jpg",
    "role": "user",
    "status": "active",
    "emailVerified": false,
    "phoneVerified": false,
    "identityVerified": false,
    "reputationScore": 0,
    "successfulSales": 0,
    "successfulBuys": 0,
    "disputeCount": 0,
    "lastLoginAt": "2026-10-01T08:00:00.000Z",
    "createdAt": "2026-10-01T08:00:00.000Z",
    "updatedAt": "2026-10-01T08:00:00.000Z"
  }
  ```

---

### 2.2. `PATCH /api/users/me`
* **Chức năng**: Tự cập nhật hồ sơ cá nhân.
* **Role**: `Authenticated`.
* **Request**: Header `Authorization: Bearer <accessToken>`.
* **Request Body (JSON)**:
  ```json
  {
    "fullName": "Nguyễn Văn B",
    "phone": "0987654321",
    "avatarUrl": "https://example.com/new-avatar.jpg"
  }
  ```
* **Response `data` (200 OK)**: Đối tượng User sau khi cập nhật.
* **Yêu cầu khác**: Không được đổi `email`, `role`, `status`. Ghi audit log `profile.update`.

---

### 2.3. `PATCH /api/users/me/password`
* **Chức năng**: Đổi mật khẩu cá nhân.
* **Role**: `Authenticated`.
* **Request**: Header `Authorization: Bearer <accessToken>`.
* **Request Body (JSON)**:
  ```json
  {
    "currentPassword": "Password123",
    "newPassword": "NewPassword456"
  }
  ```
* **Response `data` (200 OK)**:
  ```json
  {
    "message": "Password updated successfully"
  }
  ```
* **Yêu cầu khác**: Tự tăng `tokenVersion` và xóa cookie để bắt buộc đăng nhập lại.

---

### 2.4. `GET /api/users`
* **Chức năng**: Quản trị xem danh sách toàn bộ người dùng.
* **Role**: `ADMIN`.
* **Request**: Header `Authorization: Bearer <accessToken>`.
* **Response `data` (200 OK)**:
  ```json
  [
    {
      "user_id": "user_7f8a9b0c1d2e3f4a",
      "email": "user@example.com",
      "fullName": "Nguyễn Văn A",
      "role": "user",
      "status": "active",
      "createdAt": "2026-10-01T08:00:00.000Z",
      "updatedAt": "2026-10-01T08:00:00.000Z"
    }
  ]
  ```

---

### 2.5. `GET /api/users/:id`
* **Chức năng**: Xem chi tiết 1 người dùng theo ID.
* **Role**: `ADMIN`.
* **Request**: Header `Authorization: Bearer <accessToken>`, Path Param `:id` (`user_id`).
* **Response `data` (200 OK)**: Chi tiết đối tượng User (không có password).

---

### 2.6. `POST /api/users`
* **Chức năng**: ADMIN tạo tài khoản thủ công.
* **Role**: `ADMIN`.
* **Request**: Header `Authorization: Bearer <accessToken>`.
* **Request Body (JSON)**:
  ```json
  {
    "email": "mod@example.com",
    "password": "Password123",
    "fullName": "Ban Quản Trị",
    "phone": "0912345678",
    "role": "moderator",
    "status": "active"
  }
  ```
* **Response `data` (201 Created)**: Đối tượng User mới tạo.

---

### 2.7. `PATCH /api/users/:id`
* **Chức năng**: ADMIN cập nhật người dùng theo ID.
* **Role**: `ADMIN`.
* **Request**: Header `Authorization: Bearer <accessToken>`, Path Param `:id`.
* **Request Body (JSON)**:
  ```json
  {
    "fullName": "Tên Người Dùng Mới"
  }
  ```
* **Response `data` (200 OK)**: Đối tượng User sau khi cập nhật.

---

## 3. Module Events (`/api/events`)

Cập nhật 05/10/2026 theo controller và DTO. Base URL local: `http://localhost:7000`.
ADMIN và MODERATOR quản lý mọi sự kiện. Các route public dùng được khi chưa đăng nhập.

[Tài liệu Events đầy đủ](./events-api.md) có bảng field, kiểu dữ liệu, giá trị mặc định
và ví dụ response JSON toàn bộ cho từng endpoint.

| Method và đường dẫn | Tham số truyền vào | Response thành công |
| --- | --- | --- |
| [`POST /api/events`](./events-api.md#create) | Bearer; multipart: name, venueName, address, categoryId, startTime, endTime, thumbnail, banner bắt buộc; shortDescription, description, status tùy chọn | 201; data là đầy đủ sự kiện quản lý, có createdBy |
| [`GET /api/events`](./events-api.md#list-public) | Query tùy chọn: page, limit, q, categoryId, phase; không body | 200; data = { items, total, page, limit }; items public không có createdBy |
| [`GET /api/events/:id`](./events-api.md#detail-public) | Path: id; không body hoặc query nghiệp vụ | 200; data là sự kiện public, gồm phase, không có createdBy |
| [`GET /api/events/manage`](./events-api.md#list-manage) | Bearer; query tùy chọn: page, limit, q, categoryId, phase, status | 200; data = { items, total, page, limit }; items có createdBy |
| [`GET /api/events/manage/:id`](./events-api.md#detail-manage) | Bearer; path: id; không body | 200; data là đầy đủ sự kiện quản lý, kể cả draft |
| [`PATCH /api/events/:id`](./events-api.md#update) | Bearer; path: id; JSON hoặc multipart, gửi ít nhất một field/ảnh cần sửa | 200; data là đầy đủ sự kiện sau cập nhật, có createdBy và phase |
| [`DELETE /api/events/:id`](./events-api.md#delete) | Bearer; path: id; không body | 200; data = { event_id, message: "Event deleted" } |
| [`GET /api/events/:id/images/:kind`](./events-api.md#image-public) | Path: id, kind=thumbnail hoặc banner; không body; query file không cần gửi | 200; body nhị phân ảnh, Content-Type tương ứng; không JSON envelope |
| [`GET /api/events/manage/:id/images/:kind`](./events-api.md#image-manage) | Bearer; path: id, kind=thumbnail hoặc banner; không body | 200; body nhị phân ảnh, kể cả draft; không JSON envelope |

### Quy ước đầu vào

- Header quản lý: `Authorization: Bearer <accessToken>`.
- ID là chuỗi, lấy `event_id` từ response hoặc `category_id` trong database.
- Tạo mới dùng multipart: hai ảnh bắt buộc. JPEG/PNG/GIF/WebP, mặc định tối đa 10 MB/file.
- Sửa nhận JSON nếu chỉ sửa nội dung hoặc multipart nếu thay ảnh. Bỏ qua field giữ nguyên;
  không truyền status thì giữ trạng thái hiện tại.
- `startTime`/`endTime` nhận ISO 8601 có múi giờ, ví dụ `2026-11-20T19:00:00+07:00`;
  response chuẩn hóa UTC thành `2026-11-20T12:00:00.000Z`.
- Query: page mặc định 1 (1–100000), limit mặc định 20 (1–100), q tối đa 255 ký tự,
  categoryId dài 1–40 ký tự, phase là upcoming/ongoing/ended. Chỉ route manage nhận
  status=draft/published/cancelled.
- Category mới phải đang hoạt động. Trường ID/createdBy/timestamp/URL ảnh do server quản lý.

### Quy ước response

Response JSON gồm `success`, `statusCode`, `message`, `data`, `timestamp`.
`message` của lớp bọc luôn là `Request successful`. Khi xóa, `data.message` là `Event deleted`.

Sự kiện trong data hoặc items có đủ: event_id, name, shortDescription, description,
thumbnailUrl, bannerUrl, startTime, endTime, venueName, address, categoryId, status,
phase, createdAt và updatedAt. POST/PATCH và route manage thêm createdBy.
Mô tả và URL ảnh có thể null theo schema; event vừa tạo thành công có hai URL ảnh.
Response không lồng entity User hoặc category; categoryId là chuỗi tham chiếu.

Public list chỉ chứa published; public detail/ảnh chứa published hoặc cancelled.
Manage đọc được mọi trạng thái. Danh sách trả items, total, page và limit; không có
totalPages. Phase được tính theo thời gian, tách khỏi status.

Chi tiết cho FE, gồm ví dụ JSON đầy đủ:
[response chung](./events-api.md#response-json),
[tạo](./events-api.md#create), [list public](./events-api.md#list-public),
[detail public](./events-api.md#detail-public), [list manage](./events-api.md#list-manage),
[detail manage](./events-api.md#detail-manage), [sửa](./events-api.md#update),
[xóa](./events-api.md#delete), [ảnh public](./events-api.md#image-public),
[ảnh manage](./events-api.md#image-manage).

## 4. Thể loại sự kiện (`/api/event-categories`)

| Method và đường dẫn | Quyền | Tham số | Response thành công |
| --- | --- | --- | --- |
| `GET /api/event-categories` | Public, không cần đăng nhập | Không có path param, không cần query/body | 200; `data` là mảng category đang hoạt động |

Mỗi phần tử có `category_id` (string), `name` (string), `slug` (string),
`description` (string hoặc null), `isActive` (boolean, luôn true).
Sắp theo name tăng dần, sau đó category_id tăng dần. Không phân trang;
không có category đang hoạt động thì `data: []`.

Frontend dùng `name` làm nhãn và `category_id` làm giá trị của dropdown.
Gửi giá trị đã chọn vào `categoryId` khi tìm kiếm hoặc tạo/sửa sự kiện.

[Hợp đồng API và response JSON đầy đủ](./event-categories-api.md).
