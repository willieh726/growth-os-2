import Link from "next/link";

const nav = [
  { href: "/", label: "Dashboard" },
  { href: "/businesses", label: "Businesses" },
  { href: "/leads", label: "Pipeline" },
  { href: "/runs", label: "Ingestion" },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <aside className="w-52 shrink-0 border-r border-gray-200 bg-white p-4">
        <div className="mb-6 text-lg font-bold tracking-tight">⚡ Growth OS</div>
        <nav className="space-y-1">
          {nav.map(n => (
            <Link key={n.href} href={n.href}
              className="block rounded-md px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100">
              {n.label}
            </Link>
          ))}
        </nav>
      </aside>
      <main className="flex-1 p-8">{children}</main>
    </div>
  );
}
