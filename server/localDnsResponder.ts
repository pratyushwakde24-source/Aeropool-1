import dgram from 'dgram';
import os from 'os';
// @ts-ignore - multicast-dns is a JS module
import createMdns from 'multicast-dns';

/**
 * AeroPool — Local Network Hostname & mDNS Service
 *
 * Provides dual-layer local name resolution for:
 * 1. http://aeropool.local:3000
 *
 * Layers:
 * - Layer 1: mDNS (RFC 6762) over UDP 5353 for Windows, iOS (Safari), macOS, and mDNS-compatible Android.
 * - Layer 2: Unicast DNS (RFC 1035) over UDP 53 with transparent upstream forwarding
 *            for Android devices or environments requiring direct unicast DNS.
 */

export interface LocalDnsStatus {
  mdnsRunning: boolean;
  unicastDnsRunning: boolean;
  lanIp: string;
  hostname: string;
}

function detectActiveLanIp(): string {
  try {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name] || []) {
        if (iface.family === 'IPv4' && !iface.internal) {
          return iface.address;
        }
      }
    }
  } catch {
    // fallback
  }
  return '127.0.0.1';
}

/**
 * Builds standard DNS A-record response for unicast DNS (UDP 53)
 */
function buildDnsAnswer(queryPacket: Buffer, ip: string): Buffer | null {
  try {
    if (queryPacket.length < 12) return null;

    const id = queryPacket.subarray(0, 2);
    // Flags: Response (0x8000) + Authoritative (0x0400) + Recursion Available (0x0080) = 0x8580
    const flags = Buffer.from([0x85, 0x80]);
    const qdcount = queryPacket.subarray(4, 6);
    const ancount = Buffer.from([0x00, 0x01]);
    const nscount = Buffer.from([0x00, 0x00]);
    const arcount = Buffer.from([0x00, 0x00]);

    // Find end of Question section
    let offset = 12;
    while (offset < queryPacket.length && queryPacket[offset] !== 0) {
      offset += queryPacket[offset] + 1;
    }
    offset += 1; // skip null terminator
    offset += 4; // skip QTYPE and QCLASS

    if (offset > queryPacket.length) return null;
    const questionSection = queryPacket.subarray(12, offset);

    // Answer Record (compression pointer to question name at 0xc00c)
    const ipParts = ip.split('.').map(Number);
    const answerRecord = Buffer.from([
      0xc0, 0x0c,             // Pointer to Name at offset 12
      0x00, 0x01,             // Type A
      0x00, 0x01,             // Class IN
      0x00, 0x00, 0x00, 0x3c, // TTL: 60 seconds
      0x00, 0x04,             // RDLENGTH: 4 bytes
      ipParts[0], ipParts[1], ipParts[2], ipParts[3],
    ]);

    return Buffer.concat([id, flags, qdcount, ancount, nscount, arcount, questionSection, answerRecord]);
  } catch {
    return null;
  }
}

/**
 * Extracts queried domain name from DNS packet
 */
function parseDnsQueryName(packet: Buffer): string {
  try {
    let offset = 12;
    const parts: string[] = [];
    while (offset < packet.length) {
      const len = packet[offset];
      if (len === 0) break;
      if (len > 63 || offset + 1 + len > packet.length) return '';
      parts.push(packet.toString('utf8', offset + 1, offset + 1 + len));
      offset += len + 1;
    }
    return parts.join('.').toLowerCase();
  } catch {
    return '';
  }
}

export class LocalDnsService {
  private mdnsInstance: any = null;
  private unicastSocket: dgram.Socket | null = null;
  private lanIp: string;
  private targetHostname = 'aeropool.local';
  private aliases = ['aeropool.local', 'aeropool', 'aeropool.lan'];
  private upstreamDns = '192.168.1.1'; // Primary router DNS
  private fallbackDns = '8.8.8.8';    // Secondary public DNS

  constructor() {
    this.lanIp = detectActiveLanIp();
  }

  public start(): LocalDnsStatus {
    this.lanIp = detectActiveLanIp();
    this.startMdns();
    this.startUnicastDns();

    return {
      mdnsRunning: Boolean(this.mdnsInstance),
      unicastDnsRunning: Boolean(this.unicastSocket),
      lanIp: this.lanIp,
      hostname: this.targetHostname,
    };
  }

