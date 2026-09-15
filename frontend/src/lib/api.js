const API_ROOT = `${import.meta.env.VITE_API_URL || "http://127.0.0.1:5000/api"}`.replace(/\/$/, "");

export function getToken() {
  return localStorage.getItem("honey-chain-token");
}

export function clearSession() {
  localStorage.removeItem("honey-chain-token");
  localStorage.removeItem("honey-chain-user");
}

export async function api(path, options = {}) {
  const headers = new Headers(options.headers || {});
  const token = getToken();
  if (token) headers.set("authorization", `Bearer ${token}`);
  if (!(options.body instanceof FormData)) headers.set("content-type", "application/json");

  const response = await fetch(`${API_ROOT}${path}`, { ...options, headers });
  const text = await response.text();
  let body = {};
  try { body = text ? JSON.parse(text) : {}; } catch { body = { error: text }; }
  if (!response.ok) {
    const error = new Error(body.error || "Request failed");
    error.status = response.status;
    throw error;
  }
  return body;
}

export function jsonBody(value) {
  return JSON.stringify(value);
}
