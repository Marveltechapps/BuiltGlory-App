import { CustomerApiError } from '../api/customer';

export function isNetworkError(error: unknown): boolean {
  if (error instanceof TypeError) return true;
  if (error instanceof CustomerApiError && error.status === 0) return true;
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return (
    message.includes('network request failed')
    || message.includes('failed to fetch')
    || message.includes('network error')
    || message.includes('internet')
    || message.includes('offline')
  );
}

export function resourceErrorMessage(error: unknown, fallback: string) {
  if (isNetworkError(error)) return 'You appear to be offline. Check your connection and try again.';
  return error instanceof Error ? error.message : fallback;
}
