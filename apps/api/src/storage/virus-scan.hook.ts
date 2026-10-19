/**
 * Upload antivirus hook interface.
 * Wire to ClamAV / corporate scanner in production; default is a no-op pass-through.
 */
export type VirusScanResult = { clean: boolean; engine: string; detail?: string };

export async function scanUpload(
  buffer: Buffer,
  fileName: string,
): Promise<VirusScanResult> {
  const hook = process.env.AV_SCAN_HOOK_URL;
  if (!hook) {
    return { clean: true, engine: 'noop', detail: 'AV hook not configured' };
  }
  const res = await fetch(hook, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream', 'X-Filename': fileName },
    body: new Uint8Array(buffer),
  });
  if (!res.ok) {
    return { clean: false, engine: 'remote', detail: `Scanner HTTP ${res.status}` };
  }
  const data = (await res.json()) as { clean?: boolean; detail?: string };
  return { clean: data.clean !== false, engine: 'remote', detail: data.detail };
}
