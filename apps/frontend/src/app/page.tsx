import Link from "next/link";
import { getBackendHealth } from "../lib/api";

export default async function HomePage() {
  const health = await getBackendHealth();

  return (
    <section className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-brand-700">Portfolio system scaffold</p>
        <h1 className="mt-3 text-4xl font-bold text-slate-950">ShopScale</h1>
        <p className="mt-4 max-w-2xl text-lg leading-8 text-slate-700">
          A modular TypeScript commerce platform with PostgreSQL, Redis, Kafka, WebSockets, Docker, tests, and
          deployment-ready structure.
        </p>
        <div className="mt-6 flex gap-3">
          <Link className="rounded-md bg-brand-600 px-4 py-2 font-medium text-white hover:bg-brand-700" href="/products">
            Browse products
          </Link>
          <Link className="rounded-md border border-slate-300 px-4 py-2 font-medium text-slate-800 hover:bg-white" href="/orders">
            View orders
          </Link>
        </div>
      </div>

      <aside className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold text-slate-950">System status</h2>
        <dl className="mt-4 space-y-3 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-slate-600">Backend</dt>
            <dd className={health ? "font-medium text-brand-700" : "font-medium text-red-700"}>
              {health ? health.status : "unavailable"}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-slate-600">Service</dt>
            <dd className="font-medium text-slate-900">{health?.service ?? "not connected"}</dd>
          </div>
        </dl>
      </aside>
    </section>
  );
}
