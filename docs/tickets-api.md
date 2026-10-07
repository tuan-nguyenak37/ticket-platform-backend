# API Tickets

API quản trị và worker OCR/QR được mô tả tại [Kiểm tra/duyệt vé](./ticket-review-automation.md).

## GET /api/tickets/me — Vé tôi đăng bán

Mọi tài khoản đang hoạt động (USER/MODERATOR/ADMIN), gửi Bearer access token.
Không cần body. Chỉ vé có sellerId bằng principal hiện tại; không nhận sellerId,
buyerId hoặc userId từ client. Đây là vé người dùng đăng bán, chưa phải vé đã mua.

Query page/limit/q/eventId/categoryId/ticketTier/minPrice/maxPrice/sort theo danh
sách công khai bên dưới, thêm status tùy chọn: pending_review/rejected/available/
holding/sold/cancelled/expired. Bỏ status lấy mọi trạng thái, kể cả Event đã hủy
hoặc kết thúc. Mặc định page=1, limit=20, sort=newest; thứ tự phụ ticket_id ASC.

Ví dụ: `GET /api/tickets/me?status=pending_review&page=1&limit=20`.
Response 200 có data={items,total,page,limit}. Không có kết quả thì items=[], total=0.

## GET /api/tickets/me/:id — Chi tiết vé tôi đăng

Cùng quyền đăng nhập; path id là ticket_id, không cần body/query.
Điều kiện chủ sở hữu nằm trong truy vấn database. Vé không tồn tại hoặc thuộc
người khác đều không được trả; ADMIN/MODERATOR không vượt quyền sở hữu ở /me.
Response 200 có data là một item theo cấu trúc dưới đây.

### Cấu trúc item đầy đủ cho hai API /me

```json
{
  "ticket_id": "ticket_example",
  "eventId": "event_example",
  "ticketTier": "VIP",
  "seatInfo": "A15",
  "originalPrice": 1000000,
  "price": 800000,
  "status": "rejected",
  "description": "Pass vé do thay đổi lịch cá nhân.",
  "createdAt": "2026-10-07T08:00:00.000Z",
  "event": {
    "event_id": "event_example",
    "name": "Concert tháng 11",
    "bannerUrl": "/api/events/event_example/images/banner?file=example.png",
    "startTime": "2026-11-20T12:00:00.000Z",
    "endTime": "2026-11-20T16:00:00.000Z",
    "venueName": "Nhà hát thành phố",
    "address": "Hà Nội",
    "categoryId": "event_cat_music"
  },
  "updatedAt": "2026-10-07T09:00:00.000Z",
  "reviewMethod": "manual",
  "verifiedAt": "2026-10-07T09:00:00.000Z",
  "rejectionReason": "Thông tin hạng vé không phù hợp với file.",
  "check": {
    "status": "completed",
    "outcome": "needs_review",
    "version": 1,
    "completedAt": "2026-10-07T08:30:00.000Z"
  }
}
```

JSON giữ envelope success/statusCode/message/data/timestamp. Giá là number, thời
gian ISO UTC. seatInfo/description/bannerUrl/reviewMethod/verifiedAt/rejectionReason
có thể null. Check null với vé cũ chưa có bản ghi kiểm tra; outcome/completedAt
có thể null lúc queued/processing. Outcome là kết quả xử lý hỗ trợ; status Ticket
là trạng thái bán/duyệt chính. Không trả file, QR, OCR, hash/fingerprint, buyerId,
người duyệt hoặc bản đăng trùng của người khác. Không thêm schema riêng cho /me;
dùng schema kiểm tra vé của nhánh hiện tại. Chưa chạy build/TypeScript/test/Newman.

## DELETE /api/tickets/:id — Hủy đăng bán

Yêu cầu đăng nhập, header `Authorization: Bearer <accessToken>`. Không cần body
hoặc query. Path `id` là `ticket_id` trả về khi tạo vé.

Chỉ chủ vé được gọi, kể cả ADMIN/MODERATOR cũng chỉ hủy vé của chính mình.
Cho phép hủy khi pending_review, rejected hoặc available. Holding, sold, expired
và cancelled không được chuyển trạng thái bằng API này; gọi lặp sau khi hủy
không được coi là một lần hủy thành công mới.

API đổi status sang cancelled, giữ bản ghi, thông tin kiểm duyệt và file vé.
Không xóa vật lý. Vé đã hủy không còn xuất hiện trong danh sách công khai.
Quyền sở hữu và trạng thái được kiểm tra trong cùng câu UPDATE để bảo vệ thao
tác hủy khi có cập nhật đồng thời. Các luồng giữ/mua vé sau này cũng phải dùng
cập nhật có điều kiện trạng thái, tránh ghi đè vé đã hủy bằng dữ liệu cũ.
Audit action: `tickets.cancel`.

