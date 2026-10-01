# Upload file local

Cấu hình dùng chung nằm trong `src/common/uploads`. File được lưu tại
`UPLOAD_DIR` (mặc định `uploads/` ở thư mục chạy ứng dụng), không nằm trong source.
Thư mục được tạo khi lưu file đầu tiên và đã được bỏ qua bởi Git.

## Tích hợp vào module nghiệp vụ

Import `UploadsModule` vào module có controller upload, inject `UploadsService`,
dùng `FileInterceptor('file')` và gọi `save()` sau khi kiểm tra quyền nghiệp vụ:

```typescript
@Post(':id/attachment')
@Roles(UserRole.ADMIN)
@UseInterceptors(FileInterceptor('file'))
async upload(
  @Param('id') id: string,
  @UploadedFile() file: Express.Multer.File | undefined,
) {
  // Kiểm tra tài nguyên và quyền thao tác trước khi lưu.
  return this.uploadsService.save(file);
}
```

Đây là ví dụ tích hợp chung. POST /api/events đã tích hợp upload hai ảnh; xem
[API sự kiện](./events-api.md). Module nghiệp vụ
phải lưu liên kết giữa filename và tài nguyên/chủ sở hữu, đồng thời xử lý dọn
file khi thao tác liên kết thất bại hoặc file được thay thế.

## Giới hạn

- Nhận một file qua multipart/form-data; tối đa 10 MB, đổi bằng
  `UPLOAD_MAX_FILE_SIZE_MB` (1–50 MB).
- Chấp nhận JPEG, PNG, GIF, WebP và PDF; SVG/HEIC chưa được hỗ trợ.
- Multer giữ file trong bộ nhớ có giới hạn; service kiểm tra chữ ký đầu file
  và MIME trước khi ghi xuống ổ đĩa. Đây không phải giải mã toàn bộ file hoặc
  quét mã độc.
- Tên lưu dùng UUID và phần mở rộng theo định dạng kiểm tra được, không dùng
  tên hay đường dẫn do client gửi.
- Trả `{ filename, mimetype, size }`; không trả đường dẫn tuyệt đối.
- Thiếu/rỗng/sai loại file trả 400; vượt dung lượng trả 413.
- Không cấu hình static public cho thư mục uploads. API tải file và quyền đọc
  sẽ được triển khai theo tài nguyên, đặc biệt đối với PDF vé.

Không khởi động server hoặc kết nối database để xác minh cấu hình này.
