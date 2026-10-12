# Postman local Backend

## Khóa tài khoản và bằng chứng — 12/10/2026

- Import `users-moderation.postman_collection.json`: đặt `adminToken`, `targetUserId`
  của tài khoản test USER/MODERATOR và `moderationReason`. Khóa/mở khóa thu hồi phiên
  cũ; phải đăng nhập lại khi mở khóa. Các request là lựa chọn thao tác riêng.
- Collection Orders thêm folder `Manual - Dispute evidence (before resolution)`:
  mở tranh chấp trước, chọn file ảnh/PDF trong form-data `file`, upload với
  `buyerToken` hoặc `sellerToken`; tải với token của hai bên hoặc `managerToken`.
- Xem [giới hạn, response và SQL](../account-moderation-dispute-evidence.md).
  Các thay đổi này nằm trong collection local, chưa đồng bộ lên Postman cloud.

## Email Gmail/BullMQ/Redis — 12/10/2026

Collection Tickets và Orders có hướng dẫn email trong Overview và mô tả các
request duyệt vé, thanh toán, tranh chấp, hoàn tiền. Không có endpoint gửi email
mới; dùng các request nghiệp vụ hiện có. Xem [cấu hình email](../email-notifications.md)
và áp dụng [SQL outbox](../email-schema.sql) trước khi bật `EMAIL_ENABLED`.

- Chạy Redis bằng `docker compose -f compose.email.yml up -d` (cổng 6380),
  cấu hình Gmail trong `.env` backend và chạy `npm run worker:email` riêng.
- Không lưu Gmail App Password vào environment/collection Postman.
- Duyệt/từ chối vé báo người bán; thanh toán thắng báo người mua và người bán;
  bên thua được báo chờ hoàn tiền. Hoàn tiền báo người mua.
- Mở tranh chấp báo người bán; phản hồi đầu tiên báo người mua; quyết định báo cả hai.
- HTTP thành công chỉ xác nhận nghiệp vụ. Kiểm tra `email_outbox` và hộp thư
  tài khoản test để xác minh gửi; email mock ghi DEMO, không có tiền thật.
- Hai request tạo đơn trong folder Race kiểm tra trạng thái `pending_payment`.
- Giữ cùng idempotency key khi kiểm tra callback lặp; số dòng outbox không tăng.
- Kiểm tra độc lập bằng `npm run test:email:integration`: SMTP local, không gửi Gmail.


## Cập nhật ngày 11/10/2026

Đã import `Backend - Orders` (22 request) và thay bản `Backend - Tickets` (20 request)
trong workspace `nesjs`. Collection chỉ chứa biến token trống; không đồng bộ credential.
Các số request/trạng thái chưa đồng bộ ở phần lịch sử bên dưới thuộc lượt trước.

- Tickets chỉ nhận PDF. Mẫu `ticket.pdf` khớp Demo Concert, 20/12/2028 lúc 19:00 giờ Việt Nam,
  Demo Hall, VIP, A12, giá gốc 500000 VNĐ; giá bán lại mẫu là 400000 VNĐ.
- Chọn `eventId` đúng sự kiện trong PDF. List events không tự ghi đè eventId nữa.
  Create lưu `ticketId`, `reviewTicketId`, `myTicketId`; danh sách hàng chờ không tự đổi vé đang duyệt.
- Chờ worker xử lý xong, đọc Ticket report, xem file/cảnh báo rồi Approve bằng tài khoản quản trị khác người bán.
  Sau đó dùng ticketId trong Orders. Không chạy Cancel hoặc Reject trên vé dùng cho luồng mua.
- Orders: đặt `buyerToken`, `sellerToken`, `managerToken` từ các tài khoản tương ứng.
  Các request có kiểm tra HTTP status; token phải còn hạn.
- Folder `Race - Two buyers, one ticket (test data only)` dùng một vé PDF mới đã duyệt qua `raceTicketId`,
  `buyerToken` và `buyer2Token` của hai người khác nhau, `managerToken` của quản trị không thuộc hai bên.
  Chọn environment và chạy riêng folder theo thứ tự 1A, 1B, 2A, 2B, 3, 4, 5, 6.
  Bước 3 gửi hai kết quả success đồng thời bằng `pm.sendRequest`, yêu cầu đúng một paid và một refund_pending.
  Bước 4 tải PDF cho người thắng; bước 5 phải trả 409 cho người thua; bước 6 hoàn tiền giả lập.
  Xóa `raceKeyA`, `raceKeyB` trong environment và chọn vé mới khi chạy lại kịch bản mới.
  Các biến race kết quả/token được lưu trong environment đang chọn; không export/share giá trị credential.
