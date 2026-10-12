# Trạng thái kiểm chứng và bàn giao

## Redis chống spam và refresh token — 12/10/2026

- Thêm Redis bắt buộc cho API: bộ đếm nguyên tử, giới hạn chung/request ghi và
  ngưỡng riêng login/register/refresh/đổi mật khẩu; 429 kèm Retry-After, Redis lỗi
  trả 503. Chuẩn hóa IP/IPv6 và chỉ tin proxy cấu hình rõ ràng.
- Refresh token lưu SHA-256 kèm TTL, dùng một lần bằng HDEL nguyên tử; vẫn kiểm
  tra tokenVersion PostgreSQL. Cookie Max-Age khớp JWT_REFRESH_EXPIRES.
- `npm test -- --runInBand`: 235 test đạt, 33 test tích hợp bỏ qua mặc định.
- `npm run test:security:integration`: 58/58 đạt, gồm 12 test tích hợp Redis thật.
  Năm test HTTP dùng JWT/Redis thật và repository user giả lập, kiểm tra refresh
  đồng thời chỉ một request thắng, replay, token chưa đăng ký, logout và 429.
- `npm run test:e2e -- --runInBand`: 18/18 đạt; cập nhật fixture database/Redis
  cho Auth/Users, không khởi động worker nghiệp vụ hoặc kết nối PostgreSQL thật.
- Build, TypeScript và ESLint cho các file thay đổi đạt.
- Có docs và mô tả collection Auth local; chưa đồng bộ collection lên Postman cloud.
  `.env`/JWT secrets thực tế không thay đổi. Cần login lại sau nâng cấp vì các
  refresh token cũ chưa có bản ghi Redis.

## Email Gmail/BullMQ/Redis — 12/10/2026

- Đã bổ sung outbox cùng transaction nghiệp vụ, worker BullMQ riêng, Gmail SMTP
  TLS, giới hạn tốc độ và CLI retry. Cấu hình kết nối Redis tập trung tại
  `src/config/redis/redis.config.ts`; giá trị môi trường được kiểm tra trong
  `src/config/env.validation.ts`.
- Kiểm tra trước commit: Jest mặc định 226 test đạt, 21 test tích hợp bỏ qua;
  bao gồm 4 test PING/PONG, lỗi kết nối và timeout Redis. PostgreSQL/OCR đã chạy
  riêng đạt 15/15 trong lượt triển khai.
- Bộ email: 11/11 đạt (5 unit và 6 tích hợp PostgreSQL/Redis/SMTP local).
  Bao gồm rollback, Redis không kết nối, khôi phục job mất, SMTP retry,
  chống gửi đồng thời, giới hạn lần thử và retry thủ công.
- TypeScript và build đã đạt trong lượt triển khai email. Không gửi Gmail thật
  hoặc chạy Collection Runner. Email không yêu cầu cấu hình frontend.
- Cấu hình mẫu mặc định tắt. Đã kiểm tra `.env` local: email bật, Gmail xác thực
  SMTP/TLS thành công, Redis trả PONG, PostgreSQL kết nối và bảng outbox đủ cột.
  Chưa gửi email thật. Thông tin xác thực chỉ giữ trong `.env` bị Git bỏ qua.
  Xem [hướng dẫn cấu hình và vận hành](./email-notifications.md).
- Collection local Tickets/Orders đã bổ sung mô tả email và sửa assertion trạng
  thái tạo đơn trong Race thành `pending_payment`. Đã thao tác Import/Replace
  trên Postman; chưa xác minh lại nội dung lưu trên server sau reload.


## Sửa test và xác minh PostgreSQL/OCR — 11/10/2026

