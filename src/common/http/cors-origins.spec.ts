import { corsOrigins } from './cors-origins';

describe('CORS origins', () => {
  it('trims and deduplicates HTTP(S) origins', () => {
    expect(
      corsOrigins(
        ' http://localhost:3000,https://example.com,http://localhost:3000 ',
      ),
    ).toEqual(['http://localhost:3000', 'https://example.com']);
  });

  it.each([
    '*',
    '',
    'null',
    'https://example.com/',
    'https://example.com/path',
    'https://example.com?token=private',
    'https://user:password@example.com',
    'ftp://example.com',
    'http://localhost:3000,',
  ])('rejects invalid origin configuration without echoing it', (value) => {
    expect(() => corsOrigins(value)).toThrow(
      'FRONTEND_URL must contain comma-separated HTTP(S) origins',
    );
  });
});
