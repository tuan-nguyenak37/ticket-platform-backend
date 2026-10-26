# Đổi vai trò người dùng

`PATCH /api/users/:id/role` chỉ cho ADMIN đang hoạt động. Body:

```json
{
  "role": "MODERATOR",
  "expectedRole": "USER",
  "reason": "Phân công kiểm duyệt sự kiện"
}
```

- `role` và `expectedRole` chỉ nhận USER hoặc MODERATOR. Không có API cấp ADMIN.
- `expectedRole` là vai trò đang hiển thị khi xác nhận; không khớp DB trả 409,
  client phải tải lại danh sách, không tự gửi lại với giá trị mới.
- `reason` dài 1–1000 ký tự sau trim, bắt buộc và lưu trong nhật ký DB.
- ID dài 1–40 ký tự, chỉ gồm chữ, số, `_`, `-`.
- Không tự đổi vai trò, không đổi vai trò của ADMIN hoặc tài khoản bị khóa.
- Vai trò mới phải khác vai trò hiện tại. USER/MODERATOR không được gọi API này.

Service kiểm tra danh sách vai trò cho phép ngay cả khi được gọi nội bộ, rồi
khóa hàng ADMIN và tài khoản đích theo thứ tự ID trong một transaction. Quyền và
trạng thái ADMIN được đọc lại sau khóa; không chỉ tin claims JWT. Trước khi lưu
vai trò mới, thu hồi mọi phiên của tài khoản đích. Người đó phải đăng nhập lại.
Mở quyền mới không khôi phục phiên cũ. Guard tiếp tục đọc vai trò hiện hành từ DB.

Ghi `user_role_changes` và cập nhật người dùng dùng cùng transaction PostgreSQL.
Nhật ký có ID thay đổi, người thao tác, người đích, vai trò trước/sau, lý do và
thời điểm. Ràng buộc DB chặn tự đổi vai trò và mọi chuyển đổi liên quan ADMIN;
khóa ngoại hạn chế xóa người có lịch sử. API trả hồ sơ công khai, không trả hash,
đặt `Cache-Control: no-store`; audit logger chỉ ghi định danh và kết quả, không
ghi token/body. Đợt này chưa thêm API đọc lịch sử đổi vai trò.

Nếu Redis lỗi, không ghi nhật ký hoặc vai trò. Nếu DB lỗi sau khi thu hồi phiên,
transaction rollback cả nhật ký và vai trò nhưng các phiên vẫn bị thu hồi;
người dùng đăng nhập lại với vai trò cũ. Redis và PostgreSQL không có transaction
phân tán. Test mock không kiểm chứng rollback, khóa hoặc race bằng DB/Redis thật.

## Migration và phạm vi commit

Giữ nguyên tên và SQL migration `AdminRoleChanges1792454403000` từ ứng dụng hiện
tại; không đổi migration đã chạy, không tự chạy migration khi khởi động. Snapshot
commit đăng ký baseline và migration này, chỉ phụ thuộc bảng users và enum.
Đây chưa phải bộ migration hoàn chỉnh của ứng dụng: không thay bộ migration
trong checkout đang phát triển hoặc áp lịch sử snapshot lên DB hiện tại.

Chưa chạy migration hay test trong đợt này theo yêu cầu. Test mới bao phủ quyền,
validation, vai trò kỳ vọng, khóa có thứ tự, thu hồi phiên, lỗi ghi nhật ký và
request lặp; chỉ kiểm tra định nghĩa SQL của migration, chưa kiểm chứng DB thật.
Không gồm thống kê dashboard, Organizer, thanh toán hoặc thay đổi frontend.
