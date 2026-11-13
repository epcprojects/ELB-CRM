export const IDLE_ACTIVITY_STORAGE_KEY = 'epc-crm:last-activity-at';

export function recordIdleActivity(timestamp = Date.now()) {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(
      IDLE_ACTIVITY_STORAGE_KEY,
      String(timestamp),
    );
  } catch {
    // Authentication must still work when browser storage is unavailable.
  }
}
