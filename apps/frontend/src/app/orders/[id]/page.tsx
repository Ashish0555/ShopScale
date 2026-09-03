"use client";
import { use, useEffect, useState } from "react";
import { io } from "socket.io-client";
import { apiRequest, type Order } from "../../../lib/api";

type OrderDetailsPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default function OrderDetailsPage({ params }: OrderDetailsPageProps) {
  const { id } = use(params);
  const [order, setOrder] = useState<Order | null>(null);
  useEffect(() => {
    void apiRequest<{ order: Order }>(`/api/orders/${id}`).then((response) => setOrder(response.order));
    const token = window.localStorage.getItem("shopscale.accessToken");
    const socket = io(process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000", { auth: { token } });
    socket.on("connect", () => { socket.emit("order:subscribe", id, (result: { ok?: boolean; order?: Order }) => { if (result.ok && result.order) setOrder(result.order); }); });
    socket.on("order:updated", (result: { order: Order }) => { if (result.order.id === id) setOrder(result.order); });
    return () => { socket.disconnect(); };
  }, [id]);
  if (!order) return <p>Loading order...</p>;

  return (
    <section>
      <p className="text-sm font-medium text-brand-700">Order</p>
      <h1 className="mt-2 text-2xl font-semibold text-slate-950">Order {order.id}</h1>
      <p className="mt-4 text-lg font-semibold">{order.state}</p>
      <p className="mt-2 text-slate-700">Live updates are enabled for this order.</p>
    </section>
  );
}