- Dùng Desktop Agent để truy cập localhost; mock yêu cầu `PAYMENT_MOCK_ENABLED=true` ở development/test.
  Collection có các nhánh thay thế, không chạy toàn bộ Orders hoặc Tickets như một chuỗi duy nhất.

Kiểm thử tự động độc lập Postman: `npm run test:purchase-flow`. Lệnh tạo mẫu PDF,
nạp TESSDATA_PREFIX trước khi Jest khởi động và chạy 15 test trên schema PostgreSQL tạm;
schema được dọn sau test. Cần PostgreSQL local và Python/Tesseract vie+eng trong `.env`.
Máy ngoài Windows đặt `TICKET_TEST_FONT` tới font TTF khi tạo mẫu.
Luồng OCR dùng service thật/file thật; test HTTP Orders dùng token guard giả lập.
Kết quả này không xác nhận đã chạy Collection Runner trên Postman.

Workspace: nesjs. Environment: Backend Local - Events.
baseUrl: http://localhost:7000 (không thêm /api).

## Collection trong repository — 07/10/2026

Các collection chỉ giữ request hợp lệ; đã bỏ request cố tình gửi sai dữ liệu hoặc
gọi API bằng quyền không phù hợp. Script tự lưu token/ID và các kiểm tra response
thành công vẫn được giữ.

| Collection | Số request | Nội dung |
| --- | --- | --- |
| Backend - Auth | 4 | Login, refresh bằng cookie, lấy user hiện tại, logout |
| Backend - Events | 13 | Category public, login theo role, tạo sự kiện, đọc ảnh và ghim/bỏ ghim |
| Backend - Events CRUD | 27 | Category public, CRUD, ghim/bỏ ghim, refresh và lấy user |
| Backend - Tickets | 20 | Đăng, tìm kiếm, hủy, kiểm duyệt và xem vé tôi đăng |
| Backend - Orders | 14 | Tạo đơn, thanh toán giả lập, nhận file, tranh chấp và đối soát |

Số request trên được đếm từ file JSON local; chưa xác nhận đồng bộ lên workspace
Postman trong lượt này. Các hướng dẫn/cấu hình workspace bên dưới là lịch sử bàn giao.

### Collection Tickets

Import [tickets.postman_collection.json](./tickets.postman_collection.json), dùng
baseUrl không có /api. Đăng nhập USER, chọn eventId của sự kiện published chưa
kết thúc và chọn file ticketFile trong request tạo vé. Vé mới pending_review
nên chưa xuất hiện ở danh sách public; dùng nhóm My tickets với userToken để xem.

Để duyệt, đăng nhập ADMIN bằng tài khoản khác người bán, dùng reviewToken và
reviewTicketId. Nếu chạy Recheck, đợi worker hoàn tất rồi đọc lại Ticket report
để lấy checkVersion/selectedCodeId hiện tại trước Approve. Chọn Approve hoặc
Reject cho một vé pending; không chạy cả hai quyết định liên tiếp trên cùng vé.
Request Cancel cũng là nhánh riêng; vé đã cancelled không thể được duyệt.
Collection này không phải một kịch bản chạy toàn bộ tuần tự luôn thành công.

### Collection Orders

Import [orders.postman_collection.json](./orders.postman_collection.json).
Cấu hình baseUrl, buyerToken, sellerToken, managerToken và ticketId. Các token
lấy từ Auth; manager phải là ADMIN/MODERATOR khác hai bên giao dịch. Collection
không chứa tài khoản, token thật hoặc file vé.

Chạy Create → Start mock payment → Mock successful payment → Download purchased
ticket. Script tạo key mới cho request Create và lưu orderId; retry cùng yêu cầu
phải giữ lại orderKey thay vì xóa biến. Với một giao dịch mới, xóa orderKey trước.
Để thử tranh chấp, mở dispute bằng buyer, phản hồi bằng seller, giải quyết bằng
manager rồi mới chạy mock refund nếu quyết định accept. Payout chỉ chạy khi đơn
completed. Cancel, refund và payout là các nhánh thay thế, không chạy cả collection
tuần tự. Kịch bản hai người mua dùng hai bộ token/orderId; tạo và start cả hai trước
khi gửi success. Xem [hợp đồng Orders](../orders-api.md) để biết cấu hình mock/schema.

**Backend - Auth** thay cho tên cũ Backend - Login regression. Login dùng
userEmail/userPassword trong environment, tự lưu sessionAccessToken cho các bước sau.

**Backend - Events CRUD** dùng cùng environment và chạy theo số thứ tự. Nó tạo hai
event riêng qua biến crudId, sửa rồi xóa; không xóa event của lượt tạo trước đó.
Không chạy đồng thời các collection vì login mới thu hồi token của phiên trước.

Lượt cập nhật ngày 05/10/2026 đã đọc lại cấu hình qua MCP để kiểm tra URL, auth, script,
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
