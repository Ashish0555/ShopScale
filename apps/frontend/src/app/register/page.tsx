"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiRequest, saveSession } from "../../lib/api";

export default function RegisterPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  async function submit(form: FormData) {
    try {
      const response = await apiRequest<{ accessToken: string }>("/api/auth/register", { method: "POST", body: JSON.stringify(Object.fromEntries(form)) });
      saveSession(response.accessToken);
      router.push("/products");
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : "Registration failed"); }
  }

  return (
    <section className="max-w-md">
      <h1 className="text-2xl font-semibold text-slate-950">Register</h1>
      <form action={submit} className="mt-6 space-y-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <label className="block text-sm font-medium text-slate-700">
          Name
          <input className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" name="name" type="text" />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Email
          <input className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" name="email" type="email" />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Password
          <input className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" name="password" type="password" />
        </label>
        <button className="w-full rounded-md bg-brand-600 px-4 py-2 font-medium text-white" type="submit">
          Create account
        </button>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>
    </section>
  );
}
