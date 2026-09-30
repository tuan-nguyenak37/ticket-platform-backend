# Phân quyền và quyền sở hữu dữ liệu

## Phạm vi đã triển khai

Backend hiện có Auth và Users. Ba role giữ nguyên: USER, MODERATOR, ADMIN.

- USER và MODERATOR được quản lý hồ sơ của chính mình.
- ADMIN có thêm quyền tạo, xem danh sách, xem chi tiết và sửa tên user.
- MODERATOR chưa có quyền quản trị hoặc kiểm duyệt riêng.
- Không có API đổi role, khóa/mở khóa hoặc xóa tài khoản.
- Chính sách nằm trong code; chưa có bảng permission hoặc giao diện quản trị quyền.

Xem [ma trận API Users](./users-api.md#ma-trận-api-hiện-tại) để biết từng endpoint.

## Luồng kiểm tra một request

1. Middleware tạo requestId và đọc cookie.
2. AccessTokenGuard đọc chính sách hiệu lực của route. Route thiếu chính sách hoặc chính sách không hợp lệ bị từ chối.
3. Với route không public, guard xác thực access token, tra user trong database, kiểm tra active và tokenVersion.
4. Guard tạo principal chỉ gồm user_id, role, status, tokenVersion.
5. RolesGuard kiểm tra quyền theo chính sách và role hiện tại.
6. ValidationPipe kiểm tra DTO và từ chối trường ngoài danh sách.
7. Service áp dụng điều kiện trên dữ liệu; response dùng DTO với danh sách trường cho phép.

Không dùng role do client gửi hoặc chỉ dựa vào role trong JWT. ADMIN không tự động được bỏ qua chính sách của route.

## Khai báo chính sách

Các decorator được export từ `src/modules/auth/authorization/access-policy.ts`. Public cũng được re-export qua đường dẫn cũ trong jwt để giữ tương thích.

| Decorator | Ý nghĩa |
| --- | --- |
| @Public() | Bỏ yêu cầu access token |
| @Authenticated() | Bắt buộc principal hợp lệ, không giới hạn role |
| @Roles(...roles) | Bắt buộc principal hợp lệ và khớp ít nhất một role |
| @CurrentUser() | Lấy principal đã xác thực trong handler |

Chính sách method thay thế toàn bộ chính sách controller; không cộng thêm quyền từ controller. Nhiều loại chính sách tại cùng mức khai báo, danh sách roles rỗng hoặc role không hợp lệ bị coi là không hợp lệ. Không có chính sách hiệu lực thì từ chối, không ngầm cho phép tài khoản đã login.

Ví dụ tương ứng với thiết kế Users:

```typescript
@Controller('users')
@Roles(UserRole.ADMIN)
export class UsersController {
  @Get('me')
  @Authenticated()
  me(@CurrentUser() actor: Principal) {
    return this.usersService.getProfile(actor);
  }

  @Get()
  findAll(@CurrentUser() actor: Principal) {
    return this.usersService.findAll(actor);
  }
}
```

/me cho cả ba role; endpoint danh sách chỉ cho ADMIN. Nếu một route khai báo @Roles(USER, MODERATOR), ADMIN không được vào nếu không nằm trong danh sách.

Test HTTP đã có kiểm tra chính sách hiệu lực của các controller được đăng ký. Đây là kiểm tra trong test, không phải bước quét route bắt buộc khi ứng dụng khởi động. Trạng thái chạy test xem [báo cáo hiện tại](./verification-status.md).

## Quyền sở hữu và service

Guard trả lời “người này được gọi chức năng này không?”. Service tiếp tục kiểm tra “người này được thao tác trên bản ghi nào?”.

- API /me không nhận ID chủ sở hữu từ client; dùng actor.user_id.
- Truy vấn đọc/sửa hồ sơ cá nhân ràng buộc user_id, status=active và tokenVersion.
- API quản trị kiểm tra ADMIN thêm tại service.
- Sửa tên chỉ cập nhật fullName; không spread request body vào entity.
- Đổi mật khẩu dùng điều kiện gồm hash cũ và phiên hiện tại, rồi ghi hash mới cùng tăng tokenVersion nguyên tử.
- DTO phản hồi lấy từng trường được cho phép, không trả nguyên entity.

Điều kiện quyền sở hữu phải đi vào truy vấn đọc/cập nhật. Không chỉ tải dữ liệu theo ID bất kỳ rồi tin rằng kiểm tra ở controller là đủ.

## Mã phản hồi

| Mã | Trường hợp |
| --- | --- |
| 400 | Body không hợp lệ, trường ngoài DTO, mật khẩu hiện tại sai hoặc mật khẩu mới không đạt yêu cầu |
| 401 | Token/phiên không hợp lệ, user không còn active hoặc thiếu token trên route bảo vệ |
| 403 | Thiếu role, route thiếu chính sách hoặc chính sách không hợp lệ |
| 404 | Route không tồn tại; user không tồn tại/deleted; hồ sơ ngoài phạm vi truy vấn |
| 409 | Xung đột unique hoặc dữ liệu/phiên thay đổi trong lúc cập nhật |

Một USER gọi /users/:id nhận 403 vì không có quyền gọi API quản trị; server không cần xác nhận ID đó có tồn tại. Với API tài nguyên riêng tư tương lai, dùng 404 cho bản ghi không tồn tại hoặc nằm ngoài phạm vi người gọi.

## Nhật ký phân quyền

Logger `AuthorizationAudit` ghi JSON có các trường:

- timestamp, requestId.
- actorId, targetId khi có; nếu không có thì null.
- action, result.
- statusCode khi được cung cấp, chủ yếu ở nhánh lỗi.

Các action đang có:

| Action | Nguồn |
| --- | --- |
| authentication.denied | AccessTokenGuard từ chối xác thực/chính sách |
| authorization.denied | RolesGuard từ chối quyền |
| profile.update | Sửa tên của chính mình |
| password.change | Đổi mật khẩu cá nhân |
| users.create | Admin tạo tài khoản |
| users.update | Admin sửa tên tài khoản |

result gồm allowed, denied, failed. AuditService chỉ ghi danh sách trường nêu trên; không ghi body, header, password, hash, JWT hoặc cookie. Middleware tự sinh request ID và trả X-Request-Id; không tin request ID tùy ý từ client.

Nhật ký là log ứng dụng, chưa có bảng audit hoặc cơ chế lưu trữ/tổng hợp log riêng. Không phải mọi request thành công đều tạo audit event. Lỗi guard được ghi tại guard; thao tác có @Audit được ghi qua interceptor.

## Ma trận nghiệp vụ tương lai — chưa triển khai endpoint

Ngữ cảnh sản phẩm: sàn mua bán lại vé, người dùng có thể vừa mua vừa bán.

| Chức năng | Khách | USER/MODERATOR | ADMIN |
| --- | --- | --- | --- |
| Xem tin công khai | Được | Được | Được |
| Tạo tin bán | Không | Chính mình là người bán | Như người dùng |
| Xem bản nháp, sửa/gỡ tin | Không | Chỉ tin của mình và đúng trạng thái | Không sửa thay chủ tin |
| Ẩn tin vi phạm | Không | Không | Thao tác kiểm duyệt riêng, có lý do |
| Tạo đơn mua | Không | Chính mình là người mua; không mua tin của mình | Không mua thay người khác |
| Xem đơn hàng | Không | Chỉ đơn mình là người mua/bán | Được xem phục vụ hỗ trợ |
| Thực hiện giao dịch | Không | Đúng bên tham gia và đúng trạng thái | Không giả danh bên mua/bán |
| Tạo/xem khiếu nại | Không | Thuộc giao dịch mình tham gia | Xử lý bằng chức năng riêng |
| Tải file vé, mã QR | Không | Theo điều kiện bàn giao được chốt sau | Không mặc định được tải |

Các quy tắc này là hợp đồng thiết kế, không phải chức năng đã được backend thực thi:

- DTO tin công khai không chứa QR, file gốc, liên hệ riêng hoặc thông tin đơn hàng.
- Lọc danh sách đơn/khiếu nại theo người gọi ngay tại database.
- sellerId/buyerId lấy từ principal, không nhận danh tính thay thế từ request body.
- Không suy ra quyền tải vé từ quyền xem đơn.
- Module tương lai phải chốt trạng thái chuyển giao, xử lý tiền và quyền nhận file trước khi cấp quyền cho hành động tương ứng.
- Quyền mới cho MODERATOR phải được quyết định riêng; không mặc định kế thừa quyền ADMIN.

### Ví dụ quy tắc để áp dụng khi xây module

Các đoạn dưới là mã minh họa, không import được từ backend hiện tại.

```typescript
// Đọc bản nháp của người gọi: dùng cùng phản hồi 404 cho ID lạ và ID không sở hữu.
const draft = await listings.findOne({
  where: { id: listingId, sellerId: actor.user_id, status: 'draft' },
});
if (!draft) throw new NotFoundException();

// Cập nhật phải giữ điều kiện sở hữu/trạng thái ngay trong câu lệnh.
const result = await listings.update(
  { id: listingId, sellerId: actor.user_id, status: 'draft' },
  { title: dto.title },
);
if (result.affected !== 1) throw new NotFoundException();

// Chỉ lấy các đơn người gọi thực sự tham gia.
const orders = await orderRepository.find({
  where: [{ buyerId: actor.user_id }, { sellerId: actor.user_id }],
});
```

Hành động kiểm duyệt của admin cần endpoint/policy riêng và lý do; không tái sử dụng chức năng sửa của người bán để vượt điều kiện sở hữu.
