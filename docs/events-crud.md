# CRUD sự kiện

Cập nhật 05/10/2026. Bảng dưới đây tóm tắt đường dẫn, dữ liệu đầu vào và response;
bấm vào từng API để xem kiểu dữ liệu, giới hạn và ví dụ response đầy đủ.

ADMIN và MODERATOR quản lý mọi sự kiện, kể cả do người khác tạo. USER/khách đọc API
public. Các thao tác ghi có audit events.create/update/delete.

| API | Tham số | Response thành công |
| --- | --- | --- |
| [`POST /api/events`](./events-api.md#create) | Bearer; multipart: name, venueName, address, categoryId, startTime, endTime, thumbnail, banner bắt buộc; shortDescription, description, status tùy chọn | 201; data là đầy đủ sự kiện quản lý, có createdBy |
| [`GET /api/events`](./events-api.md#list-public) | Query tùy chọn: page, limit, q, categoryId, phase; không body | 200; data = { items, total, page, limit }; items public không có createdBy |
| [`GET /api/events/:id`](./events-api.md#detail-public) | Path: id; không body hoặc query nghiệp vụ | 200; data là sự kiện public, gồm phase, không có createdBy |
| [`GET /api/events/manage`](./events-api.md#list-manage) | Bearer; query tùy chọn: page, limit, q, categoryId, phase, status | 200; data = { items, total, page, limit }; items có createdBy |
| [`GET /api/events/manage/:id`](./events-api.md#detail-manage) | Bearer; path: id; không body | 200; data là đầy đủ sự kiện quản lý, kể cả draft |
| [`PATCH /api/events/:id`](./events-api.md#update) | Bearer; path: id; JSON hoặc multipart, gửi ít nhất một field/ảnh cần sửa | 200; data là đầy đủ sự kiện sau cập nhật, có createdBy và phase |
| [`DELETE /api/events/:id`](./events-api.md#delete) | Bearer; path: id; không body | 200; data = { event_id, message: "Event deleted" } |
| [`GET /api/events/:id/images/:kind`](./events-api.md#image-public) | Path: id, kind=thumbnail hoặc banner; không body; query file không cần gửi | 200; body nhị phân ảnh, Content-Type tương ứng; không JSON envelope |
| [`GET /api/events/manage/:id/images/:kind`](./events-api.md#image-manage) | Bearer; path: id, kind=thumbnail hoặc banner; không body | 200; body nhị phân ảnh, kể cả draft; không JSON envelope |

## Quy tắc đọc và cập nhật

Danh sách public chỉ có published; chi tiết/ảnh public đọc được published/cancelled.
API manage đọc được draft. Public không trả createdBy; POST/PATCH/manage có createdBy.
Phase là upcoming/ongoing/ended được tính từ startTime/endTime. Các response JSON
dùng lớp bọc chuẩn; response ảnh là byte ảnh với Content-Type tương ứng.

PATCH giữ nguyên field/ảnh bị bỏ qua. Có thể thay riêng thumbnail hoặc banner.
Hai mô tả xóa bằng null trong JSON hoặc chuỗi rỗng. Thời gian được kiểm tra sau khi
kết hợp dữ liệu đang lưu. Khi đổi category hoặc công bố draft, category phải active.

Vòng đời: draft → published → cancelled. Công bố yêu cầu startTime còn ở tương lai.
Published đã bắt đầu chỉ được hủy trước endTime bằng body chỉ có status=cancelled;
cancelled không sửa tiếp. Xóa được ở mọi trạng thái, kể cả published/cancelled,
nếu không có khóa ngoại từ tài nguyên khác ngăn xóa.

## Database và file local

Update khóa bản ghi trong transaction và đọc dữ liệu mới nhất. Hai PATCH được
tuần tự hóa; cùng sửa một field thì request thực hiện sau quyết định giá trị cuối.
Chưa có optimistic version từ client. Ảnh mới được dọn khi rollback; ảnh cũ được
dọn sau commit. Xóa bản ghi thành công mới dọn ảnh.

Lỗi dọn file được log, không đảo ngược dữ liệu đã commit. Sự cố tiến trình vẫn có
thể để lại file mồ côi. Thư mục uploads không được mở static công khai; API đọc ảnh
kiểm tra trạng thái sự kiện hoặc quyền quản lý.

## Kiểm chứng đã ghi nhận

Lượt local ngày 01/10/2026: 37 request, 48 assertions đạt; hai event test đã xóa,
5 file ảnh phát sinh đã được dọn. Build và TypeScript đạt trong lượt triển khai đó.
Chưa kiểm tra lỗi I/O, sự cố database và cập nhật đồng thời thực tế.
Lượt 05/10/2026 chỉ cập nhật tài liệu theo code, không chạy lại backend/test.

Collection: [Events CRUD](./postman/events-crud.postman_collection.json).
Môi trường: Backend Local - Events. [Hướng dẫn Postman local](./postman/local-setup.md).
