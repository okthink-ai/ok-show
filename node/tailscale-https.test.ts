// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { tailscaleHostname } from './tailscale-https.mjs';

describe('Tailscale HTTPS', () => {
  it('accepts a connected MagicDNS HTTPS hostname', () => {
    expect(tailscaleHostname({ BackendState: 'Running', Self: { DNSName: 'talk-box.tail1234.ts.net.' } }))
      .toBe('talk-box.tail1234.ts.net');
  });

  it('rejects disconnected or non-Tailscale hostnames', () => {
    expect(() => tailscaleHostname({ BackendState: 'Stopped', Self: { DNSName: 'talk-box.tail1234.ts.net.' } })).toThrow('connected Tailscale');
    expect(() => tailscaleHostname({ BackendState: 'Running', Self: { DNSName: 'example.com' } })).toThrow('connected Tailscale');
  });
});
