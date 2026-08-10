# Homepage

Hexo source for the personal homepage published at `https://moitr.github.io/homepage/`.

## Polygon mainnet archive

The deployment workflow can archive the generated homepage HTML in a
`HomepageArchive` contract on Polygon PoS mainnet. The contract is deployed
at a deterministic address owned by the publishing wallet.

The content fingerprint excludes the generated footer and the on-chain metadata
display. Re-running a build, changing only the build time, or refreshing chain
metadata does not send another transaction. A transaction is sent only when the
remaining homepage HTML changes.

### GitHub configuration

Use a dedicated publishing wallet funded with Polygon POL. Configure the
repository with:

- Actions secret `POLYGON_PRIVATE_KEY`: private key for the dedicated publishing
  wallet.
- Optional Actions variable `POLYGON_RPC_URL`: custom Polygon mainnet RPC endpoint.
  The public endpoint `https://polygon.drpc.org` is used by default.

Never commit the private key. Keep only the POL needed for publication in this
wallet. After the secret is configured, push to `main` or run the deployment
workflow manually.
The first run deploys the contract and publishes the HTML. Later runs compare the
normalized content hash with the contract before sending a mainnet transaction.

### Local verification

```bash
pnpm clean
pnpm build
pnpm test
pnpm onchain:check
```

`onchain:check` compiles the contract, validates the generated homepage, verifies
the Polygon mainnet chain ID and deterministic deployer, and calculates the
future contract address without signing or sending a transaction.

## Article archive

Posts use positive numeric filenames and matching front-matter slugs. The first
post is `source/_posts/1.md` with `slug: 1`, so its published path is `/1/`.
Continue with `2.md`, `3.md`, and so on without renumbering existing posts.

Each post is archived in a separate `ArticleArchive` contract as compact JSON:

```json
{
  "title": "Article title",
  "slug": "1",
  "date": "2026-08-10T12:00:00Z",
  "content": "gzip-and-Base64 Markdown",
  "images": [
    { "name": "photo.jpg", "hash": "md5" }
  ]
}
```

Local image hashes cover the file bytes. Remote image hashes cover the stable
image URL so a CDN response change cannot cause an unnecessary transaction. The
deduplication hash uses normalized, uncompressed Markdown, title, slug, date, and
image metadata. A rebuild sends no article transaction unless those values
change. Run `pnpm onchain:check:articles` for a read-only mainnet simulation.
