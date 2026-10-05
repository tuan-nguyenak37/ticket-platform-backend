# API danh sách thể loại sự kiện

Cập nhật 05/10/2026. API public dùng chung cho trang chủ, bộ lọc tìm kiếm và form tạo/sửa sự kiện.

## Đường dẫn và tham số

```http
GET /api/event-categories
Accept: application/json
```

URL local: `http://localhost:7000/api/event-categories`.

| Thành phần | Yêu cầu |
| --- | --- |
| Quyền | Public, khách và mọi role đều gọi được |
| Authorization | Không cần access token hoặc cookie đăng nhập |
| Path param | Không có |
| Query | Không cần; chưa hỗ trợ tìm kiếm hoặc phân trang category |
| Body | Không có |

Server luôn lọc `isActive = true` tại database. Trả toàn bộ category đang hoạt động,
sắp theo `name ASC`, sau đó `category_id ASC`, theo cách sắp xếp của database.
Không phụ thuộc category đã có sự kiện hay chưa.

## Response thành công

HTTP **200**, dùng lớp bọc JSON chung. `data` là một mảng, không có `items`, `total`, `page` hoặc `limit`.

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Request successful",
  "data": [
    {
      "category_id": "event_cat_music",
      "name": "Âm nhạc",
      "slug": "music",
      "description": "Concert, live show, music festival...",
      "isActive": true
    }
  ],
  "timestamp": "2026-10-05T04:00:00.000Z"
}
```

ID, nội dung và thời gian ở trên là ví dụ, không phải dữ liệu được seed tự động.

| Trường | Kiểu JSON | Ý nghĩa |
| --- | --- | --- |
| `success` | boolean | `true` khi thành công |
| `statusCode` | number | `200` |
| `message` | string | `Request successful` |
| `data` | array | Danh sách category đang hoạt động |
| `data[].category_id` | string | ID category dùng làm giá trị lựa chọn |
| `data[].name` | string | Tên hiển thị trên giao diện |
| `data[].slug` | string | Slug của category |
| `data[].description` | string hoặc null | Mô tả category |
| `data[].isActive` | boolean | Luôn `true` với API này |
| `timestamp` | string | Thời gian trả response, ISO 8601 UTC |

Nếu không có category đang hoạt động, response giữ nguyên cấu trúc và `data` là `[]`.
Response không chứa danh sách sự kiện, số lượng sự kiện hoặc trường khác ngoài DTO trên.

## Dùng ở frontend

- Dropdown: label = `name`, value = `category_id`.
- Tìm kiếm sự kiện: gửi ID đã chọn vào `GET /api/events?categoryId=<category_id>`.
- Form tạo/sửa sự kiện: gửi ID đã chọn vào body field `categoryId`, không gửi slug.
- Category đang hoạt động vẫn hiển thị dù chưa có sự kiện; kết quả tìm sự kiện khi đó có thể rỗng.
- Nếu category ngừng hoạt động sau lúc tải danh sách, API tạo/cập nhật sự kiện vẫn kiểm tra lại category ở backend.

Request Postman: **01 - List active event categories (public)** trong
[collection Events CRUD](./postman/events-crud.postman_collection.json), chọn **No Auth**.

Xem thêm [API sự kiện](./events-api.md).
