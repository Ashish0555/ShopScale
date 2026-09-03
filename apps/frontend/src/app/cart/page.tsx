"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { apiRequest, money } from "../../lib/api";

export default function CartPage() {
  const [cart, setCart] = useState<{ items: Array<{ id: string; quantity: number; product: { name: string; priceCents: number; currency: string } }> } | null>(null);
  useEffect(() => { void apiRequest<{ cart: typeof cart }>("/api/cart").then((response) => setCart(response.cart)); }, []);
  if (!cart) return <p>Sign in to view your cart.</p>;
  return (
    <section>
      <h1 className="text-2xl font-semibold text-slate-950">Cart</h1>
      <div className="mt-6 space-y-3">{cart.items.map((item) => <div className="flex justify-between border-b py-3" key={item.id}><span>{item.product.name} x {item.quantity}</span><span>{money(item.product.priceCents * item.quantity, item.product.currency)}</span></div>)}</div>
      <Link className="mt-6 inline-block rounded-md bg-brand-600 px-4 py-2 text-white" href="/checkout">Checkout</Link>
    </section>
  );
}
