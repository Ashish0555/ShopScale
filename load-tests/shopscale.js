import http from "k6/http";
import { check } from "k6";
import { randomSeed } from "k6";

const baseUrl = __ENV.BASE_URL || "http://localhost:4000";
const password = __ENV.TEST_PASSWORD || "correct-horse";

export const options = {
  scenarios: {
    products: { executor: "constant-vus", vus: 2, duration: "30s", exec: "products" },
    authentication: { executor: "constant-vus", vus: 1, duration: "30s", exec: "authentication" },
    orders: { executor: "constant-vus", vus: 1, duration: "30s", exec: "orders" }
  }
};

randomSeed(42);

export function products() {
  const response = http.get(`${baseUrl}/api/products`);
  check(response, { "products status is 200": (result) => result.status === 200 });
}

export function authentication() {
  const email = `load-${__VU}-${__ITER}@example.com`;
  const registration = http.post(`${baseUrl}/api/auth/register`, JSON.stringify({ name: "Load User", email, password }), { headers: { "Content-Type": "application/json" } });
  check(registration, { "registration succeeded": (result) => result.status === 201 });
}

export function orders() {
  const email = __ENV.TEST_EMAIL;
  if (!email) return;
  const login = http.post(`${baseUrl}/api/auth/login`, JSON.stringify({ email, password }), { headers: { "Content-Type": "application/json" } });
  check(login, { "login succeeded": (result) => result.status === 200 });
  const token = login.json("accessToken");
  if (!token) return;
  const response = http.post(`${baseUrl}/api/orders`, null, { headers: { Authorization: `Bearer ${token}` } });
  check(response, { "order request is handled": (result) => [201, 400, 409].includes(result.status) });
}