  private startMdns(): void {
    try {
      this.mdnsInstance = createMdns();

      this.mdnsInstance.on('query', (query: any) => {
        if (!query.questions || !Array.isArray(query.questions)) return;

        for (const q of query.questions) {
          const qName = (q.name || '').toLowerCase().replace(/\.$/, '');
          if (this.aliases.includes(qName) || qName.startsWith('aeropool')) {
            this.mdnsInstance.respond({
              answers: [
                {
                  name: q.name,
                  type: 'A',
                  ttl: 120,
                  data: this.lanIp,
                },
              ],
            });
            console.log(`[AeroPool mDNS] Resolved query "${q.name}" -> ${this.lanIp}`);
          }
        }
      });

      console.log(`[AeroPool mDNS] Active on 224.0.0.251:5353 for http://${this.targetHostname}:3000 -> ${this.lanIp}`);
    } catch (err: any) {
      console.warn(`[AeroPool mDNS] Could not initialize mDNS responder: ${err.message}`);
    }
  }

  private startUnicastDns(): void {
    try {
      this.unicastSocket = dgram.createSocket('udp4');

      this.unicastSocket.on('error', (err) => {
        console.warn(`[AeroPool LocalDNS] UDP 53 notice: ${err.message}`);
      });

      this.unicastSocket.on('message', (msg, rinfo) => {
        const queryName = parseDnsQueryName(msg);

        // Check if query is for aeropool
        if (this.aliases.includes(queryName) || queryName.startsWith('aeropool')) {
          const answer = buildDnsAnswer(msg, this.lanIp);
          if (answer && this.unicastSocket) {
            this.unicastSocket.send(answer, 0, answer.length, rinfo.port, rinfo.address);
            console.log(`[AeroPool LocalDNS] Resolved unicast query "${queryName}" from ${rinfo.address} -> ${this.lanIp}`);
          }
        } else {
          // Transparently forward all other DNS requests upstream so client maintains normal internet
          const forwarder = dgram.createSocket('udp4');
          forwarder.send(msg, 0, msg.length, 53, this.upstreamDns, (err) => {
            if (err) {
              // Try fallback
              forwarder.send(msg, 0, msg.length, 53, this.fallbackDns);
            }
          });

          forwarder.on('message', (resp) => {
            if (this.unicastSocket) {
              this.unicastSocket.send(resp, 0, resp.length, rinfo.port, rinfo.address);
            }
            forwarder.close();
          });

          forwarder.on('error', () => {
            try { forwarder.close(); } catch {}
          });

          setTimeout(() => {
            try { forwarder.close(); } catch {}
          }, 3000);
        }
      });

      this.unicastSocket.bind(53, '0.0.0.0', () => {
        console.log(`[AeroPool LocalDNS] Unicast DNS active on UDP 53 (Transparent proxy to ${this.upstreamDns})`);
      });
    } catch (err: any) {
      console.warn(`[AeroPool LocalDNS] UDP 53 unavailable (${err.message}). mDNS on UDP 5353 remains active.`);
    }
  }

  public stop(): void {
    if (this.mdnsInstance) {
      try {
        this.mdnsInstance.destroy();
      } catch {}
      this.mdnsInstance = null;
    }
    if (this.unicastSocket) {
      try {
        this.unicastSocket.close();
      } catch {}
      this.unicastSocket = null;
    }
    console.log('[AeroPool LocalDNS] Sockets released cleanly.');
  }

  public getStatus(): LocalDnsStatus {
    return {
      mdnsRunning: Boolean(this.mdnsInstance),
      unicastDnsRunning: Boolean(this.unicastSocket),
      lanIp: this.lanIp,
      hostname: this.targetHostname,
    };
  }
}

export const localDnsService = new LocalDnsService();

// Standalone execution support
if (process.argv[1] && (process.argv[1].endsWith('localDnsResponder.ts') || process.argv[1].endsWith('localDnsResponder.js'))) {
  console.log('[AeroPool LocalDNS] Starting standalone DNS & mDNS responder...');
  localDnsService.start();
}
