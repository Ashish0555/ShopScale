"use client";
import { useState } from "react";
import { apiRequest } from "../../lib/api";

export default function CheckoutPage() {
  const [message, setMessage] = useState("");
  async function checkout() {
    try {
      const { order } = await apiRequest<{ order: { id: string } }>("/api/orders", { method: "POST" });
      await apiRequest("/api/payments", { method: "POST", headers: { "Idempotency-Key": crypto.randomUUID() }, body: JSON.stringify({ orderId: order.id }) });
      setMessage(`Order ${order.id} placed successfully.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Checkout failed"); }
  }
  return (
    <section>
      <h1 className="text-2xl font-semibold text-slate-950">Checkout</h1>
      <button className="mt-6 rounded-md bg-brand-600 px-4 py-2 text-white" onClick={() => void checkout()}>Place order</button>
      {message && <p className="mt-4 text-slate-700">{message}</p>}
    </section>
  );
}
