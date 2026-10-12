# Bao mat API va refresh token bang Redis

## Cau hinh va khoi dong

API bat buoc ket noi Redis de gioi han request va quan ly refresh token, ke ca khi
email tat. Cau hinh nam trong `src/config/redis/redis.config.ts`, ket noi va vong
doi client nam trong `security-redis.service.ts` cung thu muc.

```dotenv
SECURITY_REDIS_URL=redis://127.0.0.1:6380/1
SECURITY_REDIS_PREFIX=ticketverse-security
RATE_LIMIT_MAX=120
```

Cac gia tri tren la mac dinh, khong bat buoc them vao `.env` khi chay local.
Redis email dung DB 0; Redis bao mat dung DB 1 va prefix rieng tren cung server
local. Chay `docker compose -f compose.email.yml up -d`, sau do `npm run start:dev`
hoac `npm run start:all` neu email da duoc cau hinh/bat.
Hai tien trinh API cung moi truong phai dung cung URL, prefix va JWT secrets.

API kiem tra PING/PONG luc khoi dong. Redis khong san sang thi API khong khoi dong;
mat ket noi trong luc chay thi request tra 503, khong bo qua gioi han/kiem tra phien.
Khong dung Redis cache co eviction cho phien. Production can Redis private, auth,
TLS (`rediss://`), luu ben vung; Compose hien tai chi danh cho local.

## Gioi han request

Tat ca gioi han duoc ap dung dong thoi; cham bat ky nguong nao se tra 429.
Bo dem dung Lua INCR + expiry nguyen tu, chia se giua nhieu API instance.

| Pham vi | Nguong mac dinh |
| --- | --- |
| Tat ca endpoint, moi IP/nhom IPv6 | 120 / 60 giay (RATE_LIMIT_MAX) |
| Tat ca request ghi (ngoai GET/HEAD/OPTIONS), moi IP | 30 / 60 giay |
| POST /api/auth/login, moi IP | 10 / 60 giay |
| Login, moi email chuan hoa tren tat ca IP | 20 / 15 phut |
| POST /api/auth/register, moi IP | 5 / 15 phut |
| POST /api/auth/refresh, moi IP | 30 / 60 giay |
| PATCH /api/users/me/password, moi IP | 5 / 15 phut |

Nguong tinh ca request thanh cong va that bai. Dang nhap thanh cong khong reset
bo dem. Day la cua so co dinh bat dau tu request dau tien, khong phai sliding
window; co the co burst tai ranh gioi hai cua so. IP dung chung NAT chia se quota.
IP va email trong key Redis duoc HMAC; khong luu truc tiep email/IP.

Tra `429 Too Many Requests` kem `Retry-After` (giay). Frontend cho dung thoi gian
roi thu lai, khong lap request lien tuc. Header duoc expose qua CORS.
`503 Service Unavailable` bao ha tang bao mat tam thoi khong san sang.

Mac dinh chi tin IP socket; header `X-Forwarded-For` tu client khong duoc tin.
IPv4-mapped IPv6 duoc chuan hoa, IPv6 duoc gom /64. Neu deploy sau reverse proxy,
chi dat `TRUST_PROXY` bang IP/CIDR cua proxy thuc te va dam bao proxy ghi de header:

```dotenv
# Vi du chi khi proxy chay tren loopback:
TRUST_PROXY=127.0.0.1/32,::1/128
```

Khong dung wildcard/cho phep tat ca dia chi. Rate limit trong ung dung khong thay
the gioi han ket noi, kich thuoc request va chong DDoS o reverse proxy.

## Refresh token

- Van giu mo hinh mot phien tai khoan va `tokenVersion` trong PostgreSQL.
  Moi request bao ve van doc user/role/status/tokenVersion hien tai tu database.
- Login ky token moi, dang ky SHA-256 cua refresh token vao Redis voi TTL theo
  JWT_REFRESH_EXPIRES, roi tang tokenVersion bang compare-and-swap trong database.
- Redis hash theo user + tokenVersion (key HMAC), field la SHA-256 cua token,
  value la marker. Khong luu JWT nguyen van, password hoac noi dung cookie.
- Refresh xac thuc chu ky, loai token, expiry, user active va version; sau do
  HDEL ban bam cu nguyen tu. Chi mot request duoc dung token; request lap/dong thoi
  con lai tra 401. Token moi duoc dang ky truoc khi CAS version trong database.
- Neu CAS that bai, chi xoa candidate token cua request thua, khong xoa candidate
  cua login dong thoi. Neu Redis/DB loi giua cac buoc, khong tra token moi; co the
  can dang nhap lai. Khong co distributed transaction giua PostgreSQL va Redis.
- Logout tang version DB va xoa ban ghi Redis cua version cu. Doi mat khau tang
  version DB nguyen tu voi doi password: refresh/access cu bi tu choi; ban bam
  Redis version cu co the ton tai den TTL nhung khong su dung duoc.
- Replay token cu tra 401, khong tu dong huy phien moi vua xoay vong. Frontend
  phai dung single-flight refresh (mot promise dung chung), tranh goi song song.
- Refresh cookie HttpOnly, SameSite=Lax, Secure trong production, Path=/api/auth.
  Max-Age lay tu JWT_REFRESH_EXPIRES; token khong nam trong response JSON.
  Response login/refresh co Cache-Control: no-store. Trien khai production qua HTTPS.

Sau khi nang cap, refresh token cu chua dang ky Redis can login lai. Neu mat du
lieu Redis, refresh bi tu choi va can login lai. Access token van duoc kiem tra
bang PostgreSQL va expiry; mat key Redis khong tu dong thu hoi access token.
JWT secrets production bat buoc khac nhau, it nhat 32 ky tu; dung gia tri ngau nhien
manh, khong dung cac chuoi placeholder trong `.env.example`.

## Kiem thu

```sh
npm test -- --runInBand
npm run test:security:integration
```

Suite Redis dung prefix ngau nhien, chi don key thuoc prefix do; khong FLUSHDB,
khong cham session/queue that. Redis local mac dinh 6380/1; co the doi
SECURITY_TEST_REDIS_URL. Suite HTTP dung JWT va Redis that, user repository gia lap;
khong ket noi PostgreSQL hay gui Gmail. Kiem tra concurrency, TTL, replay, logout,
token chua dang ky, version bi thu hoi, 429/Retry-After va 503.

Postman: dang nhap lai sau deploy, dung cookie jar khi refresh, luu access token
moi. Khong chay hang loat collection voi login lap lien tuc; ton trong Retry-After.
Collection Auth local co huong dan moi, chua dong bo cloud trong dot thay doi nay.
