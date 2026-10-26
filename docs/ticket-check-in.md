# Check-in vé theo suất diễn

Check-in xác minh vé điện tử và ghi nhận người giữ vé đã vào cửa. Đây là thao
tác thay đổi trạng thái, không chỉ xem thông tin QR. Phạm vi hiện tại là API
backend cho **chủ ban tổ chức**; chưa bổ sung giao diện quét camera hoặc nhân viên.

## Quyền và điều kiện

- Yêu cầu access JWT hợp lệ và tài khoản ACTIVE hiện hành.
- Người thao tác phải là OWNER của Organizer sở hữu sự kiện. ADMIN, MODERATOR,
  người mua hoặc người được gán làm operator trước đây không tự có quyền này.
- Organizer phải ACTIVE, sự kiện phải PUBLISHED, suất diễn phải thuộc sự kiện.
- Client phải chọn suất diễn trước khi quét. Vé đúng sự kiện nhưng khác suất
  diễn vẫn bị từ chối.
- QR phải còn chữ ký/credential hiện hành. QR cũ sau bán lại hoặc QR bị sửa không
  dùng được. Nghiệp vụ phát hành kiểm tra đơn/payment/reservation nhất quán.
- Mở check-in từ đúng 24 giờ trước startTime; đóng tại endTime, dùng đồng hồ DB.
- Vé đang có tin đăng AVAILABLE hoặc RESERVED phải hủy tin đăng theo luồng bán
  lại trước; check-in không tự hủy giữ chỗ hoặc thanh toán của người mua khác.

## API

```http
POST /api/v1/events/:id/check-in
Authorization: Bearer <access-token>
Content-Type: application/json
```

```json
{
  "showingId": "showing_selected",
  "payload": "<chuỗi QR pv1 đọc từ vé TicketVerse>"
}
```

`payload` phải là nguyên chuỗi QR có chữ ký, tối đa 512 ký tự, không phải ảnh,
URL, ticket ID hoặc tên người mua. `showingId` dài 1–40 ký tự, chỉ chữ/số, `_`,
`-`. Không ghi payload vào log hoặc analytics.

HTTP 200, qua response envelope chung của API:

```json
{
  "success": true,
  "data": {
    "result": "CHECKED_IN",
    "message": "Check-in thành công.",
    "alreadyCheckedIn": false,
    "admitted": true,
    "eventId": "event_selected",
    "showingId": "showing_selected",
    "showingName": "Suất diễn tối",
    "ticketId": "ticket_example",
    "ticketNumber": 1,
    "ticketTypeName": "Vé phổ thông",
    "checkedInAt": "2026-11-01T12:00:00.000Z",
    "checkedInBy": "user_owner"
  }
}
```

Quét lại QR hiện hành của vé đã check-in trả HTTP 200 nhưng `result` là
`ALREADY_CHECKED_IN`, `alreadyCheckedIn=true`, **`admitted=false`**, giữ nguyên
thời điểm/người check-in đầu tiên. Kết quả này là cảnh báo **không cho vào cửa
lần nữa**, không phải một lần vào cửa mới. Client không được dựa riêng vào
HTTP 200 hoặc `success=true` để hiển thị thông báo cho vào cửa.

Phản hồi không chứa QR, ngân hàng hoặc email người mua; đặt
`Cache-Control: private, no-store`. Audit dùng request ID, actor/action/event,
không ghi body. `checked_in_at/checked_in_by` lưu bền lần vào cửa đầu tiên.

## Kết quả lỗi

