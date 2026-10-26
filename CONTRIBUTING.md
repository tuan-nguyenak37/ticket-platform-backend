# Đóng góp cho TicketVerse Backend

Repo này chỉ chứa backend. Frontend có repo riêng; không đưa toàn bộ thư mục dự
án cha, bản sao `.git` hoặc dữ liệu máy cá nhân vào commit.

## Trước khi sửa

1. Đọc [README](README.md), [phạm vi mã nguồn](docs/source-scope.md) và tài liệu
   nghiệp vụ liên quan trong [mục lục](docs/README.md).
2. Kiểm tra `git status --short --branch`. Không reset, clean hoặc ghi đè các
   thay đổi có sẵn của người khác để tạo một working tree sạch.
3. Làm việc trên nhánh chức năng từ `main` đã đồng bộ. Nếu workspace có mã legacy
   khác snapshot Git, đối chiếu từng phần trước; không tạo nhánh rồi gom tất cả
   thay đổi có sẵn thành tính năng mới.

## Nhánh và commit

- Nhánh: `feat/<chu-de>`, `fix/<chu-de>`, `docs/<chu-de>`, `chore/<chu-de>`.
- Commit theo Conventional Commits: `type(scope): mô tả ngắn`.
- Type: `feat`, `fix`, `docs`, `refactor`, `test`, `build`, `ci`, `chore`, `perf`.
- Scope thể hiện thành phần: `auth`, `orders`, `payments`, `resale`, `tickets`,
  `events`, `organizers`, `admin`, `config`, `backend`.
- Mỗi commit có một mục đích; không trộn sửa giao diện, refactor và thay đổi tiền.
- Đánh dấu thay đổi phá vỡ tương thích bằng `!` và giải thích trong phần
  `BREAKING CHANGE:`. Nêu rõ cách chuyển đổi API và dữ liệu.

Ví dụ:

```text
fix(payments): preserve idempotency during payment recovery
docs(backend): document local setup and contribution workflow
ci(backend): cancel superseded validation runs
```

Chỉ stage đường dẫn đã xem diff. Đọc cả `git diff --cached` và danh sách file
untracked; `git diff` không bao gồm file mới chưa stage. Không mặc định dùng
`git add .` hoặc `git commit -am`. Không amend, viết lại lịch sử hay force-push
nhánh đã chia sẻ nếu chưa thống nhất.

## Quy tắc mã nguồn và dữ liệu

- Dùng TypeScript, cấu trúc module NestJS và formatter đang có; không thêm công
  cụ tương đương hoặc dependency chỉ để sửa một việc nhỏ.
- API phải có chính sách xác thực/quyền rõ ràng và kiểm tra chủ sở hữu ở backend.
- Không sửa migration đã áp dụng. Thay đổi schema cần migration mới và mô tả
  tương thích dữ liệu; không thay bằng SQL thủ công hoặc bật synchronize.
- Giữ tiền ở số nguyên VND, tính tiền/phí ở server, bảo toàn idempotency và
  transaction. Callback trình duyệt không phải bằng chứng thanh toán.
- Không đưa lại chức năng legacy đã loại khỏi [phạm vi](docs/source-scope.md).
- Không ghi secret, token, cookie, số tài khoản đầy đủ hoặc dữ liệu thẻ vào log,
  fixture, ảnh chụp hay mô tả pull request.

## Kiểm tra và pull request

Các lệnh này áp dụng cho snapshot Git sạch, với `package.json` và lockfile cùng
phiên bản. Không dùng package/config legacy trong workspace cá nhân để đánh giá
bản được push.

```sh
npm ci
npm run lint
npm run format:check
npm run typecheck
npm test -- --runInBand
npm run build
```

`lint` và `format:check` trong snapshot Git không sửa file. Kiểm tra tích hợp cần
môi trường riêng; không chạy migration, seed, gửi thư hoặc gọi dịch vụ thanh toán
chỉ để làm CI xanh. Không chạy kiểm thử khi chủ dự án đã yêu cầu không chạy;
ghi rõ **chưa chạy** và lý do, không dùng kết quả lịch sử thay cho kiểm chứng mới.

Mở pull request vào `main`, điền mẫu có sẵn và nêu tác động API, migration,
cấu hình, quyền truy cập và thanh toán. CI phải thành công trước khi merge;
test tích hợp/nhà cung cấp chưa chạy phải được ghi rõ. Không bỏ kiểm tra để
che lỗi. Ưu tiên squash merge với tiêu đề Conventional Commit cho thay đổi
thông thường; giữ các commit theo phụ thuộc nếu cần lịch sử nhiều bước rõ ràng.

Xem [quy trình Git](docs/git-workflow.md) và [chính sách bảo mật](SECURITY.md).
