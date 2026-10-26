# Event image uploads

This commit provides upload infrastructure, not a public upload endpoint.
Event routes connect it in the event-management commit.

- Store a single file in memory before validation; default size limit 10 MiB.
- UPLOAD_MAX_FILE_SIZE_MB accepts integers from 1 through 50.
- UPLOAD_DIR defaults to uploads; keep it outside public static directories.
- Only JPEG, PNG and WebP are accepted in this scoped module.
- Check both declared MIME and content signature before persistence.
  Signature matching is not image decoding, antivirus scanning or sanitization.
- Generate UUID filenames, use exclusive creation and filesystem mode 0600.
  Actual filesystem permissions also depend on the host operating system.
- Read and delete event files only through a validated UUID basename.
- Event authorization belongs to the event service; importing this module does
  not make uploaded files publicly accessible. Failed operations attempt cleanup.

The runtime dependency multer and its development types are already used by
the full application. The scoped commit registers only these dependencies.
Tests are supplied but not run at the user's request; no files are uploaded
and no databases are modified during this commit.
