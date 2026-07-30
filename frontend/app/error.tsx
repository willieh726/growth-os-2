"use client";
/* Global error boundary. Without this file, any unhandled render error shows
   Next.js's default blank screen with no explanation and no way back — which
   is indistinguishable from "the app is gone". Always give the user the error
   text, a retry, and reassurance that data is intact. */
import { useEffect } from "react";

export default function Error({
  error, reset,
}: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-8">
      <div className="max-w-lg rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-bold text-gray-900">Something broke on this page</h1>
        <p className="mt-2 text-sm text-gray-600">
          This is a display error — <strong>none of your businesses, leads, or audits
          are affected.</strong> Try again, or reload the page.
        </p>
        <p className="mt-3 rounded bg-gray-50 p-3 font-mono text-xs text-gray-500">
          {error.message || "Unknown error"}
        </p>
        <div className="mt-4 flex gap-2">
          <button onClick={reset}
            className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-700">
            Try again
          </button>
          <a href="/"
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">
            Back to dashboard
          </a>
        </div>
      </div>
    </div>
  );
}
