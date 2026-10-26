# Chính sách bảo mật

## Phạm vi hỗ trợ

Chỉ mã mới nhất trên `main` được duy trì trong giai đoạn phát triển. Chưa có bản
production được chứng nhận; CI thành công không thay cho nghiệm thu bảo mật,
thanh toán hoặc chi trả thực tế.

## Báo cáo riêng tư

Không đăng lỗ hổng có thể khai thác hoặc thông tin bí mật vào issue/pull request
công khai. Dùng mục **Security → Report a vulnerability** trên GitHub nếu repo
đã bật private vulnerability reporting. Nếu mục đó chưa có, liên hệ trực tiếp
chủ repo qua kênh riêng đã thống nhất; không tạo issue công khai để gửi bằng
chứng nhạy cảm.

Cung cấp phiên bản/commit, phạm vi ảnh hưởng, bước tái hiện tối thiểu bằng dữ
liệu giả và tác động dự kiến. Không tấn công hệ thống thật, giao dịch tiền thật
hoặc truy cập dữ liệu người dùng khác để chứng minh lỗi. Chưa cam kết SLA phản
hồi hoặc chương trình thưởng.

## Secrets và dữ liệu cá nhân

- Không commit `.env`, cookie/JWT, SMTP app password, merchant secret, URL chứa
  mật khẩu, private key, dump DB hoặc dữ liệu tài khoản ngân hàng thật.
- `.env.example` chỉ chứa placeholder; dùng biến bí mật của môi trường triển
  khai hoặc GitHub Actions Secrets khi có nhu cầu thực sự.
- Không lưu refresh token trong JavaScript storage hoặc trả qua JSON/HTML.
- Thu thập thông tin thẻ/OTP trên cổng thanh toán, không trong issue hay log.
- Không dùng VNPay Refund để chuyển tiền bán lại; bộ xử lý chi trả MOCK không
  chuyển tiền thật và không được bật trong production.

Nếu credential từng xuất hiện trong Git, chat hoặc file export công khai:

1. Thu hồi/thay credential ngay tại nhà cung cấp, kể cả đã xóa repo hoặc commit.
2. Thu hồi phiên liên quan nếu cần và rà log truy cập bằng kênh an toàn.
3. Loại giá trị khỏi mã, mẫu cấu hình và artifact; phối hợp xử lý lịch sử nếu
   cần. Không tự force-push lịch sử dùng chung.
4. Kiểm tra bản sao/fork, CI log, cache và artifact. Xóa file ở commit mới không
   làm credential trong lịch sử trở lại an toàn.

`.gitignore` không bảo vệ file đã tracked và không phải công cụ quét secrets.
Bật secret scanning/push protection trên GitHub nếu tính năng có sẵn cho repo;
không coi kiểm tra tên file hoặc vài mẫu token là kiểm toán đầy đủ.