### Response 200

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Request successful",
  "data": {
    "ticket_id": "ticket_example",
    "status": "cancelled"
  },
  "timestamp": "2026-10-06T10:00:00.000Z"
}
```

## GET /api/tickets

Public, không cần token hoặc body. Base URL local: `http://localhost:7000`.
Chỉ lấy vé `available` của sự kiện `published` có `endTime` lớn hơn thời gian
server tại lúc truy vấn, bao gồm sự kiện đang diễn ra. Vé vừa đăng còn
`pending_review` nên chưa xuất hiện. Đây không phải API "Vé của tôi".

### Query parameters

Tất cả đều tùy chọn. Các bộ lọc kết hợp bằng AND.

| Tham số | Kiểu | Quy tắc |
| --- | --- | --- |
| `page` | integer | Mặc định 1, từ 1–100000 |
| `limit` | integer | Mặc định 20, từ 1–100 |
| `categoryId` | string | ID danh mục của sự kiện, trim, 1–40 ký tự |
| `eventId` | string | ID sự kiện, trim, 1–40 ký tự |
| `ticketTier` | string | Hạng vé, trim, 1–100 ký tự; khớp toàn bộ, không phân biệt hoa thường |
| `minPrice` | number | Giá bán tối thiểu, bao gồm giá bằng giá trị này |
| `maxPrice` | number | Giá bán tối đa, bao gồm giá bằng giá trị này |
| `q` | string | Trim, tối đa 100 ký tự; tìm chuỗi con trong tên sự kiện HOẶC hạng vé |
| `sort` | enum | `newest` (mặc định), `price_asc`, `price_desc`, `event_soonest` |

Giá trong khoảng 0–1.000.000.000, tối đa 2 chữ số thập phân; minPrice phải
nhỏ hơn hoặc bằng maxPrice. Chỉ gửi các tham số trong bảng, không có lọc status
hay sellerId ở API công khai.

`categoryId` lấy từ `GET /api/event-categories`. `ticketTier=VIP` khớp VIP/vip,
không khớp "VIP Khán đài A"; muốn tìm rộng dùng `q=VIP`. Hạng vé hiện là văn bản
do người bán nhập, chưa có danh mục hạng vé chuẩn hóa hoặc endpoint lấy các hạng vé.

Tìm kiếm q không phân biệt hoa thường, có phân biệt dấu. `%` và `_` là ký tự
thông thường, không phải wildcard. q rỗng sau trim không áp dụng tìm kiếm.
Chưa hỗ trợ tìm gần đúng, tự sửa lỗi chính tả hoặc xếp hạng theo độ liên quan.

Thứ tự: ngày đăng giảm dần / giá tăng dần / giá giảm dần / thời gian bắt đầu sự
kiện tăng dần tương ứng với sort. Khi trùng giá trị, sắp ticket_id tăng dần.
Phân trang dùng page/limit; dữ liệu đang bán có thể thay đổi giữa các lần gọi.

### Ví dụ

```http
GET /api/tickets?categoryId=event_cat_music&ticketTier=VIP&minPrice=500000&maxPrice=1000000&sort=price_asc&page=1&limit=20
```

```http
GET /api/tickets?q=concert&sort=event_soonest
```

### Response 200

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Request successful",
  "data": {
    "items": [
      {
        "ticket_id": "ticket_example",
        "eventId": "event_example",
        "ticketTier": "VIP",
        "seatInfo": "A15",
        "originalPrice": 1000000,
        "price": 800000,
        "status": "available",
        "description": "Pass lại vé do thay đổi lịch cá nhân.",
        "createdAt": "2026-10-06T08:00:00.000Z",
        "event": {
          "event_id": "event_example",
          "name": "Concert tháng 11",
          "bannerUrl": "/api/events/event_example/images/banner?file=example.png",
          "startTime": "2026-11-20T12:00:00.000Z",
          "endTime": "2026-11-20T16:00:00.000Z",
          "venueName": "Nhà hát thành phố",
          "address": "Hà Nội",
          "categoryId": "event_cat_music"
        }
      }
    ],
    "total": 1,
    "page": 1,
    "limit": 20
  },
  "timestamp": "2026-10-06T09:00:00.000Z"
}
```

`total` là tổng số vé khớp trước phân trang. Không có kết quả thì items=[], total=0;
trang vượt kết quả trả items=[] nhưng total giữ số vé khớp. seatInfo, description
và event.bannerUrl có thể null. Giá trả dạng number; thời gian theo ISO 8601 UTC.
Không trả file vé, QR, sellerId, buyerId hoặc thông tin kiểm duyệt.

## Phạm vi và xác minh

Lọc, sắp xếp và phân trang tại database; join sự kiện trong cùng truy vấn dữ liệu,
không gọi thêm một truy vấn cho mỗi vé. Chỉ chọn các cột công khai cần trả.
Tìm chuỗi con hiện phù hợp bước đầu; chưa đo hiệu năng trên dữ liệu lớn. Khi dữ
liệu tăng cần đo truy vấn trước khi chọn index tìm kiếm hay cơ chế tìm không dấu.

Theo yêu cầu, không chạy build, TypeScript, test hoặc Newman. Chưa xác minh runtime
PostgreSQL; không chạy migration hoặc seed. Collection local có các request hợp lệ.
