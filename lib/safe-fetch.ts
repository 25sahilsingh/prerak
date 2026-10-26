import { lookup, type LookupAddress } from "node:dns";
import { BlockList, isIP } from "node:net";
import { Agent, fetch as undiciFetch } from "undici";

// Visitors type their own model address, and the server is the one that connects to it. Without this check anyone
// could make the server fetch localhost, the private network, or the cloud metadata endpoint on their behalf.
export const allowPrivateModelUrls =
  process.env.ALLOW_PRIVATE_MODEL_URLS === "true" ||
  (!process.env.ALLOW_PRIVATE_MODEL_URLS && process.env.NODE_ENV !== "production");

export class PrivateAddressError extends Error {
  name = "PrivateAddressError";
}

const blocked = new BlockList();
for (const [net, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const)
  blocked.addSubnet(net, prefix, "ipv4");
// No ::ffff:0:0/96 rule: BlockList checks IPv4 addresses against it too, which would block every address.
// IPv4-mapped IPv6 addresses are matched by the IPv4 rules above instead.
for (const [net, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["64:ff9b::", 96],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const)
  blocked.addSubnet(net, prefix, "ipv6");

export function isPrivateAddress(address: string): boolean {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
  if (mapped) return blocked.check(mapped[1], "ipv4");
  const family = isIP(address);
  if (!family) return true;
  return blocked.check(address, family === 4 ? "ipv4" : "ipv6");
}

const refuse = (host: string) =>
  new PrivateAddressError(`${host} is a private or local address, which this server does not connect to.`);

// Checking the address at connect time (not before the request) also covers DNS names that change between lookups.
const guardedAgent = new Agent({
  connect: {
    lookup(hostname: string, options: object, cb: (err: Error | null, address: string | LookupAddress[], family?: number) => void) {
      lookup(hostname, { ...options, all: true }, (err, addresses) => {
        if (err) return cb(err, []);
        if (!addresses.length || addresses.some((a) => isPrivateAddress(a.address))) return cb(refuse(hostname), []);
        if ((options as { all?: boolean }).all) return cb(null, addresses);
        cb(null, addresses[0].address, addresses[0].family);
      });
    },
  },
});

/** fetch for a model address. Untrusted addresses may not reach private networks or follow redirects. */
export function modelFetch(trusted: boolean): typeof fetch {
  if (trusted || allowPrivateModelUrls) return fetch;
  return ((input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : input);
    const host = url.hostname.replace(/^\[|\]$/g, "");
    // Node skips the lookup hook for literal IPs, so those are checked here.
    if (isIP(host) && isPrivateAddress(host)) return Promise.reject(refuse(host));
    return undiciFetch(url, { ...(init as object), dispatcher: guardedAgent, redirect: "error" });
  }) as unknown as typeof fetch;
}