| HTTP | Code / trường hợp | Ý nghĩa |
| --- | --- | --- |
| 400 | Validation / `CHECK_IN_INVALID_REQUEST` | Thiếu/sai suất diễn hoặc payload |
| 400 | `CHECK_IN_INVALID_QR` | QR sai chữ ký, bị thu hồi hoặc vé không còn hiệu lực |
| 401 | Lỗi xác thực access JWT | Cần xử lý phiên, không phải kết luận về QR |
| 403 | Không phải OWNER / tài khoản không hoạt động | Không có quyền check-in |
| 404 | Sự kiện hoặc suất diễn không tồn tại trong phạm vi | Không tiếp tục quét |
| 409 | `CHECK_IN_ORGANIZER_SUSPENDED` | Organizer bị khóa |
| 409 | `CHECK_IN_EVENT_NOT_PUBLISHED` | Sự kiện chưa/không còn công bố |
| 409 | `CHECK_IN_WRONG_SHOWING` | Vé không thuộc suất diễn đang chọn |
| 409 | `CHECK_IN_NOT_OPEN` / `CHECK_IN_CLOSED` | Ngoài khung giờ check-in |
| 409 | `CHECK_IN_TICKET_LISTED` | Vé đang đăng bán hoặc giữ mua lại |
| 409 | `CHECK_IN_TICKET_CHANGED` / `CHECK_IN_STATE_INVALID` | Dữ liệu thay đổi hoặc cần kiểm tra vận hành |
| 409 | Lỗi nhất quán phát hành | Đơn/vé/credential không nhất quán |

Giới hạn tần suất chung và lỗi hạ tầng vẫn áp dụng. QR sai trả 400, không giả
thành lỗi access JWT để tránh kích hoạt khôi phục phiên không cần thiết.

## Đồng thời và bán lại

Mỗi lần check-in dùng một transaction. Thứ tự khóa theo user, Organizer, event,
Showing, TicketType và Ticket, tương thích thứ tự khóa cha của luồng bán lại.
Ticket được khóa ghi; credential được xác minh lại sau khi lấy khóa, tránh dùng
QR cũ nếu vừa chuyển chủ. Cập nhật còn yêu cầu vé ACTIVE, chưa có thời điểm và
người check-in. Hai lần quét chỉ có một lần `admitted=true`.

Tạo tin đăng/giữ/chuyển chủ cũng khóa ticket và kiểm tra checkedInAt. Chuyển
chủ thêm điều kiện DB chưa check-in; vé đã dùng không tiếp tục bán lại. Không
thay đổi tồn kho bán hàng, giá tiền, trạng thái thanh toán hoặc credential QR
chỉ vì khách đã vào cửa. Không có API tự xóa/hoàn tác check-in trong đợt này.

## Migration và dữ liệu cũ

Migration mới `TicketCheckIns1792972800000` thêm hai cột nullable, ràng buộc
thời điểm/người cùng có hoặc cùng null, khóa ngoại users và index tra cứu.
Đã có cột từ migration EventOperations cũ thì giữ nguyên, không xóa dữ liệu.
Migration là forward-only; dữ liệu vi phạm ràng buộc phải được kiểm tra vận hành,
không tự sửa thời điểm hoặc người đã check-in.

Data source đăng ký hai migration tương thích đăng ký/giảm giá thay vì chạy lại
EventOperations. Không sửa hoặc xóa lịch sử migrations của DB hiện có. Các bảng
operators/cột legacy đã tồn tại không bị drop; API mời/quản lý operator không
được đăng ký. Phải kiểm tra DB đích, backup và migration pending trước khi áp dụng.

## Tích hợp và kiểm chứng

- Client cũ chỉ gửi `{payload}` phải bổ sung `showingId`; không tự chọn suất diễn
  bằng thông tin không được xác minh từ QR.
- Có unit spec cho phân quyền, QR thu hồi, sai suất diễn, thời gian, bán lại,
  duplicate và transaction; có spec cho DTO/controller và migration.
- Chưa chạy test hoặc migration theo yêu cầu hiện tại. Mock transaction không
  thay thế kiểm chứng khóa/race trên PostgreSQL thật.
- Cần nghiệm thu hai máy quét đồng thời, quét khi vừa chuyển chủ và kết quả
  hiển thị cảnh báo không cho vào cửa lần hai trước khi sử dụng thực tế.
