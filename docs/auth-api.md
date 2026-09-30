# Tài Liệu API - Xác Thực & Người Dùng (Auth & User API)

Luồng login, refresh, logout và phân quyền Users hiện tại được mô tả tại [JWT và phiên đăng nhập](./auth-session-updates.md).

Tài liệu chi tiết kỹ thuật cho các API liên quan đến Authentication và User thuộc hệ thống Backend Ticket Platform.

---

## 1. Thông Tin Chung (General Information)

* **Base URL**: `http://localhost:7000/api`
* **Version**: `v1`
* **Content-Type**: `application/json`
* **Authentication**: Public (chưa yêu cầu Bearer Token đối với các API đăng ký/đăng nhập)

---

## 2. Định Dạng Phản Hồi Chuẩn (Standard Response Format)

Hệ thống sử dụng `GlobalResponseInterceptor` và `GlobalExceptionFilter` để chuẩn hóa tất cả các phản hồi HTTP.

### 2.1. Phản hồi thành công (Success Response Structure)
```json
{
  "success": true,
  "statusCode": 200 | 201,
  "message": "Request successful",
  "data": { ... },
  "timestamp": "2026-09-28T11:26:35.854Z"
}
```

### 2.2. Phản hồi lỗi (Error Response Structure)
```json
{
  "success": false,
  "statusCode": 400 | 401 | 403 | 404 | 409 | 500,
  "message": "Thông báo lỗi chi tiết hoặc mảng các lỗi validation",
  "path": "/api/...",
  "timestamp": "2026-09-28T11:26:47.940Z"
}
```

---

## 3. Danh Sách Endpoint (Endpoints)

| Phương thức | Endpoint | Quyền truy cập | Mô tả |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/auth/register` | Public | Đăng ký tài khoản người dùng mới |

---

## 4. Chi Tiết API

### 4.1. Đăng ký tài khoản người dùng mới (User Registration)

Tạo tài khoản người dùng mới vào hệ thống. Mật khẩu được mã hóa tự động bằng thuật toán băm `bcrypt` với `saltRounds = 10`. `user_id` tiền tố `user_` được tự động sinh.

* **Endpoint**: `/api/auth/register`
* **Method**: `POST`
* **Auth Required**: `No`

#### Headers
| Header | Kiểu | Bắt buộc | Giá trị |
| :--- | :--- | :--- | :--- |
| `Content-Type` | `string` | **Có** | `application/json` |

#### Request Body Schema (`RegisterDto`)

| Trường | Kiểu dữ liệu | Bắt buộc | Ràng buộc validation | Mô tả |
| :--- | :--- | :--- | :--- | :--- |
| `email` | `string` | **Có** | Email hợp lệ (`@IsEmail`), không để trống (`@IsNotEmpty`). Tự động trim và chuyển chữ thường. | Email định danh duy nhất của tài khoản. |
| `password` | `string` | **Có** | Độ dài từ 6 đến 32 ký tự (`@MinLength(6)`, `@MaxLength(32)`). | Mật khẩu tài khoản (sẽ được hash trước khi lưu). |
| `fullName` | `string` | Không | Tối đa 100 ký tự (`@MaxLength(100)`). | Họ và tên hiển thị của người dùng. |

#### Request Body Ví dụ
```json
{
  "email": "user@example.com",
  "password": "password123",
  "fullName": "Nguyen Van A"
}
```

---

#### Response Codes & Ví dụ

##### `201 Created` - Đăng ký thành công
Trả về thông tin tài khoản vừa tạo (đã loại bỏ trường `password` để đảm bảo an toàn).

```json
{
  "success": true,
  "statusCode": 201,
  "message": "Request successful",
  "data": {
    "user_id": "user__ubcPu-bej8lYfed1",
    "email": "user@example.com",
    "phone": null,
    "fullName": "Nguyen Van A",
    "avatarUrl": null,
    "role": "user",
    "status": "active",
    "emailVerified": false,
    "phoneVerified": false,
    "identityVerified": false,
    "reputationScore": 0,
    "successfulSales": 0,
    "successfulBuys": 0,
    "disputeCount": 0,
    "lastLoginAt": null,
    "createdAt": "2026-09-28T11:26:35.696Z",
    "updatedAt": "2026-09-28T11:26:35.696Z"
  },
  "timestamp": "2026-09-28T11:26:35.854Z"
}
```

##### `400 Bad Request` - Dữ liệu đầu vào không hợp lệ (Validation Error)
Khi email sai định dạng, mật khẩu ngắn hơn 6 ký tự hoặc có trường không được phép (theo `whitelist` / `forbidNonWhitelisted`).

```json
{
  "success": false,
  "statusCode": 400,
  "message": [
    "Email không hợp lệ",
    "Mật khẩu phải có tối thiểu 6 ký tự"
  ],
  "path": "/api/auth/register",
  "timestamp": "2026-09-28T11:26:56.164Z"
}
```

##### `409 Conflict` - Trùng lặp Email
Khi email đăng ký đã tồn tại trong cơ sở dữ liệu.

```json
{
  "success": false,
  "statusCode": 409,
  "message": "Email đã tồn tại trên hệ thống",
  "path": "/api/auth/register",
  "timestamp": "2026-09-28T11:26:47.940Z"
}
```

---

#### Code Mẫu Gọi API (Client Examples)

##### cURL
```bash
curl -X POST http://localhost:7000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "password123",
    "fullName": "Nguyen Van A"
  }'
