# Báo Cáo Đặc Tả Test Cases & Dữ Liệu Kiểm Thử (Events Module)

> **Dự án**: Nền tảng bán lại vé trực tuyến (Ticket Resell Platform)\
> **Module**: Quản lý Sự Kiện & Thể Loại (`Events Module`)\
> **Framework & Thư viện**: NestJS, Jest, TypeORM, Multer\
> **Tài liệu tham khảo**: [events-api.md](../events-api.md), [events-crud.md](../events-crud.md)

---

## 1. Mục Tiêu & Phạm Vi Kiểm Thử

### 1.1. Mục tiêu
- Kiểm thử các thao tác CRUD sự kiện dành cho Ban quản trị (`ADMIN`, `MODERATOR`), từ chối người dùng thường (`USER`).
- Đảm bảo tính toàn vẹn thời gian: `endTime` bắt buộc phải sau `startTime`, sự kiện phát hành (`published`) phải bắt đầu ở tương lai.
- Kiểm thử cơ chế ghim sự kiện (`isPinned`): Giới hạn tối đa 4 sự kiện ghim đồng thời, chỉ cho phép ghim sự kiện đã phát hành và chưa kết thúc, sử dụng khóa transaction chống race condition.
- Kiểm thử cơ chế dọn dẹp ảnh banner khi tạo/cập nhật sự kiện thất bại hoặc thay đổi banner mới.
- Đảm bảo người dùng công chúng chỉ xem được sự kiện `published` hoặc `cancelled`, không xem được sự kiện `draft`.

---

## 2. Danh Mục Mock Data (Dữ Liệu Thử Nghiệm)

| ID Sự Kiện | Tên Sự Kiện | Thể Loại | Trạng Thái | Đã Ghim | Mục Đích Kiểm Thử |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `evt_test_001` | Đại Nhạc Hội Mùa Hè 2026 | `event_cat_music` | `published` | Không | Sự kiện chuẩn hợp lệ, đang mở bán vé |
| `evt_draft_002`| Sự Kiện Bản Nháp | `event_cat_music` | `draft` | Không | Ẩn khỏi public, chỉ admin thấy trong manage list |
| `evt_cancelled_003`| Đêm Nhạc Bị Hủy | `event_cat_music` | `cancelled` | Không | Xem được chi tiết nhưng không cho chỉnh sửa |
| `evt_ended_004` | Lễ Hội Đã Kết Thúc | `event_cat_music` | `published` | Không | Không cho phép ghim hoặc hủy |
| `evt_pinned_005`| Sự Kiện Nổi Bật | `event_cat_music` | `published` | Có | Kiểm thử danh sách pinned (tối đa 4) |

---

## 3. Ma Trận Test Cases Chi Tiết (Test Matrix)

### Phân nhóm A: Tạo Sự Kiện Mới (`POST /api/events`)

| Mã TC | Phân loại | Điều kiện tiên quyết | Dữ liệu đầu vào | Các bước thực hiện | Kết quả mong đợi |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **TC-EVT-01** | Positive | Đăng nhập với quyền `ADMIN` hoặc `MODERATOR` | File banner hợp lệ, DTO thời gian tương lai | 1. Upload ảnh banner và form data sự kiện | - HTTP 201 Created<br>- Sự kiện được tạo thành công với ảnh banner |
| **TC-EVT-02** | Security | Đăng nhập với tài khoản `USER` thường | File banner và DTO hợp lệ | 1. User thường gửi `POST /api/events` | - HTTP 403 Forbidden<br>- Chặn thao tác trái quyền |
| **TC-EVT-03** | Negative | Quyền Admin/Mod | `endTime <= startTime` | 1. Gửi thời gian kết thúc trước thời gian bắt đầu | - HTTP 400 Bad Request<br>- Thông báo: 'endTime must be later than startTime' |
| **TC-EVT-04** | Negative | Quyền Admin/Mod | `status = 'published'` nhưng `startTime <= now` | 1. Tạo sự kiện phát hành có thời gian trong quá khứ | - HTTP 400 Bad Request<br>- Thông báo: 'Published events must start in the future' |
| **TC-EVT-05** | Negative | Quyền Admin/Mod | Không đính kèm ảnh banner | 1. Gửi request tạo sự kiện không có banner | - HTTP 400 Bad Request<br>- Thông báo: 'One banner is required' |
| **TC-EVT-06** | Negative | Quyền Admin/Mod | `categoryId` không tồn tại hoặc `isActive = false` | 1. Gửi ID thể loại không hợp lệ | - HTTP 400 Bad Request<br>- Thông báo: 'Category must exist and be active' |

---

### Phân nhóm B: Ghim & Bỏ Ghim Sự Kiện (`PATCH /api/events/:id/pin`)

| Mã TC | Phân loại | Điều kiện tiên quyết | Dữ liệu đầu vào | Các bước thực hiện | Kết quả mong đợi |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **TC-EVT-07** | Positive | Quyền Admin/Mod, sự kiện `published` còn hạn | `{"isPinned": true}` | 1. Admin gửi yêu cầu ghim sự kiện | - HTTP 200 OK<br>- Thuộc tính `isPinned = true`, `pinnedAt` được gán timestamp |
| **TC-EVT-08** | Negative | Quyền Admin/Mod | Sự kiện đã có 4 sự kiện ghim đang hoạt động | 1. Cố gắng ghim sự kiện thứ 5 | - HTTP 409 Conflict<br>- Thông báo: 'At most four active events can be pinned' |
| **TC-EVT-09** | Negative | Quyền Admin/Mod | Sự kiện đang là `draft` hoặc đã kết thúc | 1. Ghim sự kiện draft | - HTTP 409 Conflict<br>- Thông báo: 'Only published events that have not ended can be pinned' |

---

### Phân nhóm C: Cập Nhật & Xóa Sự Kiện (`PATCH /api/events/:id`, `DELETE /api/events/:id`)

| Mã TC | Phân loại | Điều kiện tiên quyết | Dữ liệu đầu vào | Các bước thực hiện | Kết quả mong đợi |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **TC-EVT-10** | Positive | Quyền Admin/Mod | Thay đổi tên, địa điểm, upload banner mới | 1. Gửi request cập nhật sự kiện | - HTTP 200 OK<br>- Banner cũ được dọn dẹp, banner mới được lưu |
| **TC-EVT-11** | Negative | Quyền Admin/Mod | Sự kiện đang có status `cancelled` | 1. Sửa sự kiện đã hủy | - HTTP 409 Conflict<br>- Thông báo: 'Cancelled events cannot be edited' |
| **TC-EVT-12** | Positive | Quyền Admin/Mod | ID sự kiện không có ràng buộc vé | 1. Admin xóa sự kiện | - HTTP 200 OK<br>- Bản ghi và ảnh banner bị xóa sạch |
| **TC-EVT-13** | Negative | Quyền Admin/Mod | Sự kiện đang có vé liên kết (FK 23503) | 1. Xóa sự kiện đang có vé | - HTTP 409 Conflict<br>- Thông báo: 'Event is referenced by other resources' |

---

### Phân nhóm D: Xem Thể Loại Sự Kiện (`GET /api/event-categories`)

| Mã TC | Phân loại | Điều kiện tiên quyết | Dữ liệu đầu vào | Các bước thực hiện | Kết quả mong đợi |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **TC-EVT-14** | Positive | Public | Không yêu cầu | 1. Gửi `GET /api/event-categories` | - HTTP 200 OK<br>- Trả về danh sách các thể loại đang active, sắp xếp theo tên ASC |
