import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "ShopScale",
  description: "Scalable e-commerce and order management system"
};

const navigation = [
  { href: "/products", label: "Products" },
  { href: "/cart", label: "Cart" },
  { href: "/orders", label: "Orders" },
  { href: "/admin", label: "Admin" }
];

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
            <Link className="text-lg font-semibold text-brand-700" href="/">
              ShopScale
            </Link>
            <nav className="flex items-center gap-4 text-sm font-medium text-slate-700">
              {navigation.map((item) => (
                <Link key={item.href} className="hover:text-brand-700" href={item.href}>
                  {item.label}
                </Link>
              ))}
              <Link className="rounded-md bg-brand-600 px-3 py-2 text-white hover:bg-brand-700" href="/login">
                Login
              </Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