```

##### JavaScript / TypeScript (Fetch API)
```typescript
const register = async (data: { email: string; password: string; fullName?: string }) => {
  const response = await fetch('http://localhost:7000/api/auth/register', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });

  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.message || 'Đăng ký thất bại');
  }
  return result.data;
};
```

---

## 5. Cấu Trúc Bảng Dữ Liệu `Users` (Data Model Reference)

| Cột | Kiểu DB (PostgreSQL) | TypeORM Decorator | Nullable | Mặc định | Ghi chú |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `user_id` | `VARCHAR(40)` | `@PrimaryColumn` | `NO` | Tự sinh | Format `user_` + nanoid |
| `email` | `VARCHAR(255)` | `@Column({ unique: true })` | `NO` | - | Email duy nhất |
| `phone` | `VARCHAR(20)` | `@Column({ unique: true })` | `YES` | `null` | Số điện thoại duy nhất |
| `password` | `VARCHAR(255)` | `@Column` | `NO` | - | Đã băm với bcrypt |
| `fullName` | `VARCHAR(100)` | `@Column` | `YES` | `null` | Họ tên người dùng |
| `avatarUrl` | `TEXT` | `@Column` | `YES` | `null` | Link ảnh đại diện |
| `role` | `ENUM ('admin', 'user', 'moderator')` | `@Column` | `NO` | `'user'` | Vai trò tài khoản |
| `status` | `ENUM ('active', 'suspended', 'banned', 'deleted')` | `@Column` | `NO` | `'active'` | Trạng thái tài khoản |
| `tokenVersion` | `INTEGER` | `@Column` | `NO` | `0` | Phiên bản phiên đăng nhập; không trả trong response user |
| `emailVerified`| `BOOLEAN` | `@Column` | `NO` | `false` | Xác thực email |
| `phoneVerified`| `BOOLEAN` | `@Column` | `NO` | `false` | Xác thực SĐT |
| `identityVerified` | `BOOLEAN` | `@Column` | `NO` | `false` | Xác thực danh tính (KYC) |
| `reputationScore` | `INT` | `@Column` | `NO` | `0` | Điểm uy tín |
| `successfulSales` | `INT` | `@Column` | `NO` | `0` | Số vé bán thành công |
| `successfulBuys` | `INT` | `@Column` | `NO` | `0` | Số vé mua thành công |
| `disputeCount` | `INT` | `@Column` | `NO` | `0` | Số vụ tranh chấp |
| `lastLoginAt` | `TIMESTAMPTZ` | `@Column` | `YES` | `null` | Lần đăng nhập cuối |
| `createdAt` | `TIMESTAMPTZ` | `@CreateDateColumn` | `NO` | `CURRENT_TIMESTAMP` | Thời điểm tạo |
| `updatedAt` | `TIMESTAMPTZ` | `@UpdateDateColumn` | `NO` | `CURRENT_TIMESTAMP` | Thời điểm cập nhật |
