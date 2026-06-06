/// $LENZ — the native token of walletlens.live, on Sui.
///
/// A standard Sui `coin` with a fixed, hard-capped supply and NO ongoing minting:
/// the entire 10,000,000 LENZ supply is minted once at publish time, then the
/// TreasuryCap is FROZEN — after which no address (including the deployer) can ever
/// mint again. The CoinMetadata is frozen too, so name/symbol/icon are immutable.
///
/// This module has no admin, no mint authority that survives publish, no pause, no
/// upgrade hook and no hidden allocation logic — there is nothing for an insider to
/// abuse. Distribution to the allocation wallets is done with ordinary transfers
/// after publish (see scripts/distribute.sh).
module lenz::lenz {
    use sui::coin;
    use sui::url;

    /// One-time witness. Must be the module name in UPPERCASE and have `drop`.
    public struct LENZ has drop {}

    /// 6 decimals. 1 LENZ = 1,000,000 base units.
    const DECIMALS: u8 = 6;
    /// 10,000,000 LENZ × 10^6 = 10,000,000,000,000 base units. Hard cap.
    const TOTAL_SUPPLY: u64 = 10_000_000_000_000;

    fun init(witness: LENZ, ctx: &mut TxContext) {
        let (mut treasury, metadata) = coin::create_currency(
            witness,
            DECIMALS,
            b"LENZ",
            b"WalletLens",
            b"Native token of walletlens.live - a free, privacy-first, all-asset portfolio tracker.",
            option::some(url::new_unsafe_from_bytes(b"https://walletlens.live/lenz-coin.svg")),
            ctx,
        );

        // Mint the entire fixed supply once, to the publisher.
        let minted = coin::mint(&mut treasury, TOTAL_SUPPLY, ctx);
        transfer::public_transfer(minted, ctx.sender());

        // Lock the supply FOREVER: a frozen TreasuryCap can never be borrowed
        // mutably again, so coin::mint can never be called. No inflation, ever.
        transfer::public_freeze_object(treasury);

        // Make metadata immutable too (name/symbol/decimals/icon can't change).
        transfer::public_freeze_object(metadata);
    }
}
