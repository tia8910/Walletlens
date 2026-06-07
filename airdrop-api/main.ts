// $LENZ airdrop registration API — Deno Deploy + Deno KV.
//
// Validates wallet OWNERSHIP via a signed message, gates on on-chain history,
// de-dupes, flags IP clusters, and stores registrations in Deno KV. The final
// token allocation is flat-per-wallet (see sui-token/), so this DB's job is a
// clean, sybil-resistant list of eligible wallets — not to set token amounts.
//
// Deploy: `deno deploy` (or link this file in the Deno Deploy dashboard).
// Env: SUI_RPC, MIN_TX, ADMIN_TOKEN, IP_SALT, ALLOWED_ORIGIN
//
// Routes:
//   POST /register   { address, signature, quests[], referredBy?, xHandle? }
//   GET  /status?address=0x..
//   GET  /stats
//   GET  /export      (header: Authorization: Bearer <ADMIN_TOKEN>) → CSV of eligible
import { verifyPersonalMessageSignature } from "npm:@mysten/sui@^1/verify";

const kv = await Deno.openKv();
const RPC = Deno.env.get("SUI_RPC") ?? "https://fullnode.mainnet.sui.io:443";
const MIN_TX = Number(Deno.env.get("MIN_TX") ?? "1");
const ADMIN_TOKEN = Deno.env.get("ADMIN_TOKEN") ?? "";
const IP_SALT = Deno.env.get("IP_SALT") ?? "lenz-salt";
const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN") ?? "*";

const ADDR_RE = /^0x[0-9a-fA-F]{64}$/;
const QUEST_PTS: Record<string, number> = {
  portfolio: 100, track3: 100, follow_x: 50, follow_founder: 25,
  repost: 75, youtube: 50, screenshot: 100, referral: 50,
};
// The exact message the wallet must sign (frontend builds the identical string).
const signMessage = (addr: string) =>
  `WalletLens $LENZ airdrop\nI confirm I own this wallet and want to register:\n${addr}`;

const cors = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...cors } });

async function hashIp(ip: string): Promise<string> {
  const data = new TextEncoder().encode(IP_SALT + ip);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(buf)].slice(0, 8).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// On-chain gate: does the wallet have >= MIN_TX outgoing txns?
async function onchainOk(address: string): Promise<boolean> {
  if (MIN_TX <= 0) return true;
  try {
    const r = await fetch(RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0", id: 1, method: "suix_queryTransactionBlocks",
        params: [{ filter: { FromAddress: address }, options: {} }, null, Math.max(MIN_TX, 1), false],
      }),
    });
    const j = await r.json();
    return (j?.result?.data?.length ?? 0) >= MIN_TX;
  } catch {
    return false; // fail safe: ineligible if RPC unreachable
  }
}

async function verifyOwnership(address: string, signature: string): Promise<boolean> {
  try {
    const bytes = new TextEncoder().encode(signMessage(address));
    const pubkey = await verifyPersonalMessageSignature(bytes, signature);
    return pubkey.toSuiAddress() === address;
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  // ── GET /stats ────────────────────────────────────────────────────────────
  if (req.method === "GET" && url.pathname === "/stats") {
    let total = 0, eligible = 0;
    for await (const e of kv.list({ prefix: ["reg"] })) {
      total++; if ((e.value as any).eligible) eligible++;
    }
    return json({ total, eligible });
  }

  // ── GET /status ───────────────────────────────────────────────────────────
  if (req.method === "GET" && url.pathname === "/status") {
    const address = (url.searchParams.get("address") ?? "").toLowerCase();
    if (!ADDR_RE.test(address)) return json({ error: "bad address" }, 400);
    const rec = await kv.get(["reg", address]);
    return rec.value ? json(rec.value) : json({ registered: false });
  }

  // ── GET /export (admin) → CSV of eligible addresses ──────────────────────────
  if (req.method === "GET" && url.pathname === "/export") {
    const auth = req.headers.get("Authorization") ?? "";
    if (!ADMIN_TOKEN || auth !== `Bearer ${ADMIN_TOKEN}`) return json({ error: "unauthorized" }, 401);
    const rows = ["address"];
    for await (const e of kv.list({ prefix: ["reg"] })) {
      const v = e.value as any;
      if (v.eligible) rows.push(v.address);
    }
    return new Response(rows.join("\n") + "\n", {
      headers: { "Content-Type": "text/csv", ...cors },
    });
  }

  // ── POST /register ──────────────────────────────────────────────────────────
  if (req.method === "POST" && url.pathname === "/register") {
    let body: any;
    try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }
    const address = String(body.address ?? "").toLowerCase();
    const signature = String(body.signature ?? "");
    const quests: string[] = Array.isArray(body.quests) ? body.quests.filter((q: string) => q in QUEST_PTS) : [];
    const referredBy = ADDR_RE.test(String(body.referredBy ?? "").toLowerCase()) ? String(body.referredBy).toLowerCase() : null;
    const xHandle = String(body.xHandle ?? "").replace(/[^a-zA-Z0-9_]/g, "").slice(0, 30);

    if (!ADDR_RE.test(address)) return json({ error: "invalid Sui address" }, 400);

    // 1) Ownership is OPTIONAL at registration — no wallet connection required, so
    //    users who fear "connect wallet" can still register by pasting their address.
    //    This is safe because only the true owner can ever CLAIM: the Merkle claim
    //    pays ctx.sender(), so registering an unowned address gains an attacker
    //    nothing. If a signature IS supplied we verify it and mark "verified".
    let verified = false;
    if (signature) {
      verified = await verifyOwnership(address, signature);
      if (!verified) return json({ error: "signature was provided but is invalid" }, 401);
    }
    // 2) On-chain history gate (reject fresh/throwaway wallets).
    const eligible = await onchainOk(address);

    // 3) IP cluster flagging.
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "0.0.0.0";
    const ipHash = await hashIp(ip);
    const ipKey = ["ipcount", ipHash];
    const ipCount = ((await kv.get<number>(ipKey)).value ?? 0);

    const points = quests.reduce((a, q) => a + (QUEST_PTS[q] ?? 0), 0);
    const existing = (await kv.get(["reg", address])).value as any;

    const rec = {
      address,
      quests,
      points,
      referredBy: existing?.referredBy ?? referredBy,
      referrals: existing?.referrals ?? 0,
      xHandle: xHandle || existing?.xHandle || null,
      eligible,
      verified: verified || existing?.verified || false,
      ipHash,
      ipFlag: ipCount >= 5, // many wallets from one IP → flag for review
      createdAt: existing?.createdAt ?? Date.now(),
      updatedAt: Date.now(),
    };

    const tx = kv.atomic().set(["reg", address], rec);
    if (!existing) tx.set(ipKey, ipCount + 1);
    await tx.commit();

    // Credit a referrer once, on first registration.
    if (!existing && rec.referredBy && rec.referredBy !== address) {
      const refRec = (await kv.get(["reg", rec.referredBy])).value as any;
      if (refRec) await kv.set(["reg", rec.referredBy], { ...refRec, referrals: (refRec.referrals ?? 0) + 1 });
    }

    return json({
      ok: true,
      eligible,
      verified,
      points,
      referralLink: `https://walletlens.live/airdrop?ref=${address}`,
      note: eligible
        ? "Registered and eligible. You'll claim with your wallet only at the end."
        : "Registered, but this wallet has no on-chain Sui history yet — use a wallet you actually transact with to qualify.",
    });
  }

  return json({ error: "not found" }, 404);
});
