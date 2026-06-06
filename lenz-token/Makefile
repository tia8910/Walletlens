# Convenience wrappers. Run `cp scripts/env.example.sh scripts/env.sh` and edit first.
.PHONY: bootstrap upload instantiate viewing-key balance token-info verify clean

bootstrap:
	./scripts/bootstrap.sh

upload:
	./scripts/upload.sh

instantiate:
	./scripts/instantiate.sh

viewing-key:
	./scripts/create-viewing-key.sh

balance:
	./scripts/query-balance.sh

# "Don't trust, verify" — check the deployed contract against the audited build.
verify:
	./scripts/verify-onchain.sh

# Public, unencrypted token metadata (name/symbol/decimals; total supply only if public).
token-info:
	@. scripts/env.sh; \
	secretcli q compute query $$CONTRACT_ADDR '{"token_info":{}}' --node $$NODE

clean:
	rm -rf .refimpl artifact
