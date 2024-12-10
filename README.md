## Cross-chain actions POC scripts with Across API

### Setup
```bash
npm i
```

### Run the scripts
- to run cross-chain bridging which is to transfer liquidity to another account on the destination chain
```
npx ts-node instant-bridging/testnet.ts
```
- to run cross-chain bridging with actions (e.g. mint Token/Nft) to be exectuted on the destination chain
```bash
npx ts-node bridging-xchain-actions/testnet.ts
```

### Sample env
```bash
PRIVATE_KEY=""
```
