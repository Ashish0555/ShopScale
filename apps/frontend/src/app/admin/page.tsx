"use client";
import { useEffect, useState } from "react";
import { apiRequest, money, type Order } from "../../lib/api";

export default function AdminPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [inventory, setInventory] = useState<Array<{ productId: string; name: string; availableQuantity: number; reservedQuantity: number }>>([]);
  useEffect(() => {
    void Promise.all([apiRequest<{ items: Order[] }>("/api/admin/orders"), apiRequest<{ items: typeof inventory }>("/api/admin/inventory")]).then(([orderResponse, inventoryResponse]) => { setOrders(orderResponse.items); setInventory(inventoryResponse.items); });
  }, []);
  return (
    <section>
      <h1 className="text-2xl font-semibold text-slate-950">Admin</h1>
      <h2 className="mt-6 font-semibold">Orders</h2>
      <div className="mt-3 space-y-2">{orders.map((order) => <div className="border-b py-2" key={order.id}>Order {order.id}: {order.state} <span className="float-right">{money(order.totalCents, order.currency)}</span></div>)}</div>
      <h2 className="mt-8 font-semibold">Inventory</h2>
      <div className="mt-3 space-y-2">{inventory.map((item) => <div className="border-b py-2" key={item.productId}>{item.name}<span className="float-right">{item.availableQuantity} available / {item.reservedQuantity} reserved</span></div>)}</div>
    </section>
  );
}