- Đã sửa 8 lỗi kiểu dữ liệu test: AuthorizedRequest cho refresh, callback generic của OrderStore.locked và reason của ReviewTicketDto.
- `npx tsc --noEmit --incremental false` và `npm run build`: đạt.
- Jest mặc định: 217 test đạt, 15 test tích hợp bỏ qua nếu chưa bật cờ.
- Chạy PostgreSQL/OCR có bật cờ: 15/15 đạt. Bao gồm hai thanh toán đồng thời chỉ phân bổ một vé, hoàn tiền bên còn lại, rollback/idempotency, guard HTTP Orders và PDF thật → OCR → duyệt thủ công → thanh toán → nhận đúng bytes file gốc.
- Schema test có tên ngẫu nhiên, áp dụng SQL Orders và Ticket review trong schema đó; không chạy worker lên hàng chờ thật. Tự duyệt vẫn tắt.
- Lần đầu test OCR thiếu TESSDATA_PREFIX trong môi trường tiến trình con; đã chạy lại thành công khi nạp trước Jest. Lệnh `npm run test:purchase-flow` chuẩn bị môi trường và PDF mẫu để tái lập.
- Đã cập nhật collection Tickets/Orders trên Postman workspace nesjs; chưa chạy Collection Runner ở workspace. Script của 42 request local đã kiểm tra cú pháp.
- Các mục lỗi TypeScript/chưa kiểm chứng phía dưới là lịch sử trước lần sửa này.

## Kiểm tra trước commit bộ test — 11/10/2026

- `npm test -- --runInBand`: 22 suites đạt, 1 suite bỏ qua; 217 tests đạt, 14 tests bỏ qua. Suite PostgreSQL cần bật `ORDERS_PG_TEST`; lượt này không chạy kiểm thử database hoặc E2E.
- `npx tsc --noEmit --incremental false`: chưa đạt, có 8 lỗi kiểu dữ liệu trong `auth.controller.spec.ts`, `orders.service.spec.ts`, `ticket-review.service.spec.ts`. Kết quả Jest đạt không thay thế kiểm tra kiểu dữ liệu toàn dự án.
- Các seed SQL được lưu làm dữ liệu mẫu, chưa thực thi hoặc xác minh trong lượt commit này.

## Đối chiếu tài liệu — 07/10/2026

Đã đối chiếu Auth/Users/Tickets với controller, DTO và service; cập nhật phạm vi
module, phân quyền duyệt vé, ví dụ request/response và hợp đồng đăng bán vé.
Các kết quả build/test/Newman bên dưới thuộc từng lượt lịch sử, không xác nhận
toàn bộ mã nguồn hiện tại đã được kiểm thử. Lượt này chỉ cập nhật tài liệu và
kiểm tra liên kết/nội dung; không chạy build, test, API, worker, SQL hoặc seed.

## Events chỉ dùng banner — 05/10/2026

Đã bỏ thumbnail/thumbnailUrl và shortDescription khỏi entity, DTO, API tạo/sửa
và response. Tạo sự kiện yêu cầu một banner; cập nhật có thể giữ hoặc thay banner.
API ảnh công khai và quản trị chỉ phục vụ banner. Docs và hai collection Postman
Events/Events CRUD đã đồng bộ; đã đọc lại workspace, không còn trường cũ.

- Build (`npm run build`): đạt.
- TypeScript (`tsc --noEmit --incremental false`): đạt, xác nhận ngày 06/10/2026.
- Không chạy test, Newman, SQL hoặc seed trong lượt này.
- [SQL bỏ hai cột cũ](./event-banner-only.sql) dành cho môi trường tắt
  DB_SYNCHRONIZE; chưa áp dụng vào database và không xóa file thumbnail cũ.
- Chưa kiểm tra runtime upload, thay/xóa banner, rollback hoặc API ảnh sau thay đổi.

## Cập nhật CRUD Events — 01/10/2026

Build và TypeScript đạt. Newman local đạt 37 request/48 assertions; đã kiểm tra
quyền ADMIN/MODERATOR/USER, CRUD, bộ lọc, status, thay ảnh và dọn cả 5 file phát
sinh sau xóa. Chưa kiểm tra cạnh tranh cập nhật thực tế, lỗi I/O hoặc rollback do
sự cố database. Các mục Auth/Users bên dưới là lịch sử kiểm chứng riêng.

Cập nhật ngày 30/09/2026. Tài liệu này phân biệt code đã bổ sung và kiểm chứng thực sự đã hoàn thành; không phải báo cáo nghiệm thu toàn bộ.

## Kết quả đã ghi nhận trước khi dừng kiểm tra

