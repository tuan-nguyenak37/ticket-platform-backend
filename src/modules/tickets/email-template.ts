interface EmailContent {
  title: string;
  preview: string;
  description: string;
  highlight?: { label: string; value: string };
  sections?: { title: string; rows: { label: string; value: string }[] }[];
  notice: string;
  action?: { label: string; url: string };
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return entities[character];
  });
}

export function renderEmail(content: EmailContent) {
  let action = content.action;
  if (action) {
    try {
      const url = new URL(action.url);
      if (
        !['https:', 'http:'].includes(url.protocol) ||
        url.username ||
        url.password
      )
        action = undefined;
    } catch {
      action = undefined;
    }
  }
  const sections = content.sections ?? [];
  const text = [
    'TicketVerse',
    content.title,
    '',
    content.description,
    '',
    ...(content.highlight
      ? [`${content.highlight.label}: ${content.highlight.value}`, '']
      : []),
    ...sections.flatMap((section) => [
      section.title,
      ...section.rows.map((row) => `${row.label}: ${row.value}`),
      '',
    ]),
    content.notice,
    '',
    ...(action ? [`${action.label}: ${action.url}`, ''] : []),
    'Email tự động từ TicketVerse. Không chia sẻ mã QR, mật khẩu hoặc mã xác thực.',
  ].join('\n');
  const html = `<!doctype html>
<html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="dark"><title>${escapeHtml(content.title)}</title></head>
<body bgcolor="#0c0914" style="margin:0;padding:0;background-color:#0c0914;color:#f6f3fc;font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%;">
<div style="display:none;font-size:1px;line-height:1px;color:#0c0914;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${escapeHtml(content.preview)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#0c0914"><tr><td align="center" style="padding:28px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;table-layout:fixed;">
<tr><td style="padding:0 12px 24px;"><span style="font-size:26px;font-weight:700;letter-spacing:-1px;color:#f6f3fc;">TicketVerse<span style="color:#9b6df5;">.</span></span><p style="margin:8px 0 0;color:#c0b6ce;font-size:12px;letter-spacing:1px;">KẾT NỐI NHỮNG TRẢI NGHIỆM</p></td></tr>
<tr><td bgcolor="#171222" style="background-color:#171222;border:1px solid #41364f;border-top:4px solid #9b6df5;border-radius:16px;padding:28px 24px;word-break:break-word;overflow-wrap:anywhere;">
<p style="margin:0 0 16px;color:#d2adff;font-size:11px;line-height:18px;font-weight:700;letter-spacing:2px;">THÔNG BÁO TỪ TICKETVERSE</p>
<h1 style="margin:0;color:#f6f3fc;font-size:26px;line-height:34px;font-weight:700;">${escapeHtml(content.title)}</h1>
<p style="margin:14px 0 24px;color:#c0b6ce;font-size:15px;line-height:25px;">${escapeHtml(content.description)}</p>
${content.highlight ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="#241735" style="padding:20px;background-color:#241735;border:1px solid #67458b;border-radius:12px;"><p style="margin:0 0 8px;font-size:12px;line-height:20px;color:#e5d1ff;">${escapeHtml(content.highlight.label)}</p><p style="margin:0;font-size:30px;line-height:40px;font-weight:700;color:#f0e3ff;">${escapeHtml(content.highlight.value)}</p></td></tr></table>` : ''}
${sections.map((section) => `<h2 style="margin:26px 0 10px;color:#f6f3fc;font-size:15px;line-height:23px;">${escapeHtml(section.title)}</h2><table width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;table-layout:fixed;border-collapse:collapse;">${section.rows.map((row) => `<tr><th scope="row" width="40%" align="left" valign="top" style="padding:11px 12px 11px 0;border-bottom:1px solid #41364f;color:#c0b6ce;font-size:13px;line-height:21px;font-weight:400;">${escapeHtml(row.label)}</th><td align="right" valign="top" style="padding:11px 0;border-bottom:1px solid #41364f;color:#f6f3fc;font-size:14px;line-height:21px;font-weight:600;word-break:break-word;overflow-wrap:anywhere;">${escapeHtml(row.value)}</td></tr>`).join('')}</table>`).join('')}
<p style="margin:24px 0 0;padding:16px;background-color:#100d19;border-left:3px solid #9b6df5;color:#c0b6ce;font-size:13px;line-height:22px;">${escapeHtml(content.notice)}</p>
${action ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:24px;"><tr><td align="center" bgcolor="#7540c8" style="background-color:#7540c8;border:1px solid #9860e8;border-radius:10px;mso-padding-alt:14px 20px;"><a href="${escapeHtml(action.url)}" style="display:block;padding:14px 20px;color:#ffffff;text-decoration:none;font-size:14px;line-height:22px;font-weight:700;">${escapeHtml(action.label)}</a></td></tr></table>` : ''}
</td></tr><tr><td align="center" style="padding:24px 16px 0;color:#c0b6ce;font-size:12px;line-height:21px;"><p style="margin:0 0 6px;">Email tự động từ TicketVerse.</p><p style="margin:0;">Không chia sẻ mã QR, mật khẩu hoặc mã xác thực.</p></td></tr>
</table></td></tr></table></body></html>`;
  return { html, text };
}
