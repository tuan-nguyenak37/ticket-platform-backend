# Báo Cáo Đặc Tả Test Cases & Dữ Liệu Kiểm Thử (Orders Module)

> **Dự án**: Nền tảng bán lại vé trực tuyến (Ticket Resell Platform)\
> **Module**: Đặt hàng, Thanh toán & Tranh chấp (`Orders Module`)\
> **Framework & Thư viện**: NestJS, Jest, TypeORM, PostgreSQL\
> **Tài liệu tham khảo**: [orders-api.md](../orders-api.md), [orders-schema.sql](../orders-schema.sql)

---

## 1. Mục Tiêu & Phạm Vi Kiểm Thử

### 1.1. Mục tiêu
- Đảm bảo tính an toàn và tính phi lặp (Idempotency) khi tạo đơn hàng vé bằng `Idempotency-Key`.
- Đảm bảo cơ chế khóa chống tranh chấp (Pessimistic Locking & Transaction Isolation) ngăn chặn việc 2 người mua cùng đặt hoặc thanh toán một vé duy nhất.
- Đảm bảo người dùng không thể tự mua vé do chính mình đăng bán.
- Đảm bảo luồng thanh toán giả lập (`mock payment`), xác nhận thanh toán và tự động bàn giao vé (`delivered`).
- Đảm bảo cơ chế khiếu nại/tranh chấp (`dispute`), thời hạn mở tranh chấp và quy trình xử lý của Quản trị viên/Kiểm duyệt viên (`resolve dispute`).

---

## 2. Danh Mục Mock Data (Dữ Liệu Thử Nghiệm)

| Dữ Liệu Mock | ID / Mã | Trạng Thái | Mục Đích |
| :--- | :--- | :--- | :--- |
| `mockPendingOrder` | `ord_mock_001` | `pending_payment` | Đơn hàng chờ thanh toán trong thời hạn 15 phút |
| `mockPaidOrder` | `ord_paid_002` | `delivered` | Đơn hàng đã thanh toán thành công, vé đã bàn giao |
| `mockDisputedOrder` | `ord_dispute_003` | `disputed` | Đơn hàng phát sinh khiếu nại (vé lỗi cổng soát vé) |
| `mockCompletedOrder` | `ord_completed_004` | `completed` | Đơn hàng hoàn tất sau khi hết hạn mở tranh chấp |
| `mockCancelledOrder` | `ord_cancelled_005` | `cancelled` | Đơn hàng bị người mua hủy trước khi thanh toán |

---

## 3. Ma Trận Test Cases Chi Tiết (Test Matrix)

### Phân nhóm A: Khởi tạo Đơn hàng (`POST /api/orders`)

| Mã TC | Phân loại | Điều kiện | Dữ liệu đầu vào | Kết quả mong đợi |
| :--- | :--- | :--- | :--- | :--- |
| **TC-ORD-01** | Positive | User đã đăng nhập, vé `available`, sự kiện `published` | `ticketId` hợp lệ, header `Idempotency-Key` chuẩn | - HTTP 201 Created<br>- Đơn hàng được tạo ở trạng thái `pending_payment`<br>- Gán `expiresAt` (15 phút) |
| **TC-ORD-02** | Idempotency | Gửi lặp lại cùng một `Idempotency-Key` cho cùng vé | Cùng header key và ticketId | - HTTP 200/201 OK<br>- Trả về đơn hàng cũ đã tạo, không tạo đơn mới |
| **TC-ORD-03** | Conflict | Gửi `Idempotency-Key` cũ cho một `ticketId` khác | Key cũ + Ticket mới | - HTTP 409 Conflict<br>- 'Idempotency-Key already used for another ticket' |
| **TC-ORD-04** | Negative | Người bán cố tình mua vé của chính mình | Vé do chính mình tạo | - HTTP 400 Bad Request<br>- 'Cannot buy your own ticket' |
| **TC-ORD-05** | Conflict | Vé đang ở trạng thái khác `available` hoặc sự kiện đã kết thúc | Vé đã bán hoặc sự kiện quá hạn | - HTTP 409 Conflict<br>- 'Ticket is not available' |
| **TC-ORD-06** | Negative | Thiếu hoặc sai định dạng `Idempotency-Key` | Header key < 8 ký tự hoặc chứa ký tự đặc biệt | - HTTP 400 Bad Request<br>- Báo lỗi validation header key |

### Phân nhóm B: Hủy Đơn & Thanh toán (`POST /api/orders/me/:id/*`)

| Mã TC | Phân loại | Điều kiện | Dữ liệu đầu vào | Kết quả mong đợi |
| :--- | :--- | :--- | :--- | :--- |
| **TC-ORD-07** | Positive | Người mua hủy đơn đang `pending_payment` | Order ID của mình | - HTTP 200 OK<br>- Trạng thái chuyển sang `cancelled` |
| **TC-ORD-08** | Conflict | Người mua cố hủy đơn đã thanh toán hoặc đã hủy | Order ID đơn đã thanh toán | - HTTP 409 Conflict<br>- 'Only pending orders can be cancelled' |
| **TC-ORD-09** | Positive | Bắt đầu thanh toán giả lập | Order ID hợp lệ | - HTTP 200 OK<br>- Tạo bản ghi `order_payments` trạng thái `pending` |
| **TC-ORD-10** | Positive | Gửi kết quả thanh toán `success` | Result: 'success' | - HTTP 200 OK<br>- Đơn chuyển `paid`, bàn giao vé, cấp thời hạn dispute |

### Phân nhóm C: Tranh chấp & Quản trị (`/api/orders/.../dispute*`)

| Mã TC | Phân loại | Điều kiện | Dữ liệu đầu vào | Kết quả mong đợi |
| :--- | :--- | :--- | :--- | :--- |
| **TC-ORD-11** | Positive | Người mua mở tranh chấp trong thời hạn hợp lệ | Reason và Evidence đầy đủ | - HTTP 201 Created<br>- Đơn chuyển sang `disputed`, phong tỏa payout |
| **TC-ORD-12** | Conflict | Mở tranh chấp khi đã quá thời hạn `disputeUntil` | Thời gian vượt quá hạn | - HTTP 409 Conflict<br>- 'Dispute window is closed' |
| **TC-ORD-13** | Positive | Người bán gửi phản hồi/giải trình tranh chấp | Response text | - HTTP 200 OK<br>- Cập nhật `sellerResponse` |
| **TC-ORD-14** | Positive | Admin giải quyết tranh chấp (chấp thuận hoàn tiền) | Decision: 'accept', Note | - HTTP 200 OK<br>- Đơn chuyển sang `refunded` hoặc `completed` tương ứng |
