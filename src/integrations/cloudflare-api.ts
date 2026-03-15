export interface CloudflareDnsConfig {
  zone_id: string;
  record_types?: string[];
  name_filter?: string;
}

export async function fetchCloudflareDnsRecords(config: CloudflareDnsConfig, apiToken: string) {
  const url = `https://api.cloudflare.com/client/v4/zones/${config.zone_id}/dns_records`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Cloudflare API failed: ${res.status} ${text}`);
  }

  const json = await res.json<{ result?: Array<Record<string, unknown>> }>();
  const records = json.result ?? [];
  if (!config.record_types?.length) return records;
  return records.filter((r) => config.record_types!.includes(String(r.type ?? '')));
}
