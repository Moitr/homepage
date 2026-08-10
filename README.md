# Homepage

Hexo source for the personal homepage published at `https://moitr.github.io/homepage/`.

## Polygon Amoy archive

The deployment workflow can archive the generated homepage HTML in a
`HomepageArchive` contract on the Polygon Amoy testnet. The contract is deployed
at a deterministic address owned by the publishing wallet.

The content fingerprint excludes the generated footer and the on-chain metadata
display. Re-running a build, changing only the build time, or refreshing chain
metadata does not send another transaction. A transaction is sent only when the
remaining homepage HTML changes.

### GitHub configuration

Create a dedicated testnet wallet and fund it with Amoy POL from the Polygon
faucet. Configure the repository with:

- Actions secret `POLYGON_PRIVATE_KEY`: private key for the dedicated Amoy wallet.
- Optional Actions variable `POLYGON_AMOY_RPC_URL`: custom Amoy RPC endpoint. The
  documented public endpoint `https://polygon-amoy.drpc.org` is used by default.

Never commit the private key or use a wallet that holds mainnet assets. After the
secret is configured, push to `main` or run the deployment workflow manually.
The first run deploys the contract and publishes the HTML. Later runs compare the
normalized content hash with the contract before sending a transaction.

### Local verification

```bash
pnpm clean
pnpm build
pnpm test
pnpm onchain:check
```

`onchain:check` compiles the contract, validates the generated homepage, verifies
the Amoy chain ID and deterministic deployer, and calculates the future contract
address without signing or sending a transaction.
