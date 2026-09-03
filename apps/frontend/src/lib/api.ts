type HealthResponse = {
  status: string;
  service: string;
  timestamp: string;
};

export type Product = { id: string; name: string; description: string | null; priceCents: number; currency: string };
export type Order = { id: string; state: string; totalCents: number; currency: string; createdAt: string };
const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

export async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = typeof window === "undefined" ? null : window.localStorage.getItem("shopscale.accessToken");
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers }
  });
  const body = (await response.json().catch(() => null)) as T & { error?: { message?: string } };
  if (!response.ok) throw new Error(body?.error?.message ?? "Request failed");
  return body;
}

export function saveSession(accessToken: string): void { window.localStorage.setItem("shopscale.accessToken", accessToken); }
export function money(cents: number, currency = "USD"): string { return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100); }

export async function getBackendHealth(): Promise<HealthResponse | null> {
  const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

  try {
    const response = await fetch(`${baseUrl}/health`, {
      cache: "no-store"
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as HealthResponse;
  } catch {
    return null;
  }
}
