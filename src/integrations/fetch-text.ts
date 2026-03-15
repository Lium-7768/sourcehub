export async function fetchText(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to fetch text: ${res.status} ${text}`);
  }
  return await res.text();
}
