const token = import.meta.env.VITE_OPERATOR_TOKEN;

export function fetchWithAuth(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  return fetch(input, { ...init, headers });
}

export async function errorDetail(res: Response): Promise<string> {
  try {
    const body = await res.json();
    if (typeof body.detail === "string") {
      return body.detail;
    }
  } catch {
    // Response body was not JSON.
  }
  if (res.status === 401) {
    return "Missing operator token. Set OPERATOR_TOKEN and VITE_OPERATOR_TOKEN to the same value.";
  }
  if (res.status === 403) {
    return "Admin role required.";
  }
  return `Request failed (${res.status}).`;
}
