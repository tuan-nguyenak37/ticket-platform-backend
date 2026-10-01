# Tạo sự kiện và ảnh local

## POST /api/events

ADMIN và MODERATOR được gọi bằng Bearer access token. USER nhận 403; khách hoặc
phiên không hợp lệ nhận 401. Gửi multipart/form-data, để client tự tạo boundary.

| Field | Quy tắc |
| --- | --- |
| name | Bắt buộc, trim, 1–255 ký tự |
| shortDescription | Tùy chọn, tối đa 500 ký tự |
| description | Tùy chọn, văn bản thuần, tối đa 20.000 ký tự; frontend hiển thị như text |
| startTime, endTime | ISO 8601 có múi giờ; endTime > startTime |
| venueName | Bắt buộc, trim, 1–255 ký tự |
| address | Bắt buộc, trim, 1–500 ký tự |
| categoryId | category_id có sẵn, đang hoạt động |
| status | draft (mặc định) hoặc published; published phải bắt đầu trong tương lai |
| thumbnail, banner | Mỗi field đúng một file JPEG/PNG/GIF/WebP, bắt buộc cả hai |

Giới hạn mặc định 10 MB mỗi file, lấy từ UPLOAD_MAX_FILE_SIZE_MB. Không nhận PDF
cho ảnh sự kiện. MIME và chữ ký đầu file phải khớp; không phải giải mã ảnh đầy đủ.
Không nhận event_id, createdBy, thumbnailUrl, bannerUrl hoặc trường ngoài DTO.

Trả 201 với envelope chuẩn và data gồm event_id, các thông tin sự kiện, categoryId,
status, createdBy, createdAt, updatedAt, thumbnailUrl và bannerUrl. Không trả entity
User hoặc đường dẫn ổ đĩa. createdBy lấy từ principal.

Ảnh lưu tại UPLOAD_DIR/events bằng UUID. Category được khóa trong transaction;
nếu ghi ảnh hoặc lưu database thất bại, các ảnh của request được dọn. Lỗi dọn file
được ghi log; sự cố tiến trình có thể để lại file mồ côi, chưa có tác vụ quét định kỳ.

## GET /api/events/:id/images/:kind

kind là thumbnail hoặc banner. Endpoint công khai chỉ trả ảnh của published hoặc
cancelled; draft/file thiếu trả 404. Response là dữ liệu ảnh với MIME phù hợp,
X-Content-Type-Options: nosniff và Cache-Control: no-store, không có JSON envelope.

URL tương đối do server sinh có dạng
`/api/events/<id>/images/thumbnail?file=<uuid>.jpg`. Query file trong URL được lưu
ở database để ánh xạ ảnh mà không thêm cột. Server chỉ dùng filename lấy từ database,
bỏ qua query do client gửi. Không mở static uploads. Giao diện dùng file vừa chọn
để preview draft; chưa có API đọc ảnh draft.

## Lỗi và phạm vi

- 400: thiếu/thừa ảnh, loại file hoặc dữ liệu sai, category không hợp lệ.
- 413: quá dung lượng mỗi file.
- 401/403: xác thực/phân quyền; 404: ảnh không tồn tại hoặc không công khai.
- Lỗi lưu trữ/database không dự kiến trả 500 qua exception filter hiện có.
- Audit events.create ghi actor, target event ID khi thành công, request ID và kết quả.
- Chưa có API danh sách, sửa, xóa hoặc công bố draft; các route mẫu đã gỡ.

## Bàn giao kiểm tra

Collection: `postman/events.postman_collection.json`. baseUrl là origin, không gồm
/api. Điền token theo role, categoryId đang hoạt động và chọn hai file local trước
khi gửi. Collection tạo dữ liệu thật khi chạy.

Các trường hợp cần kiểm tra: ADMIN/MODERATOR tạo draft/published; USER/khách bị chặn;
thiếu/thừa ảnh, PDF, MIME giả, quá dung lượng; category sai/inactive; thời gian sai;
giả mạo createdBy; ảnh published đọc được, draft bị chặn; rollback dọn file khi
database lỗi. Lỗi database và thao tác category đồng thời cần kiểm tra tích hợp riêng.

Đợt này chỉ xác minh build và TypeScript, không chạy test, Newman, seed hoặc migration.
