# Tài liệu API Backend (Chi tiết Request & Response JSON)

Bổ sung 12/10/2026: `PATCH /api/users/:id/status` cho ADMIN khóa/mở khóa USER/MODERATOR, MODERATOR chỉ quản lý trạng thái USER;
`POST /api/orders/me/:id/dispute/evidence` upload ảnh/PDF;
`GET /api/orders/:id/dispute/evidence/:attachmentId` tải file riêng tư.
Xem [request, response, phân quyền và SQL nâng cấp](./account-moderation-dispute-evidence.md).

Cập nhật đối chiếu mã nguồn ngày 07/10/2026. Các ví dụ user ở login, refresh và
danh sách quản trị được rút gọn; trường đầy đủ xem [API Users](./users-api.md).

Quy chuẩn chung:
- **Base URL**: `http://localhost:7000/api`
- API trả JSON thành công dùng cấu trúc bọc chuẩn (API ảnh/file trả dữ liệu nhị phân):
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
* **Yêu cầu khác**: Email trim/chuyển chữ thường, unique (trùng trả 409). Password dài 6–32 ký tự, băm bcrypt. fullName tùy chọn, tối đa 100 ký tự. Role luôn USER; không nhận trường ngoài DTO. Không trả password.

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
    "message": "Đăng xuất thành công"
  }
  ```
* **Yêu cầu khác**: Tăng `tokenVersion` +1 trong DB, thu hồi cả access và refresh token của phiên cũ. Xóa cookie `refresh_token` tại `/api/auth`.

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
    "fullName": "Nguyễn Văn B"
  }
  ```
* **Response `data` (200 OK)**: Đối tượng User sau khi cập nhật.
* **Yêu cầu khác**: Chỉ nhận fullName, trim và dài 1–100 ký tự. Không nhận phone, avatarUrl, email, password, role hoặc status. Ghi audit log `profile.update`; giữ phiên hiện tại.

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
    "message": "Đổi mật khẩu thành công, hãy đăng nhập lại"
  }
  ```
* **Yêu cầu khác**: Tự tăng `tokenVersion` và xóa cookie để bắt buộc đăng nhập lại.

---

### 2.4. `GET /api/users`
* **Chức năng**: Quản trị xem tối đa 100 người dùng có status khác deleted, sắp createdAt giảm dần rồi user_id tăng dần; chưa có phân trang.
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
    "fullName": "Người dùng mới"
  }
  ```
