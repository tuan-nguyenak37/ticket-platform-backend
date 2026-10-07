# Kiểm tra và duyệt vé

## Luồng và điều kiện tự duyệt

POST /api/tickets vẫn trả 201 với vé pending_review. Server lưu SHA-256 của file
và TicketCheck queued trong cùng transaction. Worker độc lập đọc ảnh/PDF, giải
mã QR/barcode, OCR local, đối chiếu và thử duyệt. API không chờ OCR.

Một Ticket tương ứng một vé. Tesseract vie+eng và bộ quy tắc trích xuất đọc các
nhãn rõ ràng: eventName/date/time/venue/ticketTier/seat/originalPrice. Không có LLM
hoặc dịch vụ AI cloud. Không thấy nhãn/giá trị mâu thuẫn thì missing/uncertain;
không điền từ thông tin người bán. Chỉ nhận định dạng ngày dd/mm/yyyy hoặc dd-mm-yyyy;
OCR giá gốc hỗ trợ VND nguyên, chưa tự suy luận tiền tệ/giá có phần thập phân.

TICKET_AUTO_APPROVE_ENABLED mặc định false. Khi bật, các điều kiện phải đồng thời đạt:

- Ticket pending, check completed và đúng phiên bản; Event published chưa kết thúc.
- Đúng một mã khác biệt, không có lỗi xử lý/trang bị bỏ qua.
- Tên sự kiện, ngày, hạng vé và ghế (nếu người bán nhập) khớp sau chuẩn hóa
  Unicode/khoảng trắng/hoa thường, độ tin cậy tối thiểu 95/100 trên mỗi trường.
- Giá/giờ/địa điểm nếu đọc được không có mâu thuẫn hoặc độ tin cậy thấp.
- Không có file trùng ở bất kỳ sự kiện nào, mã trùng cùng Event ở bất kỳ trạng thái.
- Không còn vé available/holding/sold lịch sử thiếu fingerprint trong database.

Không đạt thì outcome=needs_review, giữ pending. Lỗi scanner/thiếu mã không tự
reject. Ngưỡng OCR không phải xác suất vé thật. Nhãn sản phẩm: “Đã kiểm tra thông tin”.

## Dữ liệu, đồng thời và riêng tư

Ticket bổ sung fileHash, approvedCodeFingerprint, reviewMethod. TicketCheck lưu
job và kết quả hiện tại; TicketReview lưu một quyết định cuối cùng. Automatic có
verifiedBy=null, manual dùng actor; verifiedAt do server đặt.

Mã được HMAC-SHA-256 trên bytes gốc. Payload chỉ truyền local trong bộ nhớ rồi
chuyển HMAC; không lưu/log hay trả fingerprint qua API. OCR evidence chứa mã đã
đọc được được che trước khi lưu. Không mở URL trong QR. Không mở static uploads.

Report đối chiếu Event và tìm trùng hiện tại. Quyết định khóa Event → Ticket →
TicketCheck, rồi advisory lock theo Event+fingerprint; kiểm tra mã sau khi lấy khóa.
Unique index bảo vệ mã thuộc available/holding/sold. Quyết định và TicketReview
ghi trong cùng transaction. Hủy thắng trước thì job không đưa vé về available.

Manual cho xem xét mã trùng bản cũ cancelled/rejected/expired kèm ghi chú, nhưng
không cho trùng available/holding/sold. Nhiều mã phải chọn một decoded code ID.
Không đọc được mã thì không approve và không được nhập mã bằng tay.

## API quản trị

Tất cả route yêu cầu Bearer token ADMIN/MODERATOR. Không tự duyệt vé mình đăng.

| Method và URL | Đầu vào | Response data |
| --- | --- | --- |
| GET /api/tickets/manage | Query bên dưới | {items,total,page,limit} |
| GET /api/tickets/manage/:id | Path id=ticket_id | DTO quản trị + event/check/review/fileUrl |
| GET /api/tickets/manage/:id/file | Path id; không body/query | File nhị phân, MIME đúng, no-store/nosniff |
| POST /api/tickets/manage/:id/check | Path id; không body/query | 202; {ticket_id,status,version} |
| PATCH /api/tickets/:id/review | Path id; JSON bên dưới | 200; DTO quản trị sau quyết định |

Danh sách: page=1, limit=20 (1–100), q, eventId, categoryId, ticketTier, minPrice,
maxPrice như API public; thêm status, checkStatus, reviewMethod. Thứ tự cố định
createdAt ASC rồi ticket_id ASC, sort chung không đổi thứ tự hàng chờ. Mặc định
chỉ pending với outcome=needs_review/failed hoặc vé cũ chưa có check. Truyền
status/checkStatus để xem queued/processing hoặc nhóm khác. Không trả file/OCR/hash.

Chi tiết dùng DTO Ticket quản trị hiện có cộng reviewMethod, tóm tắt Event như
public listing, fileUrl=/api/tickets/manage/:id/file, check/review nullable.
check gồm status, outcome, version, attempts, completedAt, errorCode, engineVersion,
codes (id/format/page/box) và report. Report chứa outcome, reasons, fields, duplicates.

