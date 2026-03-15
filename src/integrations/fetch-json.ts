export async function fetchJson(url: string, headers?: Record<string, string>): Promise<unknown> {
  const res = await fetch(url, {
    headers: headers ?? {},
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to fetch json: ${res.status} ${text}`);
  }

  return await res.json();
}
