"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { apiRequest, money, type Product } from "../../lib/api";

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  useEffect(() => { void apiRequest<{ items: Product[] }>("/api/products").then((response) => setProducts(response.items)); }, []);
  return (
    <section>
      <h1 className="text-2xl font-semibold text-slate-950">Products</h1>
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {products.map((product) => (
          <Link key={product.id} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm hover:border-brand-600" href={`/products/${product.id}`}>
            <h2 className="font-semibold text-slate-950">{product.name}</h2>
            <p className="mt-2 text-sm text-slate-600">{money(product.priceCents, product.currency)}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