* **Response `data` (201 Created)**: Đối tượng User mới tạo.
* **Yêu cầu khác**: Cùng DTO đăng ký; role luôn USER. Không nhận phone, role hoặc status; không tạo ADMIN/MODERATOR qua API này.

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
| [`POST /api/events`](./events-api.md#create) | Bearer; multipart: name, venueName, address, categoryId, startTime, endTime, banner bắt buộc; description, status tùy chọn | 201; data là đầy đủ sự kiện quản lý, có createdBy |
| [`GET /api/events`](./events-api.md#list-public) | Query tùy chọn: page, limit, q, categoryId, phase; không body | 200; data = { items, total, page, limit }; items public không có createdBy |
| [`GET /api/events/:id`](./events-api.md#detail-public) | Path: id; không body hoặc query nghiệp vụ | 200; data là sự kiện public, gồm phase, không có createdBy |
| [`GET /api/events/manage`](./events-api.md#list-manage) | Bearer; query tùy chọn: page, limit, q, categoryId, phase, status | 200; data = { items, total, page, limit }; items có createdBy |
| [`GET /api/events/manage/:id`](./events-api.md#detail-manage) | Bearer; path: id; không body | 200; data là đầy đủ sự kiện quản lý, kể cả draft |
| [`PATCH /api/events/:id`](./events-api.md#update) | Bearer; path: id; JSON hoặc multipart, gửi ít nhất một field/ảnh cần sửa | 200; data là đầy đủ sự kiện sau cập nhật, có createdBy và phase |
| [`DELETE /api/events/:id`](./events-api.md#delete) | Bearer; path: id; không body | 200; data = { event_id, message: "Event deleted" } |
| [`GET /api/events/:id/images/banner`](./events-api.md#image-public) | Path: id, không body; query file không cần gửi | 200; body nhị phân ảnh, Content-Type tương ứng; không JSON envelope |
| [`GET /api/events/manage/:id/images/banner`](./events-api.md#image-manage) | Bearer; path: id, không body | 200; body nhị phân ảnh, kể cả draft; không JSON envelope |

### Quy ước đầu vào

- Header quản lý: `Authorization: Bearer <accessToken>`.
- ID là chuỗi, lấy `event_id` từ response hoặc `category_id` trong database.
- Tạo mới dùng multipart: một banner bắt buộc. JPEG/PNG/GIF/WebP, mặc định tối đa 10 MB/file.
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

Sự kiện trong data hoặc items có đủ: event_id, name, description,
bannerUrl, startTime, endTime, venueName, address, categoryId, status,
phase, isPinned, pinnedAt, createdAt và updatedAt. POST/PATCH và route manage thêm createdBy.
Description và bannerUrl có thể null theo schema; event vừa tạo thành công có URL banner.
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

### Ghim sự kiện

| API | Quyền | Đầu vào | Response thành công |
| --- | --- | --- | --- |
| [GET /api/events/pinned](./events-api.md#pinned) | Public | Không cần token, body/query | 200; data là mảng tối đa 4 sự kiện public, ghim gần nhất trước |
| [PATCH /api/events/:id/pin](./events-api.md#pin) | ADMIN, MODERATOR | Bearer; path id; JSON { "isPinned": true } hoặc false | 200; data là sự kiện quản lý đầy đủ, thêm isPinned và pinnedAt |

Chỉ published chưa kết thúc mới được ghim. Hết hạn/hủy không chiếm suất; không tự
bù sự kiện chưa ghim. API sửa nội dung không nhận trường ghim. Bỏ ghim đặt pinnedAt=null.

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

## 5. Module Tickets (`/api/tickets`)

### Đăng bán vé

`POST /api/tickets`: mọi tài khoản active đã đăng nhập; multipart gồm eventId,
ticketTier, originalPrice, price và đúng một file ticketFile; seatInfo/description
tùy chọn. Response 201 trả vé pending_review; job kiểm tra được tạo cùng transaction.
Xem [đầu vào và response đầy đủ](./tickets-api.md#dang-ban-ve).

### Vé của tôi

`GET /api/tickets/me` và `GET /api/tickets/me/:id` dùng Bearer token, mọi role
đang hoạt động. Chỉ trả vé người gọi đăng bán. Danh sách có phân trang/bộ lọc như
public và thêm status, mặc định mọi trạng thái. Data là {items,total,page,limit}
hoặc một item chi tiết, có tóm tắt check, reviewMethod/verifiedAt/rejectionReason.
Không trả file, QR, OCR, buyerId hoặc dữ liệu kiểm duyệt riêng. [Chi tiết](./tickets-api.md).

### Danh sách công khai

Public, không cần token/body. Query: `page` (1), `limit` (20, tối đa 100),
`categoryId`, `eventId`, `ticketTier`, `minPrice`, `maxPrice`, `q`, `sort`.
Các bộ lọc kết hợp; hạng vé khớp toàn bộ không phân biệt hoa thường, q tìm
chuỗi con trong tên sự kiện hoặc hạng vé. sort gồm newest/price_asc/price_desc/event_soonest.

Chỉ trả vé available thuộc sự kiện published chưa kết thúc. Response 200:
`data: { items, total, page, limit }`; mỗi item có dữ liệu vé công khai và tóm tắt
sự kiện (tên, banner, thời gian, địa điểm, categoryId), không trả file vé hay buyerId.

[Tham số và response chi tiết](./tickets-api.md).

### Kiểm tra và duyệt vé

ADMIN/MODERATOR dùng GET `/api/tickets/manage`, GET `/api/tickets/manage/:id`,
GET `/api/tickets/manage/:id/file`, POST `/api/tickets/manage/:id/check` (202),
PATCH `/api/tickets/:id/review` (200). Chi tiết body/query/response và cài worker
local tại [Hợp đồng kiểm tra vé](./ticket-review-automation.md).

### Hủy vé — DELETE /api/tickets/:id

Đăng nhập bằng Bearer token; chỉ chủ vé, không có ngoại lệ cho ADMIN/MODERATOR.
Path id là ticket_id; không cần body/query. Chỉ pending_review/rejected/available
được chuyển sang cancelled. Giữ bản ghi và file vé. Response 200:
`data: { ticket_id, status: "cancelled" }`. Có audit tickets.cancel;
quyền sở hữu và trạng thái được kiểm tra nguyên tử trong UPDATE.

## 6. Module Orders (`/api/orders`)

Xem [hợp đồng Orders](./orders-api.md) cho request/response, phân quyền, trạng thái,
schema và cấu hình. Tạo đơn bằng POST /api/orders với body ticketId và header
Idempotency-Key. Không giữ vé; một vé chỉ cấp cho một đơn thanh toán thành công.

GET /api/orders/me và /me/:id trả đơn của người mua/người bán. Buyer dùng các route
/me/:id/cancel, /payment, /payment/mock-result, /file, /dispute; seller dùng
/me/:id/dispute/reply. ADMIN/MODERATOR dùng /manage và /manage/:id, quyết định qua
/manage/:id/dispute/resolve, xác nhận giả lập qua /refund/mock hoặc /payout/mock.
Không ai được quản trị quyết định/chuyển tiền cho đơn mình tham gia.

Amount Orders là chuỗi thập phân, currency=VND. Chưa có thanh toán VNPay/tiền thật.
