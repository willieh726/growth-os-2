/* Public audit page — the first impression a prospect gets of the agency.
   Self-contained styling (no typography plugin dependency), letterhead
   layout, reads well on a phone. */
import ReactMarkdown from "react-markdown";

const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

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
          <p className="text-xs font-semibold uppercase tracking-widest text-emerald-400">
            Digital Presence Audit
          </p>
          <p className="mt-1 text-2xl font-bold text-white">{audit.name}</p>
          <p className="mt-1 text-sm text-gray-400">
            Prepared {new Date(audit.created_at).toLocaleDateString("en-US",
              { month: "long", day: "numeric", year: "numeric" })}
          </p>
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

        <footer className="border-t border-gray-100 bg-gray-50 px-8 py-5 text-sm text-gray-500">
          Questions about anything in this audit? Just reply to my email — happy to walk
          through it, no strings attached.
        </footer>
      </div>
    </div>
  );
}
