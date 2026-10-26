# TicketVerse Backend

Nền tảng API NestJS của TicketVerse với cấu hình môi trường, kết nối PostgreSQL
và mô hình người dùng, Redis và kho lưu phiên refresh.
Bao gồm xác thực JWT, hồ sơ cá nhân và quản lý người dùng; chưa bao gồm sự kiện,
đặt vé, VNPay, bán lại vé hoặc thống kê quản trị. Có đổi vai trò USER/MODERATOR
với nhật ký bền vững và thu hồi phiên.

## Yêu cầu

- Node.js 22.13 trở lên và npm 10 trở lên.
- PostgreSQL đang chạy và một database đã tạo cho ứng dụng.
- Redis dành cho bảo mật; chưa cần dịch vụ thanh toán.

## Cài đặt và chạy

```powershell
npm ci
Copy-Item .env.example .env
```

Sửa thông tin kết nối trong `.env` theo PostgreSQL của bạn trước khi chạy:

```powershell
npm run start:dev
```

API mặc định: `GET http://localhost:7000/api`, trả `Hello World!` trong trường `data`.
`PORT` có thể cấu hình từ 1 đến 65535; biến môi trường của tiến trình được ưu tiên
hơn `.env`. Ứng dụng kiểm tra cấu hình và kết nối PostgreSQL khi khởi động;
endpoint này không thực hiện kiểm tra sức khỏe database theo từng request.

## Quy ước HTTP/API

- API dùng prefix `/api`; gồm xác thực, hồ sơ cá nhân và quản lý người dùng.
- DTO được kiểm tra bằng `ValidationPipe`: từ chối trường thừa, chuyển sang
  instance DTO, không tự bật chuyển kiểu dữ liệu ngầm. Route nhận body/query
  cần khai báo class DTO và decorator validation tương ứng.
- Phản hồi thành công có `success`, `statusCode`, `message`, `data`, `timestamp`.
- Phản hồi lỗi có `success=false`, `statusCode`, `message`, `path`, `timestamp`;
  giữ `code` và `issues` nếu được khai báo rõ trong lỗi HTTP dưới 500.
- Lỗi 5xx luôn trả `Internal server error`, không trả stack trace hoặc lỗi nội bộ.
  Trường `path` không chứa query string. Thông điệp lỗi 4xx phải an toàn để công khai.
- Mỗi request thông thường được cấp `X-Request-Id` mới từ server.
- Không bọc `StreamableFile`, phản hồi 204/304 hoặc response đã gửi trực tiếp
  bằng `@Res()`, để tương thích tải file, chuyển hướng và callback bên thứ ba.

`FRONTEND_URL` là danh sách origin HTTP(S) phân cách bằng dấu phẩy; mặc định là
`http://localhost:3000,http://localhost:5173`. Không chấp nhận `*`, đường dẫn,
query, thông tin đăng nhập hoặc mục rỗng. CORS bật credentials chỉ cho origin
được liệt kê; origin khác không nhận header cho phép. CORS không thay thế xác thực
hoặc kiểm tra Origin/CSRF cho các nghiệp vụ nhạy cảm.

## Cấu hình PostgreSQL

- Bắt buộc: `DB_HOST`, `DB_USERNAME`, `DB_PASSWORD`, `DB_NAME`.
- Mặc định: `DB_PORT=5432`, `PORT=7000`, `NODE_ENV=development`.
- `DB_SYNCHRONIZE` chỉ chấp nhận `false`; không tự tạo, sửa hoặc xóa bảng.
- Không tự chạy migration khi server khởi động. Chạy migration bằng lệnh riêng.
- Thử kết nối tối đa 3 lần, cách nhau 1 giây; lỗi kết nối làm khởi động thất bại.
- Không dùng tài khoản superuser cho ứng dụng và không commit `.env`.

## Redis và kho phiên refresh

- `SECURITY_REDIS_URL` mặc định `redis://127.0.0.1:6379/1`; hỗ trợ `rediss://`
  để bật TLS. URL chứa thông tin đăng nhập chỉ đặt trong cấu hình riêng.
- `SECURITY_REDIS_PREFIX` mặc định `ticketverse-security`, chỉ gồm chữ, số,
  dấu gạch ngang/gạch dưới, dài 1–60 ký tự.
- `JWT_ACCESS_SECRET` bắt buộc, production tối thiểu 32 ký tự. Thay giá trị mẫu
  bằng chuỗi ngẫu nhiên riêng; ở commit này dùng làm khóa HMAC che ID trong key
  Redis và ký access JWT. Refresh JWT dùng secret riêng, không được trùng.
