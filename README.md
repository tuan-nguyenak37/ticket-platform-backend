# TicketVerse Backend

Nền tảng API NestJS của TicketVerse. Commit base chỉ gồm bootstrap ứng dụng,
endpoint kiểm tra và công cụ phát triển; chưa bao gồm database, xác thực, sự kiện,
đặt vé, VNPay hoặc bán lại vé.

## Yêu cầu

- Node.js 22.13 trở lên và npm 10 trở lên.
- Không cần PostgreSQL, Redis hoặc dịch vụ thanh toán ở bản base.

## Cài đặt và chạy

```powershell
npm ci
Copy-Item .env.example .env
npm run start:dev
```

API mặc định: `GET http://localhost:7000/api`, trả `Hello World!`.
`PORT` có thể cấu hình từ 1 đến 65535; biến môi trường của tiến trình được ưu tiên
hơn `.env`. Endpoint này chỉ xác nhận HTTP server hoạt động, không kiểm tra các
dịch vụ phụ thuộc.

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
- `.env.example`: cấu hình mẫu; không commit `.env` hoặc secrets.

## Quy ước Git

- Commit theo Conventional Commits: `type(scope): mô tả ngắn`.
- Mỗi commit là một thay đổi có mục đích rõ ràng và kiểm tra độc lập được.
- Phát triển qua nhánh chức năng và pull request; không đưa file build,
  `node_modules`, thông tin cá nhân hoặc khóa bí mật lên Git.
- Các commit nghiệp vụ tiếp theo cần kèm test, tài liệu và migration tương ứng.
