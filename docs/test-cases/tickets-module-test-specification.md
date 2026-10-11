# Báo Cáo Đặc Tả Test Cases & Dữ Liệu Kiểm Thử (Tickets Module)

> **Dự án**: Nền tảng bán lại vé trực tuyến (Ticket Resell Platform)\
> **Module**: Quản lý & Giao dịch Vé (`Tickets Module`)\
> **Framework & Thư viện**: NestJS, Jest, TypeORM, Multer\
> **Tài liệu tham khảo**: [tickets-api.md](../tickets-api.md), [ticket-review-automation.md](../ticket-review-automation.md)

---

## 1. Mục Tiêu & Phạm Vi Kiểm Thử

### 1.1. Mục tiêu
- Đảm bảo quy trình đăng bán vé (`POST /api/tickets`) diễn ra an toàn, có transaction bảo vệ chống race condition, kiểm tra tính hợp lệ của sự kiện và file vé tải lên (PDF/ảnh).
- Đảm bảo cơ chế dọn dẹp file tải lên (file cleanup rollback) hoạt động đúng khi xảy ra lỗi trong quá trình tạo vé trong CSDL.
- Đảm bảo người dùng chỉ xem và hủy được vé của chính mình (`GET /api/tickets/me`, `DELETE /api/tickets/:id`).
- Đảm bảo các vé có trạng thái nhạy cảm (đang giữ `holding` hoặc đã bán `sold`) không thể bị người bán tự ý hủy bỏ.
- Đảm bảo API tìm kiếm vé công khai (`GET /api/tickets`) chỉ trả về các vé khả dụng (`available`) thuộc sự kiện đã phát hành (`published`) và chưa kết thúc.

### 1.2. Danh Mục Mock Data (Dữ Liệu Thử Nghiệm)

| ID Vé | Sự Kiện | Người Bán | Hạng Vé | Giá Gốc | Giá Bán | Trạng Thái | Mô Tả Mục Đích Test |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `tkt_mock_001` | `evt_mock_001` | `usr_seller_001` | VIP 1 | 1.500.000 | 1.200.000 | `available` | Vé hợp lệ đang mở bán công khai |
| `tkt_pending_002` | `evt_mock_001` | `usr_seller_001` | VIP 1 | 1.500.000 | 1.200.000 | `pending_review` | Vé mới tạo đang chờ duyệt quét mã |
| `tkt_sold_003` | `evt_mock_001` | `usr_seller_001` | VIP 1 | 1.500.000 | 1.200.000 | `sold` | Vé đã bán (không cho phép người bán hủy) |
| `tkt_cancelled_004`| `evt_mock_001` | `usr_seller_001` | VIP 1 | 1.500.000 | 1.200.000 | `cancelled` | Vé đã hủy |

---

## 2. Ma Trận Test Cases Chi Tiết (Test Matrix)

### Phân nhóm A: Đăng Bán Vé Mới (`POST /api/tickets`)

| Mã TC | Phân loại | Điều kiện tiên quyết | Dữ liệu đầu vào | Các bước thực hiện | Kết quả mong đợi |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **TC-TKT-01** | Positive | User đã đăng nhập, sự kiện `published` còn hạn | File PDF hợp lệ, DTO đầy đủ | 1. Upload file và gửi form data<br>2. Lưu file và tạo vé trong transaction | - HTTP 201 Created<br>- Trạng thái vé là `pending_review`<br>- Hàng đợi soát vé tự động `TicketCheck` có status `queued` |
| **TC-TKT-02** | Negative | User đã đăng nhập | Không đính kèm file hoặc đính kèm > 1 file | 1. Gửi request không có file | - HTTP 400 Bad Request<br>- Thông báo: 'One PDF ticket file is required' |
| **TC-TKT-03** | Negative | User đã đăng nhập | `eventId` không tồn tại | 1. Gửi request với eventId ảo | - HTTP 404 Not Found<br>- Thông báo: 'Event not found' |
| **TC-TKT-04** | Negative | User đã đăng nhập | Sự kiện ở trạng thái `draft` hoặc `cancelled` | 1. Gửi request tạo vé cho sự kiện chưa publish | - HTTP 400 Bad Request<br>- Thông báo: 'Tickets can only be listed for published events' |
| **TC-TKT-05** | Negative | User đã đăng nhập | Sự kiện đã kết thúc (`endTime <= now`) | 1. Gửi request tạo vé cho sự kiện đã qua | - HTTP 400 Bad Request<br>- Thông báo: 'Cannot list tickets for ended events' |
| **TC-TKT-06** | Rollback | User đã đăng nhập | CSDL phát sinh lỗi khi đang lưu bản ghi vé | 1. Gửi request hợp lệ, mock lỗi DB trong transaction | - Ném lỗi ra ngoài<br>- **Xóa file tạm đã lưu** bằng `uploads.removeTicketFile` |

