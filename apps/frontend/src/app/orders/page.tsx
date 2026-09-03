"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { apiRequest, money, type Order } from "../../lib/api";

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  useEffect(() => { void apiRequest<{ items: Order[] }>("/api/orders").then((response) => setOrders(response.items)); }, []);
  return (
    <section>
      <h1 className="text-2xl font-semibold text-slate-950">Orders</h1>
      <div className="mt-6 space-y-3">{orders.map((order) => <Link className="block rounded-md border p-4" href={`/orders/${order.id}`} key={order.id}><span>Order {order.id}</span><span className="ml-4">{order.state}</span><span className="float-right">{money(order.totalCents, order.currency)}</span></Link>)}</div>
    </section>
  );
}
