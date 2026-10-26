# Rà soát và đồng bộ backend local

Ngày thực hiện: 26/10/2026. Mốc đối chiếu: backend `main` tại `9e7fe38`, đã push
commit check-in. Lượt này không commit, stage hoặc push thêm; không sửa frontend.

## Bản lưu trước khi sửa

Thư mục nằm ngoài repo backend, trong workspace dự án:

```text
../.git-backups/backend-reconcile-20261026-194135/
  status-before.txt
  <các file tracked bị sửa trước lượt đồng bộ>
  legacy-src/src/                  8 file nguồn không được đăng ký/sử dụng
  legacy-workspace/docs/           tài liệu, Postman, SQL và báo cáo lịch sử
  legacy-workspace/scripts/        script legacy không thuộc bộ lệnh hiện hành
  archive-manifest.csv             đường dẫn và SHA-256 của 344 file tài liệu/script
```

Các thao tác chuyển file kiểm tra đường dẫn tuyệt đối và hash trước/sau. Dữ liệu
không bị xóa mất. `.env` riêng không được đọc hoặc sửa; không đưa bản lưu vào Git.
Không chạy file SQL, migration, seed hay script được lưu trữ để kiểm tra.

## Đã xử lý

| Nhóm | Quyết định |
| --- | --- |
| Cấu hình môi trường | Dùng chung schema hiện hành; trả lại kiểm tra secret, thanh toán, email và upload; cổng mặc định 7000 |
| Thanh toán | Khôi phục chặn PROJECT trong production ở schema và service; giữ nguyên xác minh VNPay, IPN, đơn miễn phí và check-in |
| PostgreSQL | CLI dùng chung validation/kết nối với server; migration chạy transaction và không log lỗi thô |
| Migration | Giữ registry đã publish, gồm migration check-in; không chạy migration hoặc sửa lịch sử database |
| Seed | Bắt buộc `--apply`, chỉ development/test; giữ ID danh mục hiện có khi cập nhật theo code |
| Báo cáo/hồ sơ | Trả lại no-store và validation báo cáo Organizer/Admin; giữ kiểm tra ngày và nhóm thống kê |
| Bán lại | Giữ kiểm tra DTO đăng bán, tài khoản nhận tiền và các chặn vé đã check-in; thống nhất kiểu email dùng chung |
| Upload | Chỉ giữ ảnh sự kiện hiện hành; gỡ các helper upload vé/tranh chấp không có consumer khỏi service đang chạy |
| Tooling | Đồng bộ manifest và lockfile với Git; giữ strict TypeScript, lint không tự sửa, các lệnh typecheck/format/migrate và engines |
| Email phát triển | Trả lại cấu hình Mailpit theo tài liệu, không thay cấu hình SMTP riêng |
| Mã cũ | Đưa 8 source không dùng và 344 tài liệu/script untracked vào bản lưu, không tự đưa chúng vào commit |
| Artifact | Giữ dữ liệu bên thứ ba và runtime trên máy, thêm ignore toàn bộ hai thư mục tương ứng; không ignore toàn bộ src |

Các thay đổi chỉ khác format, thứ tự import hoặc module wiring tương đương cũng
được đưa về cách tổ chức của snapshot đã publish. Phần đã khôi phục giống Git
sẽ không xuất hiện trong commit tiếp theo; đó không phải mất mã hay thiếu commit.

## Những phần được giữ để chuẩn bị commit riêng

1. **Tài liệu và quản lý Git:** README, mục lục tài liệu, xác thực, CONTRIBUTING,
   SECURITY, EditorConfig, Node version, Issue/PR templates, Dependabot, CI
   concurrency/manual dispatch và `.gitignore`.
2. **Danh sách khách:** ba file `event-tools.controller.ts`, `event-tools.dto.ts`,
   `event-tools.service.ts`; giữ phân trang, lọc suất diễn và CSV cho OWNER.
   Không phục hồi API mời nhân viên. Xem [hợp đồng API](event-attendees.md).
3. **Spec local:** `organizer-workspace.spec.ts`, `users.controller.spec.ts` và
   `users.service.spec.ts` được giữ lại, chưa stage/chạy. Đã đổi lời gọi nội bộ
   `controller.me` thành `controller.getProfile` cho khớp controller hiện hành.
   Các spec này còn cần rà lint và kiểm chứng trước khi commit.

Không dùng `git add .` để gom các nhóm trên. Các nhóm có phạm vi và mức kiểm
chứng khác nhau; tài liệu mới phải đi cùng file được liên kết trong commit.

## Kiểm chứng và giới hạn

- `npm run typecheck`: đạt, không phát sinh build output, dùng dependencies đã
  cài trên máy. Metadata gốc trong manifest/lockfile khớp sau so sánh cấu trúc.
- `git diff --check`: đạt ở thời điểm rà.
- `npm run lint`: chưa đạt, 495 lỗi gồm CRLF/format và lỗi kiểu/binding ở spec,
  cùng assertion dư thừa. Không hạ rule hoặc thêm disable để che lỗi.
- Chưa chạy test theo yêu cầu; chưa cài lại dependencies, build hoặc xác minh CI
  từ GitHub. Không gọi database, SMTP, Redis hay VNPay trong lượt đồng bộ này.
- Chưa áp dụng migration check-in; giao diện check-in còn cần bổ sung showingId
  và xử lý admitted/result đúng hợp đồng. Chưa chứng nhận sẵn sàng production.

Phần tiếp theo là xử lý lint có phạm vi, nghiệm thu trên môi trường phù hợp khi
được cho phép, rồi mới commit theo từng nhóm. Không khôi phục nguyên bản lưu đè
lên source hiện tại vì sẽ đưa lại cấu hình/luồng cũ vừa được loại.

## Cập nhật khi chuẩn bị commit — 26/10/2026

Các mục phía trên ghi nhận lượt đồng bộ trước đó. Theo yêu cầu commit toàn bộ
thay đổi backend còn lại, ba spec đã được sửa kiểu mock và định dạng; fixture
UsersService được tạo lại trước mỗi test để không chia sẻ dữ liệu bị sửa.

- ESLint của sáu file TypeScript chuẩn bị commit: đạt.
- `npm run typecheck` và `npm run build`: đạt, dùng dependencies đã cài.
- Rà 24 file chờ commit: không phát hiện mẫu secret độ tin cậy cao; liên kết
  tài liệu cục bộ tồn tại. Đây không phải kiểm toán bảo mật đầy đủ.
- Chưa chạy lại lint toàn dự án; lỗi ngoài phạm vi vẫn cần xử lý trước deploy.
- Không chạy test theo yêu cầu; không chạy migration, seed, thanh toán hoặc
  triển khai. Không sửa frontend, cấu hình riêng hoặc đưa bản lưu vào Git.

Các nhóm commit gồm API danh sách khách/CSV, ba spec, cấu hình quản lý repo và
tài liệu. Commit không thay thế bước push, kiểm chứng CI hay checklist phát hành.