| Hạng mục | Trạng thái |
| --- | --- |
| TypeScript --noEmit | Đạt |
| Unit test | 9 suite, 40 test đạt |
| HTTP/E2E cho phân quyền mới | Đã bổ sung test; lượt chạy bị dừng, chưa xác nhận kết quả cuối |
| ESLint cho thay đổi mới | Lượt chạy bị dừng, chưa xác nhận hoàn tất |
| Build đầy đủ sau thay đổi phân quyền mới | Chưa xác nhận |
| PostgreSQL: hai yêu cầu đổi mật khẩu đồng thời | Chưa triển khai/chạy test riêng |
| Postman/Newman cho ma trận phân quyền mới | Chưa tạo/cập nhật collection và chưa chạy |
| Staging | Chưa triển khai/kiểm chứng |

Theo yêu cầu của người dùng, lượt cập nhật tài liệu không chạy lại test, build hoặc lint.

Collection login đã có trong [docs/postman](./postman/login.postman_collection.json) không thay thế collection kiểm tra phân quyền. Kết quả kiểm thử login ở các lượt trước không chứng minh đầy đủ các API /me và giới hạn admin mới.

## Checklist khi tiếp tục kiểm chứng

- Chạy ma trận khách, USER, MODERATOR, ADMIN cho các endpoint Users.
- Kiểm tra route thiếu/xung đột chính sách, method ghi đè chính sách controller và ADMIN không có quyền vượt policy.
- User A không sửa được user B bằng ID hoặc trường chèn vào body.
- DTO không lộ password/hash/tokenVersion hoặc trường entity riêng tư mới.
- Sửa tên không thu hồi phiên; đổi mật khẩu đúng thu hồi cả access và refresh token.
- Sai mật khẩu hiện tại hoặc password mới không hợp lệ không ghi dữ liệu.
- Hai yêu cầu đổi mật khẩu cùng dữ liệu cũ chỉ một yêu cầu ghi thành công; xác nhận bằng PostgreSQL riêng cho test.
- ADMIN không còn đổi email, đặt mật khẩu hoặc xóa user qua API cũ.
- Kiểm tra cookie jar login → refresh → logout và xóa cookie sau đổi mật khẩu.
- Kiểm tra audit có request ID, actor/action/target/result và không chứa dữ liệu bí mật.
- Dùng tài khoản/database test riêng cho Postman hoặc kiểm tra tích hợp; dọn đúng dữ liệu test sau chạy.

## Lệnh tham khảo — chưa chạy lại trong lượt tài liệu

```bash
npm run build
npx tsc --noEmit --incremental false
npm test -- --runInBand
npm run test:e2e -- --runInBand
npx eslint "src/**/*.ts" "test/**/*.ts"
```

Lệnh npm run lint hiện có tùy chọn --fix; lệnh eslint ở trên dùng để kiểm tra mà không tự sửa code. Unit/E2E hiện chạy Jest với experimental VM modules cho các dependency ESM. HTTP test dùng repository trong bộ nhớ, không chứng minh kết nối hay hành vi đồng thời của PostgreSQL thật.

## Trước triển khai

1. Kiểm tra cột Users.tokenVersion; dùng [SQL bổ sung](./token-version.sql) nếu thiếu.
2. Chốt cấu hình synchronize phù hợp môi trường; không cần bảng role/permission mới.
3. Cập nhật client theo các [thay đổi API Users](./users-api.md).
4. Hoàn thành các mục còn thiếu ở bảng kiểm chứng rồi chạy trên staging.
5. Kiểm tra nơi thu thập log AuthorizationAudit; hiện chỉ có logger ứng dụng.
# Bổ sung chức năng tạo sự kiện

POST /api/events cho ADMIN/MODERATOR và GET ảnh công khai đã được triển khai.
Đã chạy TypeScript và build; chưa chạy unit/HTTP test hoặc collection Events theo yêu cầu.
Chưa xác minh runtime PostgreSQL, rollback file hoặc upload bằng Postman.
Không chạy seed/migration và không thay đổi schema trong đợt này.

## Ghim sự kiện — 05/10/2026

Đã thêm PATCH /api/events/:id/pin cho ADMIN/MODERATOR và GET /api/events/pinned
public. Tối đa 4 suất ghim published chưa kết thúc; ghim lặp giữ thứ tự; hủy đồng
thời bỏ ghim. Transaction READ COMMITTED và khóa advisory chung bảo vệ giới hạn.