- Kết nối lúc khởi động được giới hạn 10 giây và phải nhận `PONG`. Redis lỗi
  làm khởi động thất bại; lỗi thao tác trả 503, không tự coi phiên là hợp lệ.
- Tắt hàng đợi lệnh offline; mỗi lệnh có timeout 3 giây và giới hạn retry.
  Chỉ ghi mã lỗi vận hành, không ghi URL, token hoặc Redis credentials vào log.

`RefreshSessionService` nhận định danh người dùng, session ID và TTL từ mã gọi
đáng tin cậy. Redis chỉ lưu SHA-256 của refresh token cùng deadline, không lưu
token nguyên bản. Key được che ID bằng HMAC. Lua so khớp hash và thay thế nguyên
tử, dùng thời gian Redis; request lặp nhận `409 AUTH_REFRESH_CONFLICT`, còn
phiên hết hạn/bị thu hồi nhận 401. Token mới phải khác token cũ, TTL phải là số
nguyên dương và xoay token không vượt deadline ban đầu. Có thu hồi một phiên
hoặc toàn bộ phiên của người dùng.

Kho phiên không tự xác minh chữ ký JWT hoặc trạng thái tài khoản và không quản lý
cookie. Lớp xác thực thực hiện các bước đó trước khi gọi kho; mỗi lần đăng nhập
sinh session ID mới. Mất dữ liệu Redis sẽ thu hồi phiên;
production cần cấu hình persistence, TLS/ACL và tránh eviction cho kho bảo mật.
Đổi `JWT_ACCESS_SECRET` cũng làm các key phiên cũ không còn truy cập được.

Các bài kiểm tra mock chỉ kiểm tra ánh xạ kết quả và validation; không thay thế
nghiệm thu Lua đồng thời bằng Redis thật. Chưa chạy test trong đợt commit này.

## Người dùng và migration ban đầu

`User` ánh xạ bảng `users`: ID chuỗi tự sinh, email duy nhất, tên, trường
`password_hash`, thông tin liên hệ, vai trò, trạng thái và các mốc thời gian.
Vai trò gồm `USER`, `MODERATOR`, `ADMIN`; trạng thái gồm `ACTIVE`, `SUSPENDED`.
Entity không tự băm mật khẩu. `UsersService.create` băm bằng bcrypt trước khi
lưu; `UserResponseDto` chỉ xuất các trường hồ sơ công khai, không có `password_hash`.

`UsersModule` cung cấp repository, service nội bộ và `GET /api/users/me` có bảo vệ.
Có API quản trị người dùng được mô tả trong `docs/user-administration.md`;
không có API tạo ADMIN hoặc tài khoản mẫu. API đổi vai trò USER/MODERATOR được
mô tả riêng trong `docs/user-role-changes.md`.

## Xác thực JWT

Các route web đang dùng:

| Phương thức | Route | Chức năng |
| --- | --- | --- |
| POST | `/api/auth/register` | Đăng ký người dùng thường, chỉ trả hồ sơ |
| POST | `/api/auth/browser/login` | Đăng nhập, trả access token và đặt refresh cookie |
| POST | `/api/auth/browser/refresh` | Xoay refresh cookie, trả access token mới |
| POST | `/api/auth/browser/logout` | Thu hồi phiên và xóa cookie, không cần access còn hạn |
| GET | `/api/auth/browser/session` | Hồ sơ cho SSR; không cấp access hoặc xoay refresh |
| GET | `/api/users/me` | Hồ sơ chính mình, yêu cầu Bearer access JWT |
| PATCH | `/api/users/me` | Cập nhật tên, số điện thoại và URL ảnh đại diện |
| PATCH | `/api/users/me/password` | Đổi mật khẩu và thu hồi toàn bộ phiên |

POST có thay đổi cookie phải có `Origin` nằm trong `FRONTEND_URL`. Refresh JWT
web chỉ ở cookie `ticketverse_refresh`, HttpOnly, SameSite=Lax, Path=/, Secure
ở production; không trả refresh token qua JSON. Phản hồi auth/hồ sơ đặt
`Cache-Control: no-store`. SSR chỉ trả hồ sơ và kiểm tra hash hiện hành; cookie
refresh không được dùng làm thông tin xác thực cho API nghiệp vụ.

