# TicketVerse Backend

Backend cho **TicketVerse** — nền tảng đặt vé sự kiện và bán lại vé. Dự án cung
cấp API quản lý sự kiện, đặt vé, thanh toán, phát hành vé điện tử và quản trị.

[Frontend](https://github.com/tuan-nguyenak37/ticket-platform-frontend) ·
[Tài liệu API và nghiệp vụ](docs/README.md) ·
[Hướng dẫn đóng góp](CONTRIBUTING.md) ·
[Bảo mật](SECURITY.md)

## Mục lục

- [Tổng quan](#tổng-quan)
- [Công nghệ](#công-nghệ)
- [Yêu cầu môi trường](#yêu-cầu-môi-trường)
- [Cài đặt và khởi chạy](#cài-đặt-và-khởi-chạy)
- [Cấu hình](#cấu-hình)
- [Lệnh phát triển](#lệnh-phát-triển)
- [Cấu trúc dự án](#cấu-trúc-dự-án)
- [Tài liệu](#tài-liệu)

## Tổng quan

TicketVerse phục vụ người mua vé, người bán lại, ban tổ chức và đội ngũ quản trị
trên cùng một nền tảng, với quyền truy cập được kiểm soát ở backend.

| Nhóm chức năng | Nội dung |
| --- | --- |
| Tài khoản | Đăng ký, đăng nhập, hồ sơ cá nhân và quản lý phiên JWT |
| Tổ chức sự kiện | Hồ sơ ban tổ chức, sự kiện, suất diễn, hạng vé và tồn kho |
| Kiểm duyệt | Gửi duyệt sự kiện, quyết định duyệt và thông báo kết quả |
| Đặt vé | Giữ vé có thời hạn, tạo đơn, hủy đơn và xử lý yêu cầu lặp |
| Thanh toán | Tích hợp VNPay, xác minh IPN và khôi phục kết quả giao dịch |
| Vé điện tử | Phát hành vé, mã QR, tải PDF và gửi vé qua email |
| Check-in | API cho chủ ban tổ chức: xác minh QR theo suất diễn, ghi nhận vào cửa một lần |
| Bán lại vé | Đăng bán, mua lại, chuyển chủ và ghi nhận chi trả người bán |
| Báo cáo | Tổng thu, thống kê quản trị và báo cáo bán vé cho ban tổ chức |
| Thông báo | Hộp thông báo trong web và email theo nghiệp vụ |

**Trạng thái dự án:** đang phát triển. VNPay hiện kết nối môi trường thử nghiệm;
chi trả người bán sử dụng bộ xử lý mô phỏng trong development/test, không chuyển
tiền thật. Xem [tích hợp thanh toán](docs/vnpay-integration.md) và
[chi trả bán lại](docs/automatic-payouts.md) trước khi cấu hình vận hành.

Giao diện check-in chưa được đồng bộ với API mới. Trạng thái rà soát mã local,
phần còn chờ kiểm chứng và các bản lưu nằm trong
[báo cáo đồng bộ backend](docs/local-reconciliation.md).

## Công nghệ

| Thành phần | Công nghệ |
| --- | --- |
| Ngôn ngữ | TypeScript |
| Framework | NestJS 11 |
| Cơ sở dữ liệu | PostgreSQL, TypeORM và migration |
| Xác thực | JWT, refresh cookie HttpOnly và Redis |
| Thanh toán | VNPay Hosted Checkout |
| Email | SMTP, Nodemailer |
| Vé điện tử | PDF-Lib, QRCode, Noto Sans |
| Kiểm thử | Jest, Supertest |
| Kiểm tra mã | ESLint, Prettier, TypeScript |
| CI | GitHub Actions |

## Yêu cầu môi trường

- **Node.js:** từ `22.13.0`; CI dùng Node.js 22.
- **npm:** từ phiên bản 10.
- **PostgreSQL:** dịch vụ đang hoạt động; CI dùng PostgreSQL 16.
- **Redis:** dịch vụ đang hoạt động để quản lý phiên và giới hạn tần suất.
- **SMTP:** cần khi bật gửi email.
- **VNPay:** thông tin merchant thử nghiệm khi kiểm tra luồng thanh toán.

PostgreSQL và Redis phải được cấu hình riêng; `npm ci` không cài đặt hoặc khởi
chạy các dịch vụ này.

## Cài đặt và khởi chạy

### 1. Lấy mã nguồn

```sh
git clone https://github.com/tuan-nguyenak37/ticket-platform-backend.git
cd ticket-platform-backend
npm ci
```

### 2. Tạo cấu hình môi trường

PowerShell:

```powershell
Copy-Item .env.example .env
```

Linux/macOS:

```sh
cp .env.example .env
```

Chỉ sao chép khi chưa có `.env`. Cập nhật kết nối PostgreSQL, Redis và các secret
trước khi khởi chạy; xem [Cấu hình](#cấu-hình). Không sử dụng secret mẫu.

### 3. Chuẩn bị cơ sở dữ liệu

Tạo một database phát triển riêng, cập nhật các biến `DB_*`, sau đó chạy:

```sh
npm run db:migrate
```

Migration quản lý schema; không tự tạo tài khoản hoặc dữ liệu sự kiện. Giữ
`DB_SYNCHRONIZE=false`. Với database đã có dữ liệu, sao lưu và rà migration còn
thiếu trước khi chạy; không sửa migration đã áp dụng.

### 4. Khởi chạy API

```sh
npm run start:dev
```

Theo cấu hình mẫu, API sử dụng địa chỉ `http://localhost:7000/api` và frontend
chạy tại `http://localhost:3000`. Nhóm API đặt vé, thanh toán và bán lại dùng
prefix `/api/v1`; endpoint cụ thể được mô tả trong tài liệu từng module.

## Cấu hình

Danh sách biến cấu hình nằm trong [`.env.example`](.env.example).

| Biến | Mục đích |
| --- | --- |
| `NODE_ENV`, `PORT` | Môi trường và cổng HTTP |
| `FRONTEND_URL` | Danh sách origin frontend được phép, phân tách bằng dấu phẩy |
| `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_NAME` | Kết nối PostgreSQL |
| `DB_SYNCHRONIZE` | Luôn đặt `false`; thay đổi schema qua migration |
| `SECURITY_REDIS_URL` | Kết nối Redis cho phiên và giới hạn tần suất |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | Hai secret độc lập để ký JWT |
| `JWT_ACCESS_EXPIRES`, `JWT_REFRESH_EXPIRES` | Thời hạn access và giới hạn phiên; mặc định `15m`, `7d` |
| `TICKET_QR_SECRET` | Secret ký QR, tối thiểu 32 ký tự và khác secret JWT |
| `TICKET_EMAIL_ENABLED`, `SMTP_*` | Bật và cấu hình gửi email |
| `PAYMENT_PROVIDER`, `VNPAY_*` | Nhà cung cấp thanh toán và thông tin VNPay |
| `RESALE_SETTLEMENT_WORKER_ENABLED` | Bật tác vụ xử lý chi trả/email bán lại |
| `UPLOAD_DIR`, `UPLOAD_MAX_FILE_SIZE_MB` | Thư mục và giới hạn file tải lên |

Access JWT được gửi bằng `Authorization: Bearer`. Refresh JWT nằm trong cookie
HttpOnly và được xoay dùng một lần; xem [cơ chế xác thực](docs/authentication.md).

IPN của VNPay cần URL HTTPS công khai đã đăng ký với nhà cung cấp; VNPay không
thể gọi trực tiếp `localhost`. Kết quả từ URL trình duyệt quay về không thay thế
việc xác minh thanh toán tại backend.

Không commit `.env`, token, thông tin merchant hoặc dữ liệu ngân hàng thật.
Credential từng bị lộ phải được thu hồi/thay mới. Xem [chính sách bảo mật](SECURITY.md).

## Lệnh phát triển

| Lệnh | Chức năng |
| --- | --- |
| `npm run start:dev` | Chạy API và theo dõi thay đổi |
| `npm run build` | Biên dịch ứng dụng vào `dist/` |
| `npm run start:prod` | Chạy ứng dụng đã build |
| `npm run db:migrate` | Build và áp dụng migration còn thiếu |
| `npm run db:migrate:prod` | Chạy migration từ bản build |
| `npm run lint` | Kiểm tra ESLint |
| `npm run format:check` | Kiểm tra định dạng mã |
| `npm run typecheck` | Kiểm tra kiểu TypeScript |
| `npm test -- --runInBand` | Chạy bộ kiểm thử Jest |

GitHub Actions thực hiện lint, kiểm tra định dạng, kiểu dữ liệu, kiểm thử và
build. Kiểm chứng tích hợp với Redis, nghiệp vụ PostgreSQL, trình duyệt và VNPay
cần môi trường phù hợp; xem [trạng thái kiểm chứng](docs/verification-status.md).

Trước khi triển khai, hoàn thành [checklist phát hành](docs/release-checklist.md).
Build hoặc CI thành công không thay thế nghiệm thu thanh toán và bảo mật.

## Cấu trúc dự án

```text
src/
  common/           HTTP, bảo mật và upload dùng chung
  config/           Cấu hình môi trường, PostgreSQL và Redis
  database/         Migration và seed danh mục
  modules/
    auth/           Xác thực và phân quyền
    users/          Hồ sơ và quản trị người dùng
    organizers/     Ban tổ chức và báo cáo
    events/         Sự kiện, suất diễn và hạng vé
    orders/         Đơn hàng và giữ vé
    payments/       Thanh toán VNPay và khôi phục giao dịch
    tickets/        Vé điện tử, QR, PDF và email
    resale/         Bán lại, chuyển chủ và chi trả
    notifications/  Thông báo trong web
  app.module.ts     Module gốc
  main.ts           Khởi tạo ứng dụng
```

## Tài liệu

- [Mục lục API và nghiệp vụ](docs/README.md)
- [Xác thực JWT và refresh token](docs/authentication.md)
- [Sự kiện](docs/event-management.md), [suất diễn](docs/showing-management.md) và [hạng vé](docs/ticket-tier-management.md)
- [Đơn hàng và giữ vé](docs/order-reservations.md)
- [Tích hợp VNPay](docs/vnpay-integration.md)
- [Vé điện tử và email](docs/ticket-delivery.md)
- [Check-in vé theo suất diễn](docs/ticket-check-in.md)
- [Bán lại vé](docs/resale-v2.md) và [chi trả người bán](docs/automatic-payouts.md)
- [Báo cáo Organizer](docs/organizer-sales-reports.md) và [thống kê Admin](docs/admin-statistics.md)
- [Checklist phát hành](docs/release-checklist.md)
