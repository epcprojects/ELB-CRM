'use client';

export default function AuthLoadingScreen({
  fullScreen = true,
}: {
  fullScreen?: boolean;
}) {
  return (
    <div
      role="status"
      aria-label="Loading"
      className={`flex items-center justify-center bg-gray-200 ${
        fullScreen ? 'min-h-dvh' : 'h-full flex-1'
      }`}
    >
      <span className="h-8 w-8 animate-spin rounded-full border-2 border-purple-600 border-t-transparent" />
    </div>
  );
}
