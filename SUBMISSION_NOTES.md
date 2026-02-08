# SkillProof Protocol — Submission Notes

## Project Description

SkillProof is a protocol for verifiable on-chain skill credentials that uses programmable cryptography to enable privacy-preserving skill verification. Game platforms issue ELO-rated credentials to players, who can then prove their skill level to DeFi protocols, DAOs, and prediction markets without revealing their exact score — using Merkle proofs, ZK-SNARKs (Groth16), commit-reveal schemes, and Flare FTSO oracle attestations. The protocol includes temporal decay (stale credentials lose value), cross-issuer aggregation (composite scores across platforms), economic security via issuer staking/slashing, and a developer SDK for 3-line integration into any protocol.

## Track

**Programmable Cryptography**

## Flare Bounty Eligibility

- Deployed on **Flare Coston2 testnet** (chain ID 114)
- **3 FTSO price feeds** actively used: FLR/USD, BTC/USD, ETH/USD
- FTSOv2 block-latency oracles via `IFtsoV2` interface
- Oracle integration in 2 contracts: SkillProofAttestor (credential attestation) and SkillProofHub (prediction market resolution)
- Uses `@flarenetwork/flare-periphery-contracts` for FTSOv2 interface

## Key Technical Highlights

- **ZK-SNARKs (Groth16)**: Real circom2 circuit proving ELO >= threshold without revealing ELO. Commitment scheme: ELO + salt * 2^32. On-chain verification via auto-generated Solidity verifier.
- **Merkle Proofs**: On-chain Merkle tree built from Registry state. Credential inclusion proofs and threshold proofs with replay prevention.
- **Commit-Reveal**: Used in prediction markets (oracle-resolved) and skill bounties (anonymous solutions). Prevents front-running.
- **Oracle Attestations**: Credentials timestamped against Flare FTSO price feed state, creating verifiable proof of credential existence at a specific oracle moment.
- **Temporal Decay**: Credentials lose 1%/day if not refreshed, flooring at 50%. Incentivizes issuers to maintain current data.
- **Economic Security**: Issuers stake native tokens (0.1 C2FLR minimum). 50% slashing for fraud. 7-day lock. Permanent slash record.
- **Cross-Issuer Aggregation**: Composite ELO across multiple game platforms with cross-domain bonus.
- **SDK**: TypeScript SDK with `checkGate()` — skill-gate any operation in 3 lines of code.

## Stats

| Metric | Count |
|--------|-------|
| Smart contracts | 9 |
| Tests | 210 passing, 1 pending |
| FTSO price feeds | 3 (FLR/USD, BTC/USD, ETH/USD) |
| Cryptographic primitives | 5 (commit-reveal, Merkle, threshold, ZK-SNARK, oracle attestation) |
| Frontend pages | 6 |
| Deploy/seed scripts | 14 |
| SDK methods | 14 |

## Deployed Contract Addresses (Coston2)

| Contract | Address |
|----------|---------|
| SkillProofRegistry | `0xa855e8E15C9F350438065D19a73565ea1A23E33A` |
| SkillProofAttestor | `0xCf7C40Cf2734623db2AeC70dabD060E83b45bef4` |
| SkillProofHub | `0x3eBaD0A13fDe9808938a4eD4f2fE5d92c8b29Cc3` |
| SkillProofVerifier | `0xBEFded5454c7b3E16f1Db888e8280793735B866b` |
| Groth16Verifier | `0xe5Ddc3EfFb0Aa08Eb3e5091128f12D7aB9E0A664` |
| SkillProofZKVerifier | `0x0F46334167e68C489DE6B65D488F9d64624Bc270` |
| SkillProofDecay | `0x20d0A539e0A49991876CDb2004FeA41AFE1C089E` |
| SkillProofAggregator | `0x919473044Dde9b3eb69161C4a35eFfb995a234bB` |
| SkillProofStaking | `0xc9c6837759c769CCA40661285e5633727A1EbDDD` |

## Links

- **GitHub**: <!-- INSERT GITHUB URL -->
- **Demo Video**: <!-- INSERT DEMO VIDEO URL -->
