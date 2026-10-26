# Quản lý người dùng

| API | Quyền | Mục đích |
| --- | --- | --- |
| `POST /api/users` | ADMIN | Tạo người dùng thường |
| `GET /api/users` | ADMIN | Danh sách người dùng, mới nhất trước |
| `GET /api/users/:id` | ADMIN | Xem chi tiết người dùng |
| `PATCH /api/users/:id` | ADMIN | Sửa tên và số điện thoại |
| `PATCH /api/users/:id/status` | ADMIN, MODERATOR | Khóa hoặc mở khóa tài khoản |

Các API dùng Bearer access JWT, kiểm tra phiên Redis và trạng thái/vai trò hiện
hành qua guard. Service kiểm tra quyền lại, không chỉ dựa vào giao diện.
Phản hồi đặt `Cache-Control: no-store`, chỉ xuất DTO công khai, không trả hash
mật khẩu. Các API `/users/me` vẫn dành cho mọi người dùng đã xác thực.

Tạo tài khoản nhận `email`, `fullName`, `password`, luôn gán USER/ACTIVE và băm
bằng bcrypt. Email chuẩn hóa chữ thường, lỗi trùng email trả 409. Không nhận role,
status hoặc password_hash. Sửa thông tin quản trị chỉ nhận `full_name` và
`phone_number`; cần ít nhất một trường, `null` xóa số điện thoại. Tên dài 1–150
ký tự sau trim; số điện thoại gồm 7–20 chữ số, dấu `+` tùy chọn, tổng tối đa 20
ký tự. Không có quyền đặt lại mật khẩu, đổi email hoặc vai trò qua API này.
ADMIN có thể sửa tên/số điện thoại của tài khoản ADMIN; không thể khóa ADMIN.

Đổi trạng thái nhận `status=ACTIVE|SUSPENDED` và `reason` dài 1–1000 ký tự sau
trim. ID gồm chữ, số, `_`, `-`, dài 1–40 ký tự. Không ai được tự đổi trạng thái;
không ai được khóa/mở khóa ADMIN. MODERATOR chỉ được thao tác trên USER.

Service khóa hàng người thao tác và tài khoản đích theo thứ tự ID trong cùng
transaction; đọc lại quyền/trạng thái người thao tác sau khóa, tránh dùng claims
cũ nếu tài khoản vừa bị khóa/hạ quyền. Trạng thái không đổi là no-op. Khi khóa,
thu hồi mọi phiên Redis trước khi lưu; Redis lỗi thì không lưu trạng thái. Khi
mở khóa không khôi phục phiên cũ: người dùng đăng nhập lại. Nếu DB lỗi sau thu
hồi, các phiên vẫn bị thu hồi nhưng trạng thái không đổi. Hai kho không có
transaction phân tán; cần kiểm chứng bằng DB/Redis thật trước triển khai.

Audit interceptor ghi request ID, actor ID, action, target ID, kết quả và mã lỗi;
tài khoản được tạo dùng ID của kết quả tạo. Không log body, mật khẩu, hash,
headers, cookie, token hay toàn bộ lỗi. Lý do đổi trạng thái được kiểm tra đầu
vào nhưng không lưu trong log; nhật ký quản lý chung chưa có bảng DB hoặc API
đọc audit. Sự kiện audit đi vào logger vận hành, không phải transaction DB.
Riêng đổi vai trò có bảng nhật ký riêng, xem `user-role-changes.md`.

Giữ dạng danh sách mảng để tương thích frontend hiện tại; chưa thêm phân trang
trong commit này. Không gồm thống kê dashboard. API đổi vai trò được mô tả riêng
trong `user-role-changes.md`.

Các test quyền truy cập, tạo/sửa tài khoản, khóa/mở khóa, kiểm tra quyền sau khóa
hàng, lỗi Redis, validation và audit được bổ sung nhưng không chạy theo yêu cầu.
