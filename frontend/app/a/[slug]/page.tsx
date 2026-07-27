/* Public audit page — the first impression a prospect gets of the agency.
   Self-contained styling (no typography plugin dependency), letterhead
   layout, reads well on a phone. */
import ReactMarkdown from "react-markdown";

const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

/* Never let a prospect's audit turn up in Google. These pages are private
   between us and that business — search-indexing them would be a breach of
   the trust the audit is meant to build. */
export const metadata = {
  title: "Digital Presence Audit — SignalSync",
  robots: { index: false, follow: false, nocache: true },
};

export default async function PublicAudit({ params }: { params: { slug: string } }) {
  const res = await fetch(`${BASE}/audits/public/${params.slug}`, { cache: "no-store" });
  if (!res.ok) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 p-8">
        <p className="text-gray-500">This audit link is no longer available.</p>
      </div>
    );
  }
  const audit: { content_md: string; name: string; created_at: string } = await res.json();

  return (
    <div className="min-h-screen bg-gray-100 px-4 py-8 sm:py-12">
      <div className="mx-auto max-w-2xl overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-200">
        {/* Letterhead */}
        <div className="border-b-4 border-emerald-600 bg-gray-900 px-8 py-6">
          <div className="mb-4 flex items-center gap-2">
            <svg viewBox="0 0 64 64" className="h-6 w-6" aria-hidden="true">
              <circle cx="20" cy="44" r="6" fill="#34D399" />
              <path d="M20 32 A12 12 0 0 1 32 44" fill="none" stroke="#34D399" strokeWidth="4.5" strokeLinecap="round" />
              <path d="M20 23 A21 21 0 0 1 41 44" fill="none" stroke="#34D399" strokeWidth="4.5" strokeLinecap="round" />
              <path d="M20 14 A30 30 0 0 1 50 44" fill="none" stroke="#34D399" strokeWidth="4.5" strokeLinecap="round" />
            </svg>
            <span className="text-sm font-bold text-white">
              Signal<span className="text-emerald-400">Sync</span>
            </span>
          </div>
          <p className="text-xs font-semibold uppercase tracking-widest text-emerald-400">
            Digital Presence Audit
          </p>
          <p className="mt-1 text-2xl font-bold text-white">{audit.name}</p>
          <p className="mt-1 text-sm text-gray-400">
            Prepared {new Date(audit.created_at).toLocaleDateString("en-US",
              { month: "long", day: "numeric", year: "numeric" })}
          </p>
        </div>

        {/* Honesty note — the differentiator, said plainly and up front */}
        <div className="border-b border-gray-100 bg-emerald-50 px-8 py-3 text-sm text-emerald-900">
          Everything below comes from what we actually measured on your listing and
          website. No estimates, no invented numbers.
        </div>

        <article className="px-8 py-8">
          <ReactMarkdown
            components={{
              h1: () => null, // business name already in the letterhead
              h2: ({ children }) => (
                <h2 className="mb-3 mt-8 border-b border-gray-200 pb-2 text-lg font-bold text-gray-900 first:mt-0">
                  {children}
                </h2>
              ),
              h3: ({ children }) => (
                <h3 className="mb-2 mt-5 text-base font-semibold text-gray-900">{children}</h3>
              ),
              p: ({ children }) => (
                <p className="my-3 leading-relaxed text-gray-700">{children}</p>
              ),
              strong: ({ children }) => (
                <strong className="font-semibold text-gray-900">{children}</strong>
              ),
              ul: ({ children }) => (
                <ul className="my-3 list-disc space-y-1.5 pl-5 text-gray-700">{children}</ul>
              ),
              ol: ({ children }) => (
                <ol className="my-3 list-decimal space-y-1.5 pl-5 text-gray-700">{children}</ol>
              ),
              li: ({ children }) => <li className="leading-relaxed">{children}</li>,
            }}
          >
            {audit.content_md}
          </ReactMarkdown>
        </article>

        <footer className="border-t border-gray-100 bg-gray-50 px-8 py-6">
          <p className="text-sm text-gray-600">
            Questions about anything in here? Call or text me directly — happy to walk
            through it, no strings attached. This report is yours to keep and use,
            whether you work with us or not.
          </p>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
            <a
              href="tel:+14155801702"
              className="rounded-lg bg-emerald-600 px-5 py-2.5 text-center text-sm font-semibold text-white hover:bg-emerald-500"
            >
              Call Will — (415) 580-1702
            </a>
            <a
              href="mailto:will@signalsyncagency.com?subject=Question%20about%20my%20audit"
              className="rounded-lg border border-gray-300 px-5 py-2.5 text-center text-sm font-semibold text-gray-700 hover:bg-gray-100"
            >
              Email instead
            </a>
          </div>
          <p className="mt-5 border-t border-gray-200 pt-4 text-xs text-gray-400">
            SignalSync · signalsyncagency.com · We make your phone ring. No contracts,
            month to month.
          </p>
        </footer>
      </div>
    </div>
  );
}
