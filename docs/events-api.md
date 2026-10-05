# API module Events

Cập nhật theo controller, DTO và service ngày **05/10/2026**. Tài liệu mô tả đường dẫn, dữ liệu truyền vào và response thành công.

## Cách gọi API

- Base URL local: `http://localhost:7000`. Các đường dẫn bên dưới đã bao gồm prefix `/api`.
- API quản lý gửi header `Authorization: Bearer <accessToken>`; ADMIN và MODERATOR quản lý mọi sự kiện.
- API public dùng được khi chưa đăng nhập.
- ID sự kiện và category là chuỗi. Lấy category qua [GET /api/event-categories](./event-categories-api.md), API public trả các category đang hoạt động. Ví dụ dùng `event_cat_music`; thay bằng `category_id` thực trong response.
- Multipart: các trường nội dung là text, `thumbnail`/`banner` chọn loại File. Để Postman/trình duyệt tự tạo `Content-Type` có boundary.

| Method | Đường dẫn | Quyền | Chức năng |
| --- | --- | --- | --- |
| `GET` | [`/api/events/pinned`](#pinned) | Public | Tối đa 4 sự kiện ghim còn hiệu lực |
| `PATCH` | [`/api/events/:id/pin`](#pin) | ADMIN, MODERATOR | Ghim hoặc bỏ ghim |
| `POST` | [`/api/events`](#create) | ADMIN, MODERATOR | Tạo sự kiện |
| `GET` | [`/api/events`](#list-public) | Public | Danh sách công khai |
| `GET` | [`/api/events/:id`](#detail-public) | Public | Chi tiết công khai |
| `GET` | [`/api/events/manage`](#list-manage) | ADMIN, MODERATOR | Danh sách quản lý |
| `GET` | [`/api/events/manage/:id`](#detail-manage) | ADMIN, MODERATOR | Chi tiết quản lý |
| `PATCH` | [`/api/events/:id`](#update) | ADMIN, MODERATOR | Cập nhật |
| `DELETE` | [`/api/events/:id`](#delete) | ADMIN, MODERATOR | Xóa |
| `GET` | [`/api/events/:id/images/:kind`](#image-public) | Public | Ảnh công khai |
| `GET` | [`/api/events/manage/:id/images/:kind`](#image-manage) | ADMIN, MODERATOR | Ảnh quản lý |

<a id="response-json"></a>
## Cấu trúc response JSON

Mọi response JSON thành công có cấu trúc:

| Trường | Kiểu | Ý nghĩa |
| --- | --- | --- |
| `success` | boolean | Luôn là `true` khi thành công |
| `statusCode` | number | `201` khi tạo, `200` khi đọc/sửa/xóa |
| `message` | string | `Request successful` |
| `data` | object | Chi tiết sự kiện, danh sách phân trang hoặc kết quả xóa |
| `timestamp` | string | Thời gian phản hồi, ISO 8601 UTC |

Các ví dụ dưới đây là **toàn bộ response**, gồm cả lớp bọc. Thời gian, ID và tên file là dữ liệu minh họa.

### Các trường của sự kiện trong data

| Trường | Kiểu JSON | Ý nghĩa |
| --- | --- | --- |
| `event_id` | string | ID server sinh |
| `name` | string | Tên sự kiện |
| `shortDescription` | string hoặc null | Mô tả ngắn |
| `description` | string hoặc null | Nội dung mô tả |
| `thumbnailUrl` | string hoặc null | Đường dẫn API ảnh đại diện; tạo mới thành công có URL |
| `bannerUrl` | string hoặc null | Đường dẫn API banner; tạo mới thành công có URL |
| `startTime` | string | Thời gian bắt đầu, ISO 8601 UTC |
| `endTime` | string | Thời gian kết thúc, ISO 8601 UTC |
| `venueName` | string | Tên địa điểm |
| `address` | string | Địa chỉ |
| `categoryId` | string | ID category; response không kèm đối tượng category |
| `status` | string | `draft`, `published` hoặc `cancelled` |
| `isPinned` | boolean | Cờ ghim lưu trong database; sự kiện kết thúc có thể vẫn giữ cờ nhưng không chiếm suất/hiển thị trong danh sách ghim |
| `pinnedAt` | string hoặc null | Thời gian ghim ISO 8601 UTC; null khi chưa ghim hoặc đã bỏ ghim |
| `phase` | string | `upcoming`, `ongoing` hoặc `ended`, tính lúc trả response |
| `createdBy` | string | ID người tạo; có trong POST/PATCH (bao gồm ghim) và API manage; vắng mặt trong API public |
| `createdAt` | string | Thời gian tạo, ISO 8601 UTC |
| `updatedAt` | string | Thời gian cập nhật, ISO 8601 UTC |

`phase`: trước startTime là upcoming; từ startTime tới trước endTime là ongoing; từ endTime trở đi là ended. Phase được tính độc lập với status.

<a id="create"></a>
## 1. POST /api/events — Tạo sự kiện

**Quyền:** ADMIN, MODERATOR. **Content-Type:** `multipart/form-data`. Không có path param hoặc query nghiệp vụ.

### Tham số body

| Field | Kiểu | Bắt buộc | Quy tắc | Ví dụ |
| --- | --- | --- | --- | --- |
| `name` | string | Có | Trim, 1–255 ký tự | Concert mùa thu 2026 |
| `shortDescription` | string | Không | Tối đa 500 ký tự; bỏ qua lưu null | Đêm nhạc trực tiếp |
| `description` | string | Không | Tối đa 20.000 ký tự; bỏ qua lưu null; hiển thị dạng văn bản | Thông tin chi tiết về chương trình. |
| `startTime` | string | Có | ISO 8601 có múi giờ | `2026-11-20T19:00:00+07:00` |
| `endTime` | string | Có | ISO 8601 có múi giờ, lớn hơn startTime | `2026-11-20T23:00:00+07:00` |
| `venueName` | string | Có | Trim, 1–255 ký tự | Nhà hát thành phố |
| `address` | string | Có | Trim, 1–500 ký tự | Hà Nội |
| `categoryId` | string | Có | 1–40 ký tự; ID category tồn tại và đang hoạt động | `event_cat_music` |
| `status` | string | Không | draft hoặc published; mặc định draft | `published` |
| `thumbnail` | File | Có | Đúng 1 ảnh JPEG/PNG/GIF/WebP | `thumbnail.jpg` |
| `banner` | File | Có | Đúng 1 ảnh JPEG/PNG/GIF/WebP | `banner.png` |

Ảnh tối đa 10 MB/file theo mặc định; cấu hình bằng `UPLOAD_MAX_FILE_SIZE_MB`. Cả hai ảnh đều bắt buộc kể cả tạo draft. Nếu status là published, startTime phải ở tương lai. Request chỉ gửi các field trong bảng; ID, URL ảnh và createdBy do server xác định.

### Response 201

```json
{
  "success": true,
  "statusCode": 201,
  "message": "Request successful",
  "data": {
    "event_id": "event_k8m2n4p6q8r0s2t4",
    "name": "Concert mùa thu 2026",
    "shortDescription": "Đêm nhạc trực tiếp",
    "description": "Thông tin chi tiết về chương trình.",
    "thumbnailUrl": "/api/events/event_k8m2n4p6q8r0s2t4/images/thumbnail?file=9c7e3f81-a1b2-4c3d-8e5f-0a1b2c3d4e5f.jpg",
    "bannerUrl": "/api/events/event_k8m2n4p6q8r0s2t4/images/banner?file=4a2b1c8e-5f6a-4b3c-9d0e-1f2a3b4c5d6e.png",
    "startTime": "2026-11-20T12:00:00.000Z",
    "endTime": "2026-11-20T16:00:00.000Z",
    "venueName": "Nhà hát thành phố",
    "address": "Hà Nội",
    "categoryId": "event_cat_music",
    "status": "published",
    "phase": "upcoming",
    "createdBy": "user_7f8a9b0c1d2e3f4a",
    "createdAt": "2026-10-05T03:00:00.000Z",
    "updatedAt": "2026-10-05T03:00:00.000Z",
    "isPinned": false,
    "pinnedAt": null
  },
  "timestamp": "2026-10-05T04:00:00.000Z"
}
```

<a id="list-public"></a>
## 2. GET /api/events — Danh sách công khai

**Quyền:** Public. Không có body hoặc path param. Ví dụ:

```http
GET /api/events?page=1&limit=20&q=Concert&categoryId=event_cat_music&phase=upcoming
```

### Tham số query

| Query | Kiểu | Bắt buộc | Mặc định | Ý nghĩa/giới hạn |
| --- | --- | --- | --- | --- |
| `page` | integer | Không | `1` | Từ 1 đến 100000 |
| `limit` | integer | Không | `20` | Từ 1 đến 100 |
| `q` | string | Không | Không lọc tên | Trim, tối đa 255 ký tự; tìm chuỗi trong tên, không phân biệt hoa thường; rỗng thì không lọc |
| `categoryId` | string | Không | Tất cả category | 1–40 ký tự, lọc theo ID category |
| `phase` | string | Không | Tất cả giai đoạn | `upcoming`, `ongoing`, `ended` |

Danh sách public chỉ chứa published và không nhận query status. Sắp theo startTime tăng dần, rồi event_id tăng dần. Category ngừng hoạt động không tự làm ẩn các event đã công bố.

### Response 200

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Request successful",
  "data": {
    "items": [
      {
        "event_id": "event_k8m2n4p6q8r0s2t4",
        "name": "Concert mùa thu 2026",
        "shortDescription": "Đêm nhạc trực tiếp",
        "description": "Thông tin chi tiết về chương trình.",
        "thumbnailUrl": "/api/events/event_k8m2n4p6q8r0s2t4/images/thumbnail?file=9c7e3f81-a1b2-4c3d-8e5f-0a1b2c3d4e5f.jpg",
        "bannerUrl": "/api/events/event_k8m2n4p6q8r0s2t4/images/banner?file=4a2b1c8e-5f6a-4b3c-9d0e-1f2a3b4c5d6e.png",
        "startTime": "2026-11-20T12:00:00.000Z",
        "endTime": "2026-11-20T16:00:00.000Z",
        "venueName": "Nhà hát thành phố",
        "address": "Hà Nội",
        "categoryId": "event_cat_music",
        "status": "published",
        "phase": "upcoming",
        "createdAt": "2026-10-05T03:00:00.000Z",
        "updatedAt": "2026-10-05T03:00:00.000Z",
        "isPinned": false,
        "pinnedAt": null
      }
    ],
    "total": 1,
    "page": 1,
    "limit": 20
  },
  "timestamp": "2026-10-05T04:00:00.000Z"
}
```

| Trường trong data | Kiểu | Ý nghĩa |
| --- | --- | --- |
| `items` | array | Các sự kiện của trang hiện tại, theo bảng trường ở trên |
| `total` | number | Tổng số sự kiện khớp bộ lọc trước phân trang |
| `page` | number | Trang đang lấy |
| `limit` | number | Số phần tử tối đa mỗi trang |

Không có trường totalPages; FE tính `Math.ceil(total / limit)` nếu cần. Khi không có kết quả, items là `[]`, total là `0`. Khi trang vượt số trang thực tế, items là `[]` và total vẫn là tổng bản ghi khớp bộ lọc.

<a id="detail-public"></a>
## 3. GET /api/events/:id — Chi tiết công khai

**Quyền:** Public. Đọc được published/cancelled. Không có body hoặc query nghiệp vụ.

| Path param | Kiểu | Bắt buộc | Ý nghĩa |
| --- | --- | --- | --- |
| `id` | string | Có | Giá trị `event_id` của sự kiện, ví dụ `event_k8m2n4p6q8r0s2t4` |

### Response 200

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Request successful",
  "data": {
    "event_id": "event_k8m2n4p6q8r0s2t4",
    "name": "Concert mùa thu 2026",
    "shortDescription": "Đêm nhạc trực tiếp",
    "description": "Thông tin chi tiết về chương trình.",
    "thumbnailUrl": "/api/events/event_k8m2n4p6q8r0s2t4/images/thumbnail?file=9c7e3f81-a1b2-4c3d-8e5f-0a1b2c3d4e5f.jpg",
    "bannerUrl": "/api/events/event_k8m2n4p6q8r0s2t4/images/banner?file=4a2b1c8e-5f6a-4b3c-9d0e-1f2a3b4c5d6e.png",
    "startTime": "2026-11-20T12:00:00.000Z",
    "endTime": "2026-11-20T16:00:00.000Z",
    "venueName": "Nhà hát thành phố",
    "address": "Hà Nội",
    "categoryId": "event_cat_music",
    "status": "published",
    "phase": "upcoming",
    "createdAt": "2026-10-05T03:00:00.000Z",
    "updatedAt": "2026-10-05T03:00:00.000Z",
    "isPinned": false,
    "pinnedAt": null
  },
  "timestamp": "2026-10-05T04:00:00.000Z"
}
```

Nếu sự kiện đã hủy, cùng cấu trúc trên có `status: "cancelled"`. Public không có createdBy.

<a id="list-manage"></a>
## 4. GET /api/events/manage — Danh sách quản lý

**Quyền:** ADMIN, MODERATOR; gửi Bearer token. Không có body hoặc path param.

### Tham số query

| Query | Kiểu | Bắt buộc | Mặc định | Ý nghĩa/giới hạn |
| --- | --- | --- | --- | --- |
| `page` | integer | Không | `1` | Từ 1 đến 100000 |
| `limit` | integer | Không | `20` | Từ 1 đến 100 |
| `q` | string | Không | Không lọc tên | Trim, tối đa 255 ký tự; tìm chuỗi trong tên, không phân biệt hoa thường; rỗng thì không lọc |
| `categoryId` | string | Không | Tất cả category | 1–40 ký tự, lọc theo ID category |
| `phase` | string | Không | Tất cả giai đoạn | `upcoming`, `ongoing`, `ended` |
| `status` | string | Không | Mọi trạng thái | `draft`, `published` hoặc `cancelled` |

Ví dụ:

```http
GET /api/events/manage?status=draft&page=1&limit=20&q=Concert
Authorization: Bearer <accessToken>
```

Phạm vi gồm mọi người tạo. Sắp xếp và ý nghĩa phân trang giống danh sách public.

### Response 200

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Request successful",
  "data": {
    "items": [
      {
        "event_id": "event_k8m2n4p6q8r0s2t4",
        "name": "Concert mùa thu 2026",
        "shortDescription": "Đêm nhạc trực tiếp",
        "description": "Thông tin chi tiết về chương trình.",
        "thumbnailUrl": "/api/events/event_k8m2n4p6q8r0s2t4/images/thumbnail?file=9c7e3f81-a1b2-4c3d-8e5f-0a1b2c3d4e5f.jpg",
        "bannerUrl": "/api/events/event_k8m2n4p6q8r0s2t4/images/banner?file=4a2b1c8e-5f6a-4b3c-9d0e-1f2a3b4c5d6e.png",
        "startTime": "2026-11-20T12:00:00.000Z",
        "endTime": "2026-11-20T16:00:00.000Z",
        "venueName": "Nhà hát thành phố",
        "address": "Hà Nội",
        "categoryId": "event_cat_music",
        "status": "draft",
        "phase": "upcoming",
        "createdBy": "user_7f8a9b0c1d2e3f4a",
        "createdAt": "2026-10-05T03:00:00.000Z",
        "updatedAt": "2026-10-05T03:00:00.000Z",
        "isPinned": false,
        "pinnedAt": null
      }
    ],
    "total": 1,
    "page": 1,
    "limit": 20
  },
  "timestamp": "2026-10-05T04:00:00.000Z"
}
```

Mỗi item có createdBy; danh sách có thể gồm draft, published và cancelled theo bộ lọc.

<a id="detail-manage"></a>
## 5. GET /api/events/manage/:id — Chi tiết quản lý

**Quyền:** ADMIN, MODERATOR; gửi Bearer token. Đọc mọi trạng thái. Không có body hoặc query nghiệp vụ.

| Path param | Kiểu | Bắt buộc | Ý nghĩa |
| --- | --- | --- | --- |
| `id` | string | Có | Giá trị `event_id` của sự kiện, ví dụ `event_k8m2n4p6q8r0s2t4` |

### Response 200

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Request successful",
  "data": {
    "event_id": "event_k8m2n4p6q8r0s2t4",
    "name": "Concert mùa thu 2026",
    "shortDescription": "Đêm nhạc trực tiếp",
    "description": "Thông tin chi tiết về chương trình.",
    "thumbnailUrl": "/api/events/event_k8m2n4p6q8r0s2t4/images/thumbnail?file=9c7e3f81-a1b2-4c3d-8e5f-0a1b2c3d4e5f.jpg",
    "bannerUrl": "/api/events/event_k8m2n4p6q8r0s2t4/images/banner?file=4a2b1c8e-5f6a-4b3c-9d0e-1f2a3b4c5d6e.png",
    "startTime": "2026-11-20T12:00:00.000Z",
    "endTime": "2026-11-20T16:00:00.000Z",
    "venueName": "Nhà hát thành phố",
    "address": "Hà Nội",
    "categoryId": "event_cat_music",
    "status": "draft",
    "phase": "upcoming",
    "createdBy": "user_7f8a9b0c1d2e3f4a",
    "createdAt": "2026-10-05T03:00:00.000Z",
    "updatedAt": "2026-10-05T03:00:00.000Z",
    "isPinned": false,
    "pinnedAt": null
  },
  "timestamp": "2026-10-05T04:00:00.000Z"
}
```

URL thumbnailUrl/bannerUrl vẫn là URL ảnh public. Với draft, sử dụng [API ảnh quản lý](#image-manage) kèm Bearer token để preview.

<a id="update"></a>
## 6. PATCH /api/events/:id — Cập nhật sự kiện

**Quyền:** ADMIN, MODERATOR; gửi Bearer token. Content-Type là `application/json` khi chỉ sửa nội dung hoặc `multipart/form-data` khi thay ảnh. Không có query nghiệp vụ.

| Path param | Kiểu | Bắt buộc | Ý nghĩa |
| --- | --- | --- | --- |
| `id` | string | Có | Giá trị `event_id` của sự kiện, ví dụ `event_k8m2n4p6q8r0s2t4` |

### Tham số body

| Field | Kiểu | Bắt buộc | Quy tắc cập nhật |
| --- | --- | --- | --- |
| `name` | string | Không | Trim, 1–255 ký tự |
| `shortDescription` | string hoặc null | Không | Tối đa 500 ký tự; null trong JSON hoặc chuỗi rỗng để xóa nội dung |
| `description` | string hoặc null | Không | Tối đa 20.000 ký tự; null trong JSON hoặc chuỗi rỗng để xóa nội dung |
| `startTime` | string | Không | ISO 8601 có múi giờ |
| `endTime` | string | Không | ISO 8601 có múi giờ; lớn hơn startTime sau khi kết hợp dữ liệu cũ và mới |
| `venueName` | string | Không | Trim, 1–255 ký tự |
| `address` | string | Không | Trim, 1–500 ký tự |
| `categoryId` | string | Không | 1–40 ký tự, category mới phải tồn tại/active |
| `status` | string | Không | draft/published/cancelled theo vòng đời bên dưới; bỏ qua giữ nguyên |
| `thumbnail` | File | Không | Chỉ multipart, tối đa một ảnh JPEG/PNG/GIF/WebP |
| `banner` | File | Không | Chỉ multipart, tối đa một ảnh JPEG/PNG/GIF/WebP |

Gửi ít nhất một field hoặc ảnh. Field bỏ qua giữ nguyên, bao gồm status và ảnh còn lại. Các field bắt buộc của POST không nhận null. Hai field mô tả không tự trim; chuỗi rỗng và null được lưu đúng giá trị gửi. Ảnh giữ giới hạn dung lượng như POST.

Ví dụ sửa nội dung bằng JSON:

```json
{
  "name": "Concert mùa thu 2026 — cập nhật",
  "shortDescription": null
}
```

Ví dụ thay một ảnh bằng form-data:

| Key | Loại trong Postman | Giá trị |
| --- | --- | --- |
| `thumbnail` | File | Chọn thumbnail mới |

Vòng đời cho phép draft → published → cancelled; gửi cùng trạng thái giữ trạng thái đó. Khi công bố draft, category phải active và startTime phải ở tương lai. Published đã bắt đầu chỉ được hủy trước endTime bằng body chỉ có status; cancelled không sửa tiếp.

Ví dụ công bố:

```json
{
  "status": "published"
}
```

Ví dụ hủy:

```json
{
  "status": "cancelled"
}
```

### Response 200

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Request successful",
  "data": {
    "event_id": "event_k8m2n4p6q8r0s2t4",
    "name": "Concert mùa thu 2026 — cập nhật",
    "shortDescription": null,
    "description": "Thông tin chi tiết về chương trình.",
    "thumbnailUrl": "/api/events/event_k8m2n4p6q8r0s2t4/images/thumbnail?file=9c7e3f81-a1b2-4c3d-8e5f-0a1b2c3d4e5f.jpg",
    "bannerUrl": "/api/events/event_k8m2n4p6q8r0s2t4/images/banner?file=4a2b1c8e-5f6a-4b3c-9d0e-1f2a3b4c5d6e.png",
    "startTime": "2026-11-20T12:00:00.000Z",
    "endTime": "2026-11-20T16:00:00.000Z",
    "venueName": "Nhà hát thành phố",
    "address": "Hà Nội",
    "categoryId": "event_cat_music",
    "status": "published",
    "phase": "upcoming",
    "createdBy": "user_7f8a9b0c1d2e3f4a",
    "createdAt": "2026-10-05T03:00:00.000Z",
    "updatedAt": "2026-10-05T04:00:00.000Z",
    "isPinned": false,
    "pinnedAt": null
  },
  "timestamp": "2026-10-05T04:00:00.000Z"
}
```

Response trả đầy đủ dữ liệu sau cập nhật, kể cả các field không sửa. Thay ảnh cập nhật URL tương ứng; createdBy vẫn là người tạo ban đầu. Công bố/hủy có cùng cấu trúc response, với status mới.

<a id="delete"></a>
## 7. DELETE /api/events/:id — Xóa sự kiện

**Quyền:** ADMIN, MODERATOR; gửi Bearer token. Không có body hoặc query nghiệp vụ.

| Path param | Kiểu | Bắt buộc | Ý nghĩa |
| --- | --- | --- | --- |
| `id` | string | Có | Giá trị `event_id` của sự kiện, ví dụ `event_k8m2n4p6q8r0s2t4` |

Cho phép xóa ở mọi trạng thái, kể cả published/cancelled, với điều kiện không có khóa ngoại nghiệp vụ khác ngăn xóa. Xóa thành công khỏi database rồi dọn hai ảnh local.

### Response 200

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Request successful",
  "data": {
    "event_id": "event_k8m2n4p6q8r0s2t4",
    "message": "Event deleted"
  },
  "timestamp": "2026-10-05T04:00:00.000Z"
}
```

Data gồm `event_id` (string, ID đã xóa) và `message` (string, `Event deleted`).

<a id="image-public"></a>
## 8. GET /api/events/:id/images/:kind — Ảnh công khai

**Quyền:** Public. Phục vụ ảnh của published/cancelled. Không có body.

| Path param | Kiểu | Bắt buộc | Ý nghĩa |
| --- | --- | --- | --- |
| `id` | string | Có | Giá trị `event_id` của sự kiện, ví dụ `event_k8m2n4p6q8r0s2t4` |
| `kind` | string | Có | `thumbnail` hoặc `banner` |

Không cần query. URL trong response có thể kèm `?file=<uuid>.jpg`; server lấy tên file từ bản ghi database, không dùng query do client gửi để chọn file.

Ví dụ:

```http
GET /api/events/event_k8m2n4p6q8r0s2t4/images/thumbnail
```

### Response ảnh

Response thành công **200**, body là byte của file ảnh. Các header do controller đặt:

| Header | Giá trị |
| --- | --- |
| `Content-Type` | `image/jpeg`, `image/png`, `image/gif` hoặc `image/webp`, theo ảnh lưu thực tế |
| `X-Content-Type-Options` | `nosniff` |
| `Cache-Control` | `no-store` |

Ví dụ với ảnh JPEG:

```http
HTTP/1.1 200 OK
Content-Type: image/jpeg
X-Content-Type-Options: nosniff
Cache-Control: no-store

<byte của file JPEG>
```

Response ảnh không có các trường JSON `success`, `data`, `timestamp`.

<a id="image-manage"></a>
## 9. GET /api/events/manage/:id/images/:kind — Ảnh quản lý

**Quyền:** ADMIN, MODERATOR; gửi Bearer token. Đọc được ảnh mọi trạng thái, kể cả draft. Không có body hoặc query nghiệp vụ.

| Path param | Kiểu | Bắt buộc | Ý nghĩa |
| --- | --- | --- | --- |
| `id` | string | Có | Giá trị `event_id` của sự kiện, ví dụ `event_k8m2n4p6q8r0s2t4` |
| `kind` | string | Có | `thumbnail` hoặc `banner` |

Ví dụ:

```http
GET /api/events/manage/event_k8m2n4p6q8r0s2t4/images/banner
Authorization: Bearer <accessToken>
```

### Response ảnh

Response thành công **200**, body là byte của file ảnh. Các header do controller đặt:

| Header | Giá trị |
| --- | --- |
| `Content-Type` | `image/jpeg`, `image/png`, `image/gif` hoặc `image/webp`, theo ảnh lưu thực tế |
| `X-Content-Type-Options` | `nosniff` |
| `Cache-Control` | `no-store` |

Ví dụ với ảnh JPEG:

```http
HTTP/1.1 200 OK
Content-Type: image/jpeg
X-Content-Type-Options: nosniff
Cache-Control: no-store

<byte của file JPEG>
```

Response ảnh không có các trường JSON `success`, `data`, `timestamp`.

FE có thể fetch ảnh quản lý với Authorization rồi dùng Blob URL để preview. Đường dẫn quản lý không tự thay thế thumbnailUrl/bannerUrl trong JSON.


<a id="pinned"></a>
## 10. GET /api/events/pinned — Danh sách sự kiện ghim

**Quyền:** Public, không cần đăng nhập. Không có path param, body hoặc query nghiệp vụ.
Giới hạn cố định 4; không nhận lựa chọn phân trang hay số lượng từ client.

Chỉ trả sự kiện có isPinned=true, status=published và endTime lớn hơn thời gian hiện tại.
Bao gồm sắp/đang diễn ra; sự kiện kết thúc/hủy không được trả về. Sắp pinnedAt giảm dần,
rồi event_id tăng dần. Không tự bù sự kiện chưa ghim khi thiếu 4 phần tử.

### Response 200

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Request successful",
  "data": [
    {
      "event_id": "event_k8m2n4p6q8r0s2t4",
      "name": "Concert mùa thu 2026",
      "shortDescription": "Đêm nhạc trực tiếp",
      "description": "Thông tin chi tiết về chương trình.",
      "thumbnailUrl": "/api/events/event_k8m2n4p6q8r0s2t4/images/thumbnail?file=9c7e3f81-a1b2-4c3d-8e5f-0a1b2c3d4e5f.jpg",
      "bannerUrl": "/api/events/event_k8m2n4p6q8r0s2t4/images/banner?file=4a2b1c8e-5f6a-4b3c-9d0e-1f2a3b4c5d6e.png",
      "startTime": "2026-11-20T12:00:00.000Z",
      "endTime": "2026-11-20T16:00:00.000Z",
      "venueName": "Nhà hát thành phố",
      "address": "Hà Nội",
      "categoryId": "event_cat_music",
      "status": "published",
      "phase": "upcoming",
      "createdAt": "2026-10-05T03:00:00.000Z",
      "updatedAt": "2026-10-05T03:00:00.000Z",
      "isPinned": true,
      "pinnedAt": "2026-10-05T04:00:00.000Z"
    }
  ],
  "timestamp": "2026-10-05T04:00:00.000Z"
}
```

Data là mảng sự kiện public đầy đủ, không có createdBy hoặc các trường phân trang.
Nếu không có sự kiện phù hợp, data là [].

<a id="pin"></a>
## 11. PATCH /api/events/:id/pin — Ghim hoặc bỏ ghim

**Quyền:** ADMIN, MODERATOR quản lý mọi sự kiện.
Gửi Authorization: Bearer <accessToken> và Content-Type: application/json.
Không có query nghiệp vụ; không upload ảnh ở API này.

| Tham số | Vị trí | Kiểu | Bắt buộc | Ý nghĩa |
| --- | --- | --- | --- | --- |
| `id` | Path | string | Có | event_id của sự kiện |
| `isPinned` | Body | boolean | Có | true để ghim, false để bỏ ghim |

Body chỉ có isPinned; dùng boolean JSON, không dùng chuỗi "true"/"false", null hoặc số.
pinnedAt do server đặt. API POST/PATCH nội dung sự kiện không nhận hai trường ghim.

Ví dụ ghim:

```json
{ "isPinned": true }
```

Ví dụ bỏ ghim:

```json
{ "isPinned": false }
```

Tối đa 4 suất ghim còn hiệu lực. Ghim chỉ áp dụng cho published chưa kết thúc,
kể cả đang diễn ra. Bỏ ghim được ở mọi trạng thái. Khi đủ suất, không tự thay thế sự kiện khác.
Gửi true lại cho sự kiện đang ghim và còn hiệu lực giữ nguyên pinnedAt, không đổi thứ tự.
Muốn đưa lên đầu thì bỏ ghim rồi ghim lại.

### Response 200

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Request successful",
  "data": {
    "event_id": "event_k8m2n4p6q8r0s2t4",
    "name": "Concert mùa thu 2026",
    "shortDescription": "Đêm nhạc trực tiếp",
    "description": "Thông tin chi tiết về chương trình.",
    "thumbnailUrl": "/api/events/event_k8m2n4p6q8r0s2t4/images/thumbnail?file=9c7e3f81-a1b2-4c3d-8e5f-0a1b2c3d4e5f.jpg",
    "bannerUrl": "/api/events/event_k8m2n4p6q8r0s2t4/images/banner?file=4a2b1c8e-5f6a-4b3c-9d0e-1f2a3b4c5d6e.png",
    "startTime": "2026-11-20T12:00:00.000Z",
    "endTime": "2026-11-20T16:00:00.000Z",
    "venueName": "Nhà hát thành phố",
    "address": "Hà Nội",
    "categoryId": "event_cat_music",
    "status": "published",
    "phase": "upcoming",
    "createdBy": "user_7f8a9b0c1d2e3f4a",
    "createdAt": "2026-10-05T03:00:00.000Z",
    "updatedAt": "2026-10-05T03:00:00.000Z",
    "isPinned": true,
    "pinnedAt": "2026-10-05T04:00:00.000Z"
  },
  "timestamp": "2026-10-05T04:00:00.000Z"
}
```

Bỏ ghim trả cùng cấu trúc với isPinned=false và pinnedAt=null.
Response có createdBy như các thao tác quản lý khác.

### Hiệu lực và triển khai

Giới hạn 4 tính các sự kiện đang có hiệu lực, không phải tổng số cờ isPinned=true
trong database. Hết endTime tự ngừng hiển thị/chiếm suất dù cờ lưu còn nguyên;
không chạy job nền. Hủy sự kiện đặt isPinned=false và pinnedAt=null trong cùng
transaction; xóa sự kiện cũng giải phóng suất.

Ghim/bỏ ghim dùng transaction READ COMMITTED với khóa advisory PostgreSQL chung,
khóa hàng sự kiện rồi mới kiểm tra/đếm/cập nhật. Audit action: events.pin.update.

Khi DB_SYNCHRONIZE tắt, áp dụng [SQL bổ sung](./event-pinning.sql) trước khi chạy
phiên bản backend mới. Dữ liệu cũ mặc định chưa ghim; không cần seed.

## Tài liệu liên quan

- [Vòng đời và lưu trữ của CRUD](./events-crud.md).
- [Collection Postman CRUD](./postman/events-crud.postman_collection.json).
- [Cấu hình Postman local](./postman/local-setup.md).
