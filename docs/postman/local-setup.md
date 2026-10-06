# Postman local Events

Workspace: nesjs. Environment: Backend Local - Events.
baseUrl: http://localhost:7000 (không thêm /api).

## Collection hiện tại — 05/10/2026

Các collection chỉ giữ request hợp lệ; đã bỏ request cố tình gửi sai dữ liệu hoặc
gọi API bằng quyền không phù hợp. Script tự lưu token/ID và các kiểm tra response
thành công vẫn được giữ.

| Collection | Số request | Nội dung |
| --- | --- | --- |
| Backend - Auth | 4 | Login, refresh bằng cookie, lấy user hiện tại, logout |
| Backend - Events | 12 | Category public, login theo role, tạo sự kiện, đọc ảnh và ghim/bỏ ghim |
| Backend - Events CRUD | 27 | Category public, CRUD, ghim/bỏ ghim, refresh và lấy user |

**Backend - Auth** thay cho tên cũ Backend - Login regression. Login dùng
userEmail/userPassword trong environment, tự lưu sessionAccessToken cho các bước sau.

**Backend - Events CRUD** dùng cùng environment và chạy theo số thứ tự. Nó tạo hai
event riêng qua biến crudId, sửa rồi xóa; không xóa event của lượt tạo trước đó.
Không chạy đồng thời các collection vì login mới thu hồi token của phiên trước.

Lượt cập nhật này đã đọc lại cấu hình qua MCP để kiểm tra URL, auth, script,
body và đường dẫn ảnh; không chạy request nghiệp vụ hoặc Newman.

Luồng ghim dùng ba request Pin published event → List pinned events (public) →
Unpin published event (MODERATOR), sau khi sự kiện được công bố và trước bước xóa
trong CRUD. Cần còn ít nhất một suất trong giới hạn 4; collection không tự bỏ ghim
sự kiện khác. Bản Events dùng eventId, bản CRUD dùng crudId.
Database tắt synchronize cần áp dụng [SQL ghim](../event-pinning.sql) trước khi
khởi động phiên bản backend có chức năng ghim. Lượt này không chạy SQL hoặc seed.

## Chạy trên máy hiện tại

1. Khởi động backend bằng `npm run start:dev` nếu chưa chạy.
2. Dùng Postman Desktop hoặc chọn Desktop Agent khi dùng web; cloud runner không
   truy cập server localhost trên máy này.
3. Chọn environment Backend Local - Events, refresh collection để nhận cấu hình mới.
4. Trong Settings > General, đặt Working directory thành thư mục backend:
   `D:/HK1-2026_2027/Do_an_nganh/project/backend` nếu Postman chặn đọc file mẫu.
5. Với Backend - Events, gọi List active event categories (public) trước, rồi
   chạy folder 01 - Login và 02 - Events. Với CRUD/Auth, làm theo số thứ tự.
   Token hết hạn thì chạy lại Login hoặc dùng refresh bằng cookie.

Các request đã có form-data, Bearer và script lưu token/ID vào environment.
Ảnh banner mẫu đã gán đường dẫn tuyệt đối ở `.tmp/postman-files/banner.png`.
Nếu Postman yêu cầu chọn lại file, chọn file này trong Body. Đây là file local, không được upload lên kho file Postman.

Ba tài khoản test riêng theo role cùng một category test đã được tạo trong database
local. Environment đã điền thông tin test; mật khẩu/token đánh dấu secret. Không
đưa environment có credential vào Git. Fixture và báo cáo chi tiết nằm trong .tmp
(đã ignore). Mỗi lần chạy collection Events thành công tạo thêm 3 event test và 3 banner.

## Chỉ dùng banner

Request tạo chỉ gửi một file banner; thay ảnh dùng field banner. Đọc ảnh dùng
/images/banner, với URL manage cho draft. Các request hiện tại không gửi mô tả
ngắn hoặc ảnh đại diện. Tham khảo [SQL chuyển đổi](../event-banner-only.sql)
khi database tắt synchronize. Các số liệu bên dưới là lịch sử trước thay đổi này.

## Kết quả xác minh 01/10/2026

Các kết quả dưới đây thuộc phiên bản collection trước khi lược bỏ request kiểm thử lỗi.

Newman local: 17 request, 25 assertions đạt, 0 failures. Bao gồm login ba role,
tạo published/draft, phân quyền, validation và đọc/chặn ảnh theo trạng thái.
CRUD đã đạt 37 request, 48 assertions; 5 file ảnh phát sinh được dọn sau thay ảnh/xóa.
Đã đọc lại collection qua MCP để xác nhận script, Bearer và các field được lưu.
Chưa xác nhận trực tiếp trạng thái Desktop Agent hoặc Working directory trên UI
Postman của người dùng.

Các lỗi cấu hình đã sửa: baseurl sai chữ hoa/thường, tài khoản trống, thiếu dữ liệu
category, thiếu Bearer token, script và body multipart trên collection remote.
