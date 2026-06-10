/// $LENZ Merkle airdrop — trustless, claim-based distribution.
///
/// Flow:
///   1. Off-chain, build a Merkle tree from a snapshot CSV (address, amount) with
///      `scripts/build-merkle.mjs` → produces the 32-byte root + per-address proofs.
///   2. `create(coins, root)` shares an `Airdrop` funded with the airdrop coins and
///      pins the root. The creator keeps an `AdminCap` (only to sweep leftovers).
///   3. Each eligible user calls `claim(amount, proof)` once; the contract verifies
///      their (address, amount) against the root and pays them from the vault.
///
/// Hashing scheme (must match build-merkle.mjs EXACTLY):
///   leaf = sha2_256( address_bytes(32) || amount_le_u64(8) )
///   node = sha2_256( sort(left, right) )           // OpenZeppelin-style sorted pairs
/// Odd nodes are carried up unchanged. Proofs are position-independent.
///
/// ⚠️ UNAUDITED. Test thoroughly on testnet and get a review before mainnet.
module lenz::airdrop {
    use std::hash;
    use sui::address;
    use sui::balance::{Self, Balance};
    use sui::coin::{Self, Coin};
    use sui::table::{Self, Table};
    use lenz::lenz::LENZ;

    const EAlreadyClaimed: u64 = 0;
    const EInvalidProof: u64 = 1;

    public struct AdminCap has key, store { id: UID }

    public struct Airdrop has key {
        id: UID,
        root: vector<u8>,            // 32-byte sha256 Merkle root
        vault: Balance<LENZ>,        // remaining, unclaimed $LENZ
        claimed: Table<address, bool>,
    }

    /// Create and share the airdrop, funded with `coins`. Sender receives an
    /// AdminCap used only to recover any unclaimed balance later.
    public entry fun create(coins: Coin<LENZ>, root: vector<u8>, ctx: &mut TxContext) {
        let ad = Airdrop {
            id: object::new(ctx),
            root,
            vault: coin::into_balance(coins),
            claimed: table::new<address, bool>(ctx),
        };
        transfer::share_object(ad);
        transfer::transfer(AdminCap { id: object::new(ctx) }, ctx.sender());
    }

    /// Claim `amount` (base units) for the caller, proving inclusion with `proof`.
    /// Each address can claim at most once.
    public entry fun claim(
        ad: &mut Airdrop,
        amount: u64,
        proof: vector<vector<u8>>,
        ctx: &mut TxContext,
    ) {
        let who = ctx.sender();
        assert!(!table::contains(&ad.claimed, who), EAlreadyClaimed);

        // leaf = sha2_256( address_bytes(32) || amount as 8 little-endian bytes )
        let mut data = address::to_bytes(who);
        let mut a = amount;
        let mut i = 0;
        while (i < 8) {
            vector::push_back(&mut data, ((a & 0xff) as u8));
            a = a >> 8;
            i = i + 1;
        };
        let mut node = hash::sha2_256(data);

        // Fold the proof with sorted-pair hashing.
        let len = vector::length(&proof);
        let mut j = 0;
        while (j < len) {
            let sib = *vector::borrow(&proof, j);
            node = hash_pair(node, sib);
            j = j + 1;
        };
        assert!(node == ad.root, EInvalidProof);

        table::add(&mut ad.claimed, who, true);
        let part = balance::split(&mut ad.vault, amount);
        transfer::public_transfer(coin::from_balance(part, ctx), who);
    }

    /// Recover any unclaimed balance after the campaign (admin only).
    public entry fun sweep(_cap: &AdminCap, ad: &mut Airdrop, ctx: &mut TxContext) {
        let amt = balance::value(&ad.vault);
        let part = balance::split(&mut ad.vault, amt);
        transfer::public_transfer(coin::from_balance(part, ctx), ctx.sender());
    }

    /// Read remaining unclaimed balance.
    public fun remaining(ad: &Airdrop): u64 { balance::value(&ad.vault) }

    fun hash_pair(a: vector<u8>, b: vector<u8>): vector<u8> {
        if (le(&a, &b)) {
            let mut buf = a;
            vector::append(&mut buf, b);
            hash::sha2_256(buf)
        } else {
            let mut buf = b;
            vector::append(&mut buf, a);
            hash::sha2_256(buf)
        }
    }

    // true if a <= b lexicographically
    fun le(a: &vector<u8>, b: &vector<u8>): bool {
        let la = vector::length(a);
        let lb = vector::length(b);
        let m = if (la < lb) la else lb;
        let mut i = 0;
        while (i < m) {
            let x = *vector::borrow(a, i);
            let y = *vector::borrow(b, i);
            if (x < y) return true;
            if (x > y) return false;
            i = i + 1;
        };
        la <= lb
    }
}
