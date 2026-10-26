# Danh sách khách và xuất CSV

Phần này là chức năng có sẵn ở mã local được giữ lại khi đồng bộ backend;
chưa nằm trong commit check-in `9e7fe38`. Không thêm quyền điều hành viên.

## API

| Phương thức | Endpoint | Chức năng |
| --- | --- | --- |
| GET | `/api/v1/events/:id/attendees` | Danh sách người giữ vé, tổng vé và số đã check-in |
| GET | `/api/v1/events/:id/attendees/export` | Xuất danh sách CSV |

Cần access JWT, tài khoản đang hoạt động và quyền OWNER của ban tổ chức sở hữu
sự kiện. Ban tổ chức bị khóa không truy cập được. API không công khai thông tin
người mua và không cho ADMIN/MODERATOR hoặc operator quyền truy cập mặc định.

Query `showingId` tùy chọn lọc theo suất diễn; bỏ trống để xem toàn sự kiện.
Danh sách nhận `page` là số nguyên từ 1 đến 1.000.000, mặc định 1; mỗi trang
50 vé. Chỉ lấy vé thuộc đơn gốc PAID. Tên/email hiển thị thuộc người giữ vé
hiện tại; câu trả lời đăng ký vẫn là của người mua ban đầu.

Kết quả danh sách có `items`, `total`, `checkedIn`, `page`, `limit`, `showings`,
qua response envelope chung. Mỗi dòng gồm mã/trạng thái vé, thời điểm check-in,
tên/email người giữ vé, suất diễn, hạng vé, mã đơn và câu trả lời đăng ký.

CSV giới hạn 10.000 vé; vượt giới hạn trả 409 và yêu cầu lọc theo suất diễn.
Tệp dùng UTF-8 BOM, dấu phẩy và CRLF; ô được đặt trong dấu nháy, escape dấu nháy
và chặn tiền tố công thức bảng tính. Cả hai endpoint đặt
`Cache-Control: private, no-store`; xuất CSV được ghi audit, không ghi nội dung.

CSV có dữ liệu cá nhân: không đưa tệp xuất vào Git, issue hoặc kho công khai.
Xem [check-in](ticket-check-in.md) cho thao tác xác minh và ghi nhận vào cửa.

## Kiểm chứng

Đã rà mã, kiểu TypeScript và phạm vi quyền. Chưa chạy kiểm thử HTTP/PostgreSQL
hoặc xuất CSV trên dữ liệu thực; chưa xác nhận đồng bộ giao diện frontend.
