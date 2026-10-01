# Postman local Events

Workspace: nesjs. Collection: Backend - Events. Environment: Backend Local - Events.
baseUrl: http://localhost:7000 (không thêm /api).

## Chạy trên máy hiện tại

1. Khởi động backend bằng `npm run start:dev` nếu chưa chạy.
2. Dùng Postman Desktop hoặc chọn Desktop Agent khi dùng web; cloud runner không
   truy cập server localhost trên máy này.
3. Chọn environment Backend Local - Events, refresh collection để nhận cấu hình mới.
4. Trong Settings > General, đặt Working directory thành thư mục backend:
   `D:/HK1-2026_2027/Do_an_nganh/project/backend` nếu Postman chặn đọc file mẫu.
5. Chạy folder 01 - Login, sau đó 02 - Events. Token hết hạn thì chạy lại Login.

Các request đã có form-data, Bearer và script lưu token/ID vào environment.
Ảnh mẫu đã gán đường dẫn tuyệt đối ở `.tmp/postman-files/thumbnail.png` và
`.tmp/postman-files/banner.png`. Nếu Postman yêu cầu chọn lại file, chọn hai file
này trong Body. Đây là file local, không được upload lên kho file Postman.

Ba tài khoản test riêng theo role cùng một category test đã được tạo trong database
local. Environment đã điền thông tin test; mật khẩu/token đánh dấu secret. Không
đưa environment có credential vào Git. Fixture và báo cáo chi tiết nằm trong .tmp
(đã ignore). Mỗi lần chạy thành công tạo thêm 3 event test và 6 ảnh.

## Kết quả xác minh 01/10/2026

Newman local: 17 request, 25 assertions đạt, 0 failures. Bao gồm login ba role,
tạo published/draft, phân quyền, validation và đọc/chặn ảnh theo trạng thái.
Đã đọc lại collection qua MCP để xác nhận script, Bearer và các field được lưu.
Chưa xác nhận trực tiếp trạng thái Desktop Agent hoặc Working directory trên UI
Postman của người dùng.

Các lỗi cấu hình đã sửa: baseurl sai chữ hoa/thường, tài khoản trống, thiếu dữ liệu
category, thiếu Bearer token, script và body multipart trên collection remote.