Ví dụ phần check trong data của response 200:

```json
{
  "status":"completed","outcome":"needs_review","version":1,"attempts":1,
  "completedAt":"2026-10-07T08:00:00.000Z","errorCode":null,"engineVersion":"local-ticket-v1",
  "codes":[{"id":"11111111-1111-4111-8111-111111111111","format":"QRCode","page":1,"box":[10,10,100,100]}],
  "report":{
    "outcome":"needs_review","reasons":["automatic_approval_disabled"],
    "fields":[{"field":"ticketTier","expected":"VIP","observed":"VIP","status":"match","confidence":97,"evidence":[{"text":"Hạng vé: VIP","confidence":97,"page":1,"box":[10,120,300,150]}]}],
    "duplicates":[]
  }
}
```

fields thực tế gồm eventName/date/time/venue/ticketTier/seat/originalPrice; expected/
observed nullable. Duplicate có ticketId/status/kind=file hoặc code; tối đa 100,
ưu tiên bản còn hiệu lực. Review snapshot có decision/method/actorId/checkVersion/
selectedCodeId/note/createdAt/report. JSON giữ envelope hiện có, file không bọc JSON.

Approve:

```json
{"decision":"approve","checkVersion":1,"selectedCodeId":"11111111-1111-4111-8111-111111111111","note":"Đã đối chiếu thủ công các cảnh báo."}
```

checkVersion là integer hiện tại, selectedCodeId là UUID trong codes hiện tại;
note tối đa 2000 ký tự, bắt buộc khi có cảnh báo. Check phải completed. Client
không truyền actor, thời gian, fingerprint hoặc status. Chỉ quyết định một lần.

Reject:

```json
{"decision":"reject","reason":"Thông tin hạng vé không phù hợp với file."}
```

Reason trim 1–2000 ký tự, không cần OCR completed. Vé bị từ chối cần đăng bản mới.
Check chỉ cho pending; queued/processing trả job hiện tại. Các trạng thái khác
tạo phiên bản tiếp theo khi cập nhật trước cách tối thiểu một phút. Kết quả cũ
giữ để tham khảo, không dùng approve khi lượt mới chưa completed.

## Cài đặt và vận hành local

Cần Python 3.10+ và Tesseract có vie/eng. Cài Python packages trong virtualenv:

```powershell
python -m venv .venv-ticket-scanner
.venv-ticket-scanner/Scripts/python.exe -m pip install -r scripts/ticket-scanner/requirements.txt
```

```dotenv
TICKET_WORKER_ENABLED=false
TICKET_AUTO_APPROVE_ENABLED=false
TICKET_PYTHON_PATH=.venv-ticket-scanner/Scripts/python.exe
TICKET_TESSERACT_PATH=C:/Program Files/Tesseract-OCR/tesseract.exe
TICKET_SCANNER_SCRIPT=scripts/ticket-scanner/scan.py
TICKET_SCAN_TIMEOUT_SECONDS=120
# Secret riêng ngẫu nhiên ít nhất 32 ký tự; không commit giá trị thật.
TICKET_CODE_HMAC_SECRET=replace-with-a-separate-random-secret
```

Chạy API như hiện tại, `npm run worker:tickets` ở tiến trình riêng từ root repo.
Production dùng `npm run worker:tickets:prod` sau quy trình build bên ngoài đợt này.
API/worker dùng chung database, UPLOAD_DIR, secret HMAC và cờ tự duyệt. Worker
startup kiểm tra dependencies/ngôn ngữ; API vẫn nhận vé nếu worker dừng. Có thể
nhúng worker trong API bằng TICKET_WORKER_ENABLED=true, mặc định false.

Một worker xử lý một job, poll 2 giây, timeout 120 giây (cấu hình 30–150), lease
180 giây, tối đa 3 lần thử; lỗi tạm thời retry sau 10/20 giây. PDF tối đa 5 trang,
GIF tối đa 5 frame, ảnh/render tối đa 20 megapixel mỗi trang, tối đa 32 mã phát hiện.
Lease hết hạn được nhận lại; kết quả version/lease cũ bị bỏ qua. Dọn render tạm.

Áp dụng [SQL bổ sung](./ticket-review-automation.sql) khi synchronize tắt, trước
khởi động phiên bản mới. Secret phải ổn định; thay secret cần kế hoạch quét lại.
Vé pending cũ chưa có check dùng API check. Vé đã duyệt thiếu fingerprint cần
đối chiếu/backfill riêng trước bật auto, không tự suy đoán dữ liệu lịch sử.

Audit: tickets.file.read, tickets.check.request, tickets.review.manual; worker
ghi tickets.check và tickets.review.automatic. Không log OCR, mã vé, file hoặc token.

## Trạng thái bàn giao

Chỉ triển khai code/docs/Postman. Không chạy build, TypeScript, test, Newman,
scanner, worker, migration hoặc seed; chưa cài dependencies hệ thống. Tự duyệt
mặc định tắt, chỉ bật sau đánh giá OCR và các tình huống đồng thời trên dữ liệu thực.