---

### Phân nhóm B: Hủy Đăng Bán Vé (`DELETE /api/tickets/:id`)

| Mã TC | Phân loại | Điều kiện tiên quyết | Dữ liệu đầu vào | Các bước thực hiện | Kết quả mong đợi |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **TC-TKT-07** | Positive | Người bán sở hữu vé, vé có status `available`, `pending_review` hoặc `rejected` | ID vé hợp lệ | 1. Gửi `DELETE /api/tickets/:id` | - HTTP 200 OK<br>- Trạng thái vé chuyển sang `cancelled` |
| **TC-TKT-08** | Negative | Người dùng không phải là người bán vé | ID vé của người khác | 1. User B gọi hủy vé của User A | - HTTP 404 Not Found<br>- Báo lỗi: 'Ticket not found' (bảo mật không lộ thông tin) |
| **TC-TKT-09** | Conflict | Người bán sở hữu vé, nhưng vé đã `sold` hoặc `holding` | ID vé đã bán | 1. Gửi yêu cầu hủy vé đã bán | - HTTP 409 Conflict<br>- Thông báo: 'Ticket cannot be cancelled in its current state' |

---

### Phân nhóm C: Quản Lý & Xem Vé Cá Nhân (`GET /api/tickets/me*`)

| Mã TC | Phân loại | Điều kiện tiên quyết | Dữ liệu đầu vào | Các bước thực hiện | Kết quả mong đợi |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **TC-TKT-10** | Positive | User đã đăng nhập | Query params: `page=1, limit=10, sort=newest` | 1. Gửi `GET /api/tickets/me` | - HTTP 200 OK<br>- Trả về danh sách vé cá nhân kèm kết quả check vé |
| **TC-TKT-11** | Negative | User đã đăng nhập | Query params: `minPrice=500000, maxPrice=100000` | 1. Gửi khoảng giá không hợp lệ (`min > max`) | - HTTP 400 Bad Request<br>- Thông báo: 'minPrice must not exceed maxPrice' |
| **TC-TKT-12** | Positive | User đã đăng nhập | ID vé cá nhân hợp lệ | 1. Gửi `GET /api/tickets/me/:id` | - HTTP 200 OK<br>- Trả về chi tiết vé cá nhân |
| **TC-TKT-13** | Negative | User đã đăng nhập | ID vé không thuộc sở hữu của mình | 1. Gửi request xem vé người khác bằng endpoint `/me/:id` | - HTTP 404 Not Found<br>- Thông báo: 'Ticket not found' |

---

### Phân nhóm D: Tìm Kiếm & Liệt Kê Vé Công Khai (`GET /api/tickets`)

| Mã TC | Phân loại | Điều kiện tiên quyết | Dữ liệu đầu vào | Các bước thực hiện | Kết quả mong đợi |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **TC-TKT-14** | Positive | Public (không cần đăng nhập) | Query hợp lệ | 1. Gửi `GET /api/tickets` | - HTTP 200 OK<br>- Chỉ trả về vé `available` thuộc sự kiện `published` còn hạn |
| **TC-TKT-15** | Negative | Public | `minPrice > maxPrice` | 1. Gửi query giá sai logic | - HTTP 400 Bad Request<br>- Thông báo: 'minPrice must not exceed maxPrice' |
