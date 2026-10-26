# API hồ sơ cá nhân

- `GET /api/users/me`: đọc hồ sơ hiện tại, không trả `password_hash`.
- `PATCH /api/users/me`: chỉ nhận `full_name`, `phone_number`, `avatar_url`; cần ít nhất một trường.
- `PATCH /api/users/me/password`: nhận `currentPassword`, `newPassword`; đổi mật khẩu và thu hồi mọi phiên.

Các API yêu cầu Bearer access JWT và tài khoản ACTIVE. ID lấy từ phiên đã xác thực,
không nhận từ body; email, vai trò và trạng thái không phải trường được chỉnh sửa.
Phản hồi đặt `Cache-Control: no-store`.

Tên được trim, dài 1–150 ký tự, không nhận `null`. Số điện thoại gồm 7–20 chữ số,
có thể bắt đầu bằng `+`, tổng độ dài tối đa 20 ký tự; `null` để xóa. Ảnh đại diện
nhận URL HTTP(S) tối đa 2048 ký tự hoặc `null` để xóa. Chưa cung cấp upload ảnh;
backend không tải URL ảnh về server.

Mật khẩu mới dài 6–32 ký tự và tối đa 72 byte, không trim. Kiểm tra mật khẩu cũ,
từ chối mật khẩu mới tương đương mật khẩu cũ theo bcrypt. Khóa hàng người dùng
trong transaction, thu hồi mọi phiên Redis trước khi lưu hash mới. Redis lỗi thì
không lưu mật khẩu; nếu lưu DB lỗi sau thu hồi, các phiên vẫn bị thu hồi và người
dùng cần đăng nhập lại bằng mật khẩu cũ. Hai kho dữ liệu không có transaction phân tán.
Đăng nhập cũng khóa cùng hàng người dùng; thao tác đồng thời cần nghiệm thu tích hợp.

Chỉ xóa cookie web `ticketverse_refresh`, cookie opaque cũ `ticketverse_session`
và cookie `refresh_token` sau khi đổi mật khẩu thành công. Client phải xóa access
token trong bộ nhớ và yêu cầu đăng nhập lại. Đổi mật khẩu giới hạn 5 lần/15 phút
theo mạng nguồn. Không ghi mật khẩu vào log.

Test hồ sơ gồm validation, giới hạn tài khoản, xóa cookie, xác minh mật khẩu và
lỗi thu hồi phiên; không chạy trong đợt commit này theo yêu cầu.