- Build (`npm run build`): đạt.
- TypeScript (`tsc --noEmit --incremental false`): đạt.
- Đã đọc lại Postman workspace: Events 12 request, CRUD 27 request; token,
  script, body và file của các request cũ được giữ. Ba request mới nằm sau công bố
  và trước xóa trong CRUD. Đã đồng bộ collection trong repo.
- Không chạy unit/HTTP test, Newman, SQL hoặc seed trong lượt này.
- [SQL cộng thêm cột/index](./event-pinning.sql) phải áp dụng trước phiên bản mới
  khi DB_SYNCHRONIZE tắt; dữ liệu cũ mặc định chưa ghim.

Các tình huống bàn giao chưa chạy trên runtime/database:

- ADMIN/MODERATOR ghim được mọi sự kiện phù hợp; USER/khách không ghi được.
- Ghim 4 sự kiện, từ chối sự kiện thứ 5; hai request tranh suất cuối không vượt 4.
- Ghim lặp giữ pinnedAt; bỏ ghim rồi ghim lại đưa sự kiện lên đầu.
- Chỉ published chưa kết thúc xuất hiện, bao gồm đang diễn ra; hết giờ không chiếm suất.
- Hủy đồng thời xóa cờ/thời gian ghim; xóa giải phóng suất; bỏ ghim được ở mọi trạng thái.
- Danh sách trả 0–4 phần tử, đúng thứ tự, không chứa createdBy, không tự bù sự kiện khác.
- Body ghim bắt buộc boolean; API nội dung không nhận isPinned/pinnedAt;
  /api/events/pinned không bị hiểu nhầm thành route /:id.

## Kiểm tra/duyệt vé — 07/10/2026

### Cấu hình local bổ sung

Đã cài runtime Python/Tesseract và dữ liệu vie/eng, áp dụng SQL bổ sung vào
PostgreSQL local, lưu HMAC secret trong .env (ignored) và tắt synchronize.
Đã khởi động worker riêng, ghi nhận module/database khởi tạo thành công.
Tự duyệt vẫn tắt. Chưa chạy OCR trên vé, build, TypeScript riêng, test hoặc Newman.
API local cổng 7000 chưa chạy trong lượt này. Các mục chưa kiểm chứng bên dưới
là trạng thái ở thời điểm commit code trước khi cấu hình runtime.

### Lịch sử trước cấu hình local

Lượt triển khai code đã bổ sung OCR local, QR/barcode, queue PostgreSQL, tự duyệt
và API quản trị nhưng chưa chạy build, TypeScript, test, Newman, scanner hoặc
worker; chưa cài dependencies hoặc áp dụng SQL ở thời điểm đó. Bước cấu hình
local phía trên đã bổ sung runtime/schema và khởi tạo worker. Chưa có kết quả
OCR trên vé hoặc kiểm thử duyệt vé/đồng thời; tự duyệt và worker nhúng API vẫn tắt.


## PDF/OCR upgrade verification - 2026-10-11

- Ticket module: 6 suites, 43 tests passed (`npm test -- --runInBand src/modules/tickets`). Includes rejection of image uploads and PNG bytes disguised as PDF, and optional unparseable price preventing automatic approval.
- Python extraction: 8 tests passed (`python -m unittest discover -s scripts/ticket-scanner -p test_*.py`). Covers conflicting/invalid evidence, calendar/time validation, Unicode and price normalization.
- Real local PDF render + Tesseract + QR scan: all 5 generated image-only PDFs completed. Code counts: ticket=1, duplicate-code=1, missing-code=0, multiple-codes=2, uncertain-price=1. USD price retained evidence with null value. Some OCR fields scored below 95, correctly requiring manual review.
- `npm run build`: passed. No production queue, database approval, payment, or real issuer validation was exercised. Automatic approval remains disabled.
- Full-project `tsc --noEmit --incremental false` in the preceding review had existing test typing failures in auth.controller.spec.ts, orders.service.spec.ts and ticket-review.service.spec.ts; this ticket-scoped verification does not claim full-project test health.
