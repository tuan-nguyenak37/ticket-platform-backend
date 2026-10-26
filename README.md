# TicketVerse Backend

Nền tảng API NestJS của TicketVerse với cấu hình môi trường và kết nối PostgreSQL.
Chưa bao gồm xác thực, sự kiện, đặt vé, VNPay hoặc bán lại vé.

## Yêu cầu

- Node.js 22.13 trở lên và npm 10 trở lên.
- PostgreSQL đang chạy và một database đã tạo cho ứng dụng.
- Chưa cần Redis hoặc dịch vụ thanh toán.

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

- API dùng prefix `/api`. Chưa có các route nghiệp vụ trong snapshot này.
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
- Không tự chạy migration. Chưa có entity hoặc migration nghiệp vụ ở bước này.
- Thử kết nối tối đa 3 lần, cách nhau 1 giây; lỗi kết nối làm khởi động thất bại.
- Không dùng tài khoản superuser cho ứng dụng và không commit `.env`.

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
$env:RUN_DATABASE_TESTS = 'true'
npm test -- --runInBand
```

CI cung cấp PostgreSQL 16 riêng và luôn bật bài kiểm tra kết nối. Bài kiểm tra
chỉ chạy `SELECT 1`, không ghi dữ liệu hoặc thay đổi schema.

## Bản build

```sh
npm run build
npm run start:prod
```

## Cấu trúc

- `src/main.ts`: đọc môi trường và khởi chạy HTTP server với prefix `/api`.
- `src/app.module.ts`: module gốc, chưa nối module nghiệp vụ.
- `src/app.controller.ts`, `src/app.service.ts`: endpoint kiểm tra ứng dụng.
- `src/app.controller.spec.ts`: kiểm tra service, HTTP thành công và 404.
- `src/config/`: validation môi trường và module cấu hình dùng chung.
- `src/config/database/`: kết nối PostgreSQL và kiểm thử cấu hình/kết nối.
- `src/common/`: validation HTTP, CORS, filter lỗi và interceptor phản hồi.
- `.env.example`: cấu hình mẫu; không commit `.env` hoặc secrets.

## Quy ước Git

- Commit theo Conventional Commits: `type(scope): mô tả ngắn`.
- Mỗi commit là một thay đổi có mục đích rõ ràng và kiểm tra độc lập được.
- Phát triển qua nhánh chức năng và pull request; không đưa file build,
  `node_modules`, thông tin cá nhân hoặc khóa bí mật lên Git.
- Các commit nghiệp vụ tiếp theo cần kèm test, tài liệu và migration tương ứng.
