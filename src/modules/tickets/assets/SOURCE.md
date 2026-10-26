# Noto Sans

Font: NotoSans-Regular.ttf from the notofonts/noto-fonts project.
Source: https://raw.githubusercontent.com/notofonts/noto-fonts/main/hinted/ttf/NotoSans/NotoSans-Regular.ttf
License: SIL Open Font License 1.1, included in OFL.txt from the same project's LICENSE file.

The font is bundled for offline PDF rendering; requests do not fetch remote assets.

The TicketVerse PDF uses a white A4 page per ticket, purple branding, an event
banner, ticket tier, showing, Vietnam time, venue, order ID and the current QR.
Uploaded JPEG/PNG event posters are read through UploadsService and fitted without
cropping. Missing, invalid, GIF/WebP or external posters use the branded purple
fallback; arbitrary poster URLs are never fetched by the PDF renderer.
The same template is used for individual downloads, order PDFs and email attachments.