Access JWT mặc định `15m`, phiên tối đa `JWT_REFRESH_EXPIRES=7d` tính từ đăng nhập.
Token ký HS256 với secret riêng cho access/refresh và `jti` ngẫu nhiên. Tuổi token
được chặn bởi deadline phiên; xoay refresh không kéo dài deadline. Hết access trả
`401 AUTH_ACCESS_EXPIRED` trước nghiệp vụ. Token refresh đã xoay trả
`409 AUTH_REFRESH_CONFLICT` và không đặt/xóa cookie; token sai hoặc phiên bị
thu hồi trả 401. Redis/mạng lỗi trả 503, không giả định người dùng đã đăng xuất.

Guard toàn cục yêu cầu mỗi route khai báo rõ `Public`, `Authenticated`,
`OptionalAuth` hoặc `Roles`; thiếu/chồng chính sách bị từ chối. Guard đọc trạng
thái, vai trò hiện hành từ DB và kiểm tra phiên Redis, không chỉ tin claims JWT.
Giới hạn tần suất dùng Redis theo mạng nguồn và email đăng nhập, trả 429 kèm
`Retry-After`. `TRUST_PROXY` chỉ được cấu hình bằng proxy/subnet thực sự tin cậy;
để trống khi chạy trực tiếp, không tin `X-Forwarded-For` từ mọi nguồn.

Giữ `/api/auth/login`, `/api/auth/refresh`, `/api/auth/logout` để tương thích
client cũ, cũng kiểm tra Origin. Chúng dùng cookie `refresh_token` ở Path=/api/auth;
logout cũ yêu cầu access còn hợp lệ. Web dùng các route `/browser/*` để đăng xuất
được cả khi access đã hết hạn. Cookie opaque `ticketverse_session` cũ không còn
được xác thực; người dùng cũ cần đăng nhập lại một lần.

`JWT_REFRESH_SECRET` bắt buộc và khác `JWT_ACCESS_SECRET`; ở production cả hai
tối thiểu 32 ký tự ngẫu nhiên. `JWT_ACCESS_EXPIRES`/`JWT_REFRESH_EXPIRES` nhận số
giây hoặc hậu tố `s`, `m`, `h`, `d`, `w`, mặc định `15m`/`7d`. Không commit `.env`,
không ghi mật khẩu, token, cookie hoặc secret vào log. Không lưu refresh token
trong bộ nhớ trình duyệt; access token do client giữ trong bộ nhớ ngắn hạn.

Migration `BaselineUsersOrganizers1791888000000` được giữ nguyên tên và SQL từ
dự án hiện tại: tạo bảng `users`, `organizers`, `organizer_members` và các enum,
khóa ngoại/index tương ứng. Schema Organizer là một phần của baseline gốc,
không đồng nghĩa đã đưa module hoặc API Organizer vào commit này. Không tách,
đổi tên hoặc sửa migration cũ đã áp dụng trên database hiện có.

Sau khi tạo một database trống và cấu hình `.env` đúng, chủ động chạy:

```powershell
npm run db:migrate
npm run start:dev
```

Lệnh migration build trước khi chạy. Môi trường đã build dùng
`npm run db:migrate:prod`. TypeORM lưu các migration đã áp dụng trong bảng
`migrations`, chỉ chạy migration còn thiếu và dùng một transaction cho cả lượt.
Kết nối CLI dùng cùng validation và thiết lập an toàn như server.

Snapshot hiện đăng ký baseline và migration nhật ký đổi vai trò; không dùng nó
để thay thế bộ migration
đầy đủ của ứng dụng đang phát triển. Database hiện có phải giữ nguyên lịch sử;
không xóa bảng `migrations`, không đánh dấu baseline chưa chạy và không chạy
`down` tùy tiện: `down` của baseline sẽ xóa cả ba bảng cùng dữ liệu.

## Kiểm tra

```sh
npm run lint
npm run format:check
npm run typecheck
npm test -- --runInBand
npm run build
```

Lint và format check không tự sửa file. Dùng `npm run lint:fix` hoặc
`npm run format` khi chủ động muốn áp dụng sửa đổi. GitHub Actions chạy các kiểm
tra trên cho pull request và push vào `main`.

Các unit test chạy không cần database. Kiểm tra kết nối thật được bật bằng
`RUN_DATABASE_TESTS=true` và dùng các biến `DB_*` của tiến trình, không đọc `.env`.
Chỉ dùng database phát triển hoặc database test:

