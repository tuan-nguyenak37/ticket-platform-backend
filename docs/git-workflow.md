# Quy trình Git backend

## Nguồn chuẩn và workspace cục bộ

Backend và frontend là hai repo riêng. Backend dùng `main` với remote:
`https://github.com/tuan-nguyenak37/ticket-platform-backend.git`.

Lịch sử backend đã được xây dựng theo phạm vi trong
[source-scope.md](source-scope.md). Các biến thể legacy đã được đối chiếu và lưu
ngoài repo; xem [báo cáo đồng bộ](local-reconciliation.md). Đồng bộ `HEAD` với
`origin/main` không có nghĩa working tree đã sạch hoặc bản đang chạy giống mã
trên GitHub; luôn kiểm tra trạng thái thực tế.

Không đưa các thay đổi đó vào Git chỉ để làm sạch trạng thái. Không reset,
clean, checkout đè file hoặc tạo commit lớn để thay thế snapshot an toàn bằng
biến thể cũ. README và lệnh CI mô tả snapshot Git, không phải xác nhận rằng
package/config cục bộ tự động tương thích với snapshot Git.

Khi rà một khác biệt, phân loại thành:

1. Chức năng hợp lệ cần giữ: đối chiếu API, quyền, dữ liệu và migration, rồi
   tách thành commit có phạm vi và tài liệu/kiểm chứng tương ứng.
2. Mã cũ đã bị thay thế hoặc chức năng đã loại: không stage; giữ bản sao cá nhân
   cho đến khi chủ dự án đồng ý dọn. Không ignore toàn bộ `src` để giấu vấn đề.
3. Dữ liệu riêng, secret hoặc artifact: không commit; áp dụng `.gitignore` nếu
   phù hợp. Nếu đã tracked, cần xử lý riêng; ignore không loại khỏi lịch sử.

## Thay đổi mới

Chỉ bắt đầu từ working tree sạch sau khi xử lý khác biệt có sẵn. Nếu cần làm
song song, dùng checkout sạch riêng do chủ dự án chấp thuận thay vì xóa mã local.

```sh
git status --short --branch
git fetch origin
git switch main
git pull --ff-only origin main
git switch -c docs/backend-contribution-guide
```

Đổi tên nhánh theo công việc thực tế. Trước commit:

```sh
git diff -- README.md
git status --short
git add -- README.md CONTRIBUTING.md
git diff --cached --check
git diff --cached --stat
git diff --cached
git commit -m "docs(backend): document contribution workflow"
git push -u origin docs/backend-contribution-guide
```

Các đường dẫn trên chỉ là ví dụ cho đúng hai file đã rà. File mới chưa stage
không nằm trong `git diff`; phải đọc nội dung riêng. Không chạy chuỗi lệnh trên
một cách máy móc trên working tree đang có thay đổi.

Mở pull request vào `main`, nêu rõ kết quả kiểm chứng và chờ CI/review. Không tự
commit/push thay đổi khi chưa được người giao việc yêu cầu. Không force-push
`main`, không viết lại lịch sử đã chia sẻ chỉ để sửa thông điệp commit.

## CI và dependency

Workflow `Backend CI` kiểm tra push/PR vào `main`; cũng hỗ trợ chạy thủ công.
Job `validate` dùng Node.js 22, PostgreSQL test riêng, `npm ci`, lint không sửa
file, format check, typecheck, unit test và build. Lượt cũ trên cùng ref được
hủy khi có lượt mới. Không dùng credential production trong workflow.

Dependabot đề xuất cập nhật npm và GitHub Actions hàng tuần qua pull request;
không tự merge hoặc tự nâng dependency production. Rà lockfile, tương thích và
CI trước khi merge. Workflow chỉ chạy cấu hình đã được commit/push; có file YAML
cục bộ không chứng minh workflow trên GitHub đã chạy thành công.

## Thiết lập trên GitHub

Các bước này cần quyền quản trị repo và thực hiện qua GitHub; file trong repo
không tự bật bảo vệ nhánh hoặc tính năng bảo mật.

- **Rulesets / Branch protection:** chọn `main`; yêu cầu pull request, chặn
  xóa/force-push và yêu cầu check `validate` thành công. Chọn tên check thực tế
  sau khi workflow đã chạy. Không tự yêu cầu check chưa từng xuất hiện.
- **Review:** khi có reviewer khác, yêu cầu ít nhất một approval và xử lý hết
  discussion. Repo một người không nên cấu hình yêu cầu tự phê duyệt bất khả thi;
  vẫn dùng pull request và CI.
- **Actions:** giữ mặc định quyền `contents: read`; không cấp quyền ghi rộng
  hoặc cho workflow PR từ fork truy cập secrets. Không đổi sang
  `pull_request_target` để chạy mã PR không đáng tin cậy.
- **Security:** bật dependency graph/Dependabot alerts, secret scanning,
  push protection và private vulnerability reporting khi gói/quyền repo hỗ trợ.
- **Merge:** bật xóa nhánh sau merge; ưu tiên squash cho PR thông thường với
  tiêu đề Conventional Commit. Không bật auto-merge cho thay đổi tiền/quyền/schema.

Không cần tạo tag/release chỉ vì đã push. Chỉ đánh phiên bản khi có phạm vi,
changelog và nghiệm thu; không gắn nhãn production-ready cho bản chưa kiểm chứng.

## Checklist trước khi push

- Xem danh sách file và staged diff; không đưa dữ liệu local/legacy ngoài phạm vi.
- Kiểm tra cấu hình mẫu không chứa secret, tiền/tài khoản không xuất hiện trong log.
- `package.json` và `package-lock.json` phải cùng thay đổi khi dependency đổi.
- Tài liệu chỉ liên kết tới file có trong commit; không trỏ tới script local bị loại.
- Ghi đúng kiểm tra đã chạy/chưa chạy; không chạy test nếu đang có yêu cầu bỏ qua.
- Không chạy migration, seed hoặc thanh toán chỉ để hoàn thiện Git.

Xem [CONTRIBUTING](../CONTRIBUTING.md), [SECURITY](../SECURITY.md) và
[checklist phát hành](release-checklist.md).
