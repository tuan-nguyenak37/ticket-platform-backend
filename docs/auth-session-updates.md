# Auth and user API

Base path: /api. Successful results are under response.data. Passwords and tokenVersion are never returned in user responses.

## Endpoints

| Method | Path | Authentication |
| --- | --- | --- |
| POST | /auth/register | Public; email, password, optional fullName |
| POST | /auth/login | Public; email and password; returns 200 with accessToken and user; refresh_token in HttpOnly cookie |
| POST | /auth/refresh | Requires refresh_token cookie; empty body; returns 200 with a new access token and replaces the cookie |
| POST | /auth/logout | Bearer access token; empty body; returns 200 |
| GET | /users | Admin access token; up to 100 non-deleted users, newest first |
| POST | /users | Admin access token; same body as registration |
| GET | /users/:id | Admin access token; string user_id |
| PATCH | /users/:id | Admin access token; optional email, password, fullName |
| DELETE | /users/:id | Admin access token; soft-deletes the account |

Registration and user creation always assign the default user role. A trusted administrator must provision the initial admin role in the database; the public API does not accept role changes.

## Sessions

One active session per account. Login and refresh invalidate the previous access/refresh pair. The client must replace the access token after refresh and serialize refresh requests. The browser or Postman cookie jar stores the refresh_token cookie automatically; it is not returned in JSON. Concurrent refresh attempts with the same cookie result in at most one successful rotation.

The refresh cookie uses HttpOnly, SameSite=Lax and Path=/api/auth; Secure is enabled in production. Logout clears it with the same cookie options. The application registers cookie-parser before routing.

Logout invalidates the current pair immediately. Account updates invalidate previous tokens. Deleted, banned and suspended accounts cannot log in, refresh or call protected endpoints. Deletion preserves the account record and its unique email.

Session versions persist in PostgreSQL. New token payloads include tokenVersion and tokenType. Tokens created by the previous implementation must be replaced by logging in again.

## Configuration and database

JWT_ACCESS_SECRET and JWT_REFRESH_SECRET are required and must differ.
JWT_ACCESS_EXPIRES defaults to 15m; JWT_REFRESH_EXPIRES defaults to 7d.
Supported lifetimes: positive integer seconds, or an integer followed by s, m, h, d, w.

The Users table needs an integer tokenVersion column with default 0.
Development schema synchronization adds it on startup unless DB_SYNCHRONIZE=false. For production (synchronize disabled), apply [token-version.sql](./token-version.sql) before deployment.

## Verification

Use Node.js 24.9+ (verified locally with Node.js 25.8.1).
Jest runs with --experimental-vm-modules to load the installed Nest ESM packages.

- npm run build
- npm test -- --runInBand
- npm run test:e2e -- --runInBand
- npx eslint "src/**/*.ts" "test/**/*.ts"

HTTP tests load the real application modules, validation, guards, interceptors and token signing, while replacing the database module and User repository with an in-memory fixture. They do not verify PostgreSQL connectivity or execute the SQL migration.

