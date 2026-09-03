"use client";
import { use, useEffect, useState } from "react";
import { apiRequest, money, type Product } from "../../../lib/api";

type ProductDetailsPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default function ProductDetailsPage({ params }: ProductDetailsPageProps) {
  const { id } = use(params);
  const [product, setProduct] = useState<Product | null>(null);
  useEffect(() => { void apiRequest<{ product: Product }>(`/api/products/${id}`).then((response) => setProduct(response.product)); }, [id]);
  if (!product) return <p>Loading product...</p>;

  return (
    <section>
      <p className="text-sm font-medium text-brand-700">Product</p>
      <h1 className="mt-2 text-2xl font-semibold text-slate-950">{product.name}</h1>
      <p className="mt-4 max-w-2xl text-slate-700">{product.description}</p>
      <p className="mt-4 font-semibold">{money(product.priceCents, product.currency)}</p>
      <button className="mt-6 rounded-md bg-brand-600 px-4 py-2 text-white" onClick={() => void apiRequest("/api/cart/items", { method: "POST", body: JSON.stringify({ productId: id, quantity: 1 }) })}>Add to cart</button>
    </section>
  );
}
