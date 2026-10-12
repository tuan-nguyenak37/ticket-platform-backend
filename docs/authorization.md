# Phân quyền và quyền sở hữu dữ liệu

## Phạm vi đã triển khai

Đối chiếu mã nguồn ngày 07/10/2026: backend có Auth, Users, Events (gồm category)
và Tickets (gồm kiểm tra/duyệt vé), Orders (thanh toán giả lập và tranh chấp).
Ba role: USER, MODERATOR, ADMIN.

- USER và MODERATOR được quản lý hồ sơ của chính mình.
- `GET /api/event-categories` là public: khách và mọi role đều xem được danh sách category đang hoạt động; không cấp quyền tạo/sửa/xóa category.
- ADMIN có thêm quyền tạo, xem danh sách, xem chi tiết và sửa tên user.
- MODERATOR và ADMIN được tạo, xem quản lý, sửa và xóa mọi sự kiện, kể cả do người khác tạo và sự kiện published. MODERATOR không được quản lý user/category.
- Mọi tài khoản active được đăng vé, xem vé mình đăng và hủy vé mình ở trạng thái pending_review/rejected/available. ADMIN/MODERATOR không vượt quyền sở hữu ở các API này.
- ADMIN/MODERATOR được xem hàng chờ, báo cáo, file vé, yêu cầu kiểm tra và quyết định duyệt/từ chối; không tự duyệt hoặc từ chối vé mình đăng.
- ADMIN/MODERATOR được ghim/bỏ ghim qua PATCH /api/events/:id/pin; GET /api/events/pinned là public và chỉ trả tối đa 4 sự kiện ghim còn hiệu lực.
- ADMIN khóa/mở khóa USER hoặc MODERATOR qua `PATCH /api/users/:id/status`, bắt buộc lý do; không tác động ADMIN. Không có API đổi role hoặc xóa tài khoản.
- Buyer/seller upload bằng chứng khi tranh chấp mở; hai bên và ADMIN/MODERATOR được tải file qua API xác thực. Xem [hợp đồng chi tiết](./account-moderation-dispute-evidence.md).
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
| events.create | ADMIN/MODERATOR tạo sự kiện, target ID là event_id khi thành công |
| events.update | ADMIN/MODERATOR sửa nội dung/ảnh hoặc chuyển trạng thái sự kiện |
| events.pin.update | ADMIN/MODERATOR ghim hoặc bỏ ghim; không đổi quyền sửa nội dung sự kiện |
| events.delete | ADMIN/MODERATOR xóa sự kiện ở mọi trạng thái |
| tickets.create | Tạo vé của người gọi |
| tickets.cancel | Hủy đăng bán vé của người gọi |
| tickets.file.read | ADMIN/MODERATOR đọc file vé |
| tickets.check.request | ADMIN/MODERATOR yêu cầu kiểm tra vé |
| tickets.review.manual | ADMIN/MODERATOR quyết định duyệt hoặc từ chối |

result của AuditService gồm allowed, denied, failed. Worker còn ghi tickets.check
và tickets.review.automatic bằng logger riêng; không có request HTTP tương ứng.
AuditService chỉ ghi danh sách trường nêu trên; không ghi body, header, password,
hash, JWT hoặc cookie. Middleware tự sinh request ID và trả X-Request-Id;
không tin request ID tùy ý từ client.

Nhật ký là log ứng dụng, chưa có bảng audit hoặc cơ chế lưu trữ/tổng hợp log riêng. Không phải mọi request thành công đều tạo audit event. Lỗi guard được ghi tại guard; thao tác có @Audit được ghi qua interceptor.

## Ma trận nghiệp vụ hiện tại và phần dự kiến

Ngữ cảnh sản phẩm: sàn mua bán lại vé, người dùng có thể vừa mua vừa bán.

| Chức năng | Khách | USER/MODERATOR | ADMIN |
| --- | --- | --- | --- |
| Xem tin công khai | Được | Được | Được |
| Đăng vé, xem vé mình đăng, hủy đăng bán (đã có) | Không | Chỉ vé của mình; hủy đúng trạng thái | Như người dùng |
| Duyệt/từ chối vé pending (đã có) | Không | USER: không; MODERATOR: được, trừ vé của mình | Được, trừ vé của mình |
| Sửa vé hoặc ẩn vé đã công khai (chưa có) | Không | Chưa cấp quyền qua API | Chưa có endpoint |
| Tạo đơn mua (đã có) | Không | Chính mình là người mua; không mua vé của mình | Như người dùng |
| Xem đơn hàng (đã có) | Không | Chỉ đơn mình tham gia; MODERATOR có API manage | API manage phục vụ hỗ trợ |
| Thanh toán (giả lập) | Không | Chỉ buyer của đơn, mock bật ở development/test | Không trả thay buyer qua /me |
| Tranh chấp (đã có) | Không | Buyer mở, seller phản hồi; MODERATOR xử lý đơn không thuộc mình | Xử lý đơn không thuộc mình |
| Nhận file vé sau mua (đã có) | Không | Chỉ buyer của đơn đã được cấp vé và đúng trạng thái | Không vượt quyền buyer ở /me |

Hợp đồng Orders nằm tại [Orders và thanh toán](./orders-api.md). ADMIN/MODERATOR
được đọc quản lý, xử lý tranh chấp và giả lập hoàn tiền/chi trả nhưng không được
quyết định hoặc chuyển tiền cho đơn mình tham gia. Chưa có VNPay hoặc tiền thật.
Quyền đọc file phục vụ kiểm duyệt độc lập với quyền nhận file sau mua. Quy tắc chung:

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

## Kiểm tra/duyệt vé

ADMIN và MODERATOR được xem danh sách, báo cáo, file gốc và xử lý kiểm duyệt vé.
Không tự duyệt vé mình đăng; không cấp quyền giả danh người mua/bán. Worker tự
duyệt theo bộ điều kiện nghiêm ngặt khi cấu hình bật. API public không trả file,
OCR, mã vé hoặc fingerprint. Hợp đồng chi tiết: [kiểm tra vé](./ticket-review-automation.md).
