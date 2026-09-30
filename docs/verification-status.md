# Trạng thái kiểm chứng và bàn giao

Cập nhật ngày 30/09/2026. Tài liệu này phân biệt code đã bổ sung và kiểm chứng thực sự đã hoàn thành; không phải báo cáo nghiệm thu toàn bộ.

## Kết quả đã ghi nhận trước khi dừng kiểm tra

| Hạng mục | Trạng thái |
| --- | --- |
| TypeScript --noEmit | Đạt |
| Unit test | 9 suite, 40 test đạt |
| HTTP/E2E cho phân quyền mới | Đã bổ sung test; lượt chạy bị dừng, chưa xác nhận kết quả cuối |
| ESLint cho thay đổi mới | Lượt chạy bị dừng, chưa xác nhận hoàn tất |
| Build đầy đủ sau thay đổi phân quyền mới | Chưa xác nhận |
| PostgreSQL: hai yêu cầu đổi mật khẩu đồng thời | Chưa triển khai/chạy test riêng |
| Postman/Newman cho ma trận phân quyền mới | Chưa tạo/cập nhật collection và chưa chạy |
| Staging | Chưa triển khai/kiểm chứng |

Theo yêu cầu của người dùng, lượt cập nhật tài liệu không chạy lại test, build hoặc lint.

Collection login đã có trong [docs/postman](./postman/login.postman_collection.json) không thay thế collection kiểm tra phân quyền. Kết quả kiểm thử login ở các lượt trước không chứng minh đầy đủ các API /me và giới hạn admin mới.

## Checklist khi tiếp tục kiểm chứng

- Chạy ma trận khách, USER, MODERATOR, ADMIN cho các endpoint Users.
- Kiểm tra route thiếu/xung đột chính sách, method ghi đè chính sách controller và ADMIN không có quyền vượt policy.
- User A không sửa được user B bằng ID hoặc trường chèn vào body.
- DTO không lộ password/hash/tokenVersion hoặc trường entity riêng tư mới.
- Sửa tên không thu hồi phiên; đổi mật khẩu đúng thu hồi cả access và refresh token.
- Sai mật khẩu hiện tại hoặc password mới không hợp lệ không ghi dữ liệu.
- Hai yêu cầu đổi mật khẩu cùng dữ liệu cũ chỉ một yêu cầu ghi thành công; xác nhận bằng PostgreSQL riêng cho test.
- ADMIN không còn đổi email, đặt mật khẩu hoặc xóa user qua API cũ.
- Kiểm tra cookie jar login → refresh → logout và xóa cookie sau đổi mật khẩu.
- Kiểm tra audit có request ID, actor/action/target/result và không chứa dữ liệu bí mật.
- Dùng tài khoản/database test riêng cho Postman hoặc kiểm tra tích hợp; dọn đúng dữ liệu test sau chạy.

## Lệnh tham khảo — chưa chạy lại trong lượt tài liệu

```bash
npm run build
npx tsc --noEmit --incremental false
npm test -- --runInBand
npm run test:e2e -- --runInBand
npx eslint "src/**/*.ts" "test/**/*.ts"
```

Lệnh npm run lint hiện có tùy chọn --fix; lệnh eslint ở trên dùng để kiểm tra mà không tự sửa code. Unit/E2E hiện chạy Jest với experimental VM modules cho các dependency ESM. HTTP test dùng repository trong bộ nhớ, không chứng minh kết nối hay hành vi đồng thời của PostgreSQL thật.

## Trước triển khai

1. Kiểm tra cột Users.tokenVersion; dùng [SQL bổ sung](./token-version.sql) nếu thiếu.
2. Chốt cấu hình synchronize phù hợp môi trường; không cần bảng role/permission mới.
3. Cập nhật client theo các [thay đổi API Users](./users-api.md).
4. Hoàn thành các mục còn thiếu ở bảng kiểm chứng rồi chạy trên staging.
5. Kiểm tra nơi thu thập log AuthorizationAudit; hiện chỉ có logger ứng dụng.
