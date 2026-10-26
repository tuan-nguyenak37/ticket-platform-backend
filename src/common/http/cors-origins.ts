export const defaultFrontendOrigins =
  'http://localhost:3000,http://localhost:5173';

export function corsOrigins(value: string): string[] {
  const origins = value.split(',').map((origin) => origin.trim());
  if (
    origins.some((origin) => {
      try {
        const url = new URL(origin);
        return (
          !['http:', 'https:'].includes(url.protocol) || url.origin !== origin
        );
      } catch {
        return true;
      }
    })
  ) {
    throw new Error(
      'FRONTEND_URL must contain comma-separated HTTP(S) origins',
    );
  }
  return [...new Set(origins)];
}