```powershell
$env:DB_HOST = '127.0.0.1'
$env:DB_PORT = '5432'
$env:DB_USERNAME = 'ticketverse'
$env:DB_PASSWORD = 'your-local-test-password'
$env:DB_NAME = 'ticketverse_test'
$env:JWT_ACCESS_SECRET = 'local-test-key-not-a-real-deployment-secret'
$env:JWT_REFRESH_SECRET = 'different-local-test-key-not-a-deployment-secret'
$env:RUN_DATABASE_TESTS = 'true'
npm test -- --runInBand
```

CI cung cấp PostgreSQL 16 riêng và luôn bật bài kiểm tra kết nối. Bài kiểm tra
chỉ chạy `SELECT 1`, không ghi dữ liệu hoặc thay đổi schema.

## Hồ sơ cá nhân

`PATCH /api/users/me` chỉ nhận `full_name`, `phone_number`, `avatar_url`; cần ít
nhất một trường. Tên được trim, dài 1–150 ký tự và không nhận `null`. Số điện
thoại tối đa 20 ký tự, gồm 7–20 chữ số và dấu `+` tùy chọn; gửi `null` để xóa.
Ảnh đại diện là URL HTTP(S) tối đa 2048 ký tự, gửi `null` để xóa; API không tải
ảnh về server và chưa có chức năng upload ảnh đại diện. Email, vai trò, trạng
thái, ID và mật khẩu không được cập nhật qua endpoint hồ sơ.

`PATCH /api/users/me/password` nhận `currentPassword` và `newPassword`. Mật khẩu
mới dài 6–32 ký tự, tối đa 72 byte để tránh bcrypt cắt chuỗi. Kiểm tra mật khẩu
hiện tại và từ chối mật khẩu mới tương đương mật khẩu cũ; không trim mật khẩu.
Khóa hàng người dùng trong transaction, thu hồi mọi phiên Redis trước khi lưu
hash mới và xóa cookie web/cũ chỉ sau khi thành công. Client phải xóa access
token trong bộ nhớ và yêu cầu đăng nhập lại. Lỗi Redis ngăn lưu mật khẩu; lỗi DB
sau thu hồi có thể khiến người dùng cần đăng nhập lại bằng mật khẩu cũ. PostgreSQL
và Redis không có transaction phân tán; phiên đăng nhập/refresh đang xử lý đồng
thời vẫn cần kiểm chứng tích hợp. Không ghi mật khẩu vào log hay trả hash qua API.

Cả hai API yêu cầu Bearer access JWT và tài khoản ACTIVE, không nhận ID người
dùng khác từ body. Phản hồi đặt `Cache-Control: no-store`. Đổi mật khẩu giới hạn
5 lần/15 phút theo mạng nguồn. Các test hồ sơ đã được bổ sung nhưng không chạy
trong đợt commit này theo yêu cầu.

## Bản build

```sh
npm run build
npm run start:prod
```

## Cấu trúc

- `src/main.ts`: đọc môi trường và khởi chạy HTTP server với prefix `/api`.
- `src/app.module.ts`: kết nối cấu hình, bảo mật, Users, Auth và Organizers.
- `src/app.controller.ts`, `src/app.service.ts`: endpoint kiểm tra ứng dụng.
- `src/app.controller.spec.ts`: kiểm tra service, HTTP thành công và 404.
- `src/config/`: validation môi trường và module cấu hình dùng chung.
- `src/config/database/`: kết nối PostgreSQL và kiểm thử cấu hình/kết nối.
- `src/database/`: baseline, migration nhật ký đổi vai trò và chương trình chạy migration.
- `src/modules/users/`: mô hình người dùng, service nội bộ và hồ sơ chính mình.
- `src/modules/auth/`: JWT, cookie, đăng ký/đăng nhập và các guard.
- `src/modules/organizers/`: hồ sơ ban tổ chức và quyền sở hữu; xem `docs/organizer-profiles.md`.
- `src/common/`: validation HTTP, CORS, filter lỗi và interceptor phản hồi.
- `.env.example`: cấu hình mẫu; không commit `.env` hoặc secrets.

## Quy ước Git

- Commit theo Conventional Commits: `type(scope): mô tả ngắn`.
- Mỗi commit là một thay đổi có mục đích rõ ràng và kiểm tra độc lập được.
- Phát triển qua nhánh chức năng và pull request; không đưa file build,
  `node_modules`, thông tin cá nhân hoặc khóa bí mật lên Git.
- Các commit nghiệp vụ tiếp theo cần kèm test, tài liệu và migration tương ứng.
