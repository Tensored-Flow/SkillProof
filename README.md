# SkillProof Protocol

Verifiable on-chain skill credentials. Built on Flare Network (Coston2 testnet).

## Structure
- `contracts/` — Solidity smart contracts
- `scripts/` — Deploy and seed scripts
- `test/` — Contract tests
- `oracle/` — Flare oracle integration
- `lib/` — ABIs, deployment addresses, shared utils
- `frontend/` — Next.js frontend (teammate's workspace)

## Setup
```bash
npm install --legacy-peer-deps
cp .env.example .env  # add your private key
npx hardhat compile
npx hardhat test
```

## Deploy
```bash
npx hardhat run scripts/deploy.ts --network coston2
npx hardhat run scripts/seed.ts --network coston2
```
