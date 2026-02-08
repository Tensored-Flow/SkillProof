/**
 * ZK Match History Proof Generator for SkillProof Protocol
 *
 * Generates a Groth16 proof that totalMatches >= minMatches AND winRate >= minWinRateBps,
 * without revealing exact wins, matches, or any match details.
 *
 * Usage:
 *   # Default values (totalMatches=12, wins=8, minMatches=10, minWinRate=6000, salt=54321)
 *   npx hardhat run scripts/generate-match-proof.ts
 *
 *   # Custom values via environment variables
 *   TOTAL_MATCHES=20 WINS=15 MIN_MATCHES=10 MIN_WIN_RATE=7000 SALT=99999 npx hardhat run scripts/generate-match-proof.ts
 *
 *   # Submit on-chain to Coston2
 *   TOTAL_MATCHES=12 WINS=8 MIN_MATCHES=10 MIN_WIN_RATE=6000 SALT=54321 SUBMIT=true npx hardhat run scripts/generate-match-proof.ts --network coston2
 */

import { ethers } from "hardhat";
import * as snarkjs from "snarkjs";
import * as path from "path";
import * as fs from "fs";

async function main() {
  const totalMatches = parseInt(process.env.TOTAL_MATCHES || "12");
  const wins = parseInt(process.env.WINS || "8");
  const minMatches = parseInt(process.env.MIN_MATCHES || "10");
  const minWinRateBps = parseInt(process.env.MIN_WIN_RATE || "6000");
  const salt = parseInt(process.env.SALT || "54321");
  const submit = process.env.SUBMIT === "true";

  console.log(`\n=== ZK Match History Proof Generator ===`);
  console.log(`  Total Matches:  ${totalMatches}`);
  console.log(`  Wins:           ${wins}`);
  console.log(`  Min Matches:    ${minMatches}`);
  console.log(`  Min Win Rate:   ${minWinRateBps} bps (${minWinRateBps / 100}%)`);
  console.log(`  Salt:           ${salt}`);
  console.log(`  Submit:         ${submit}`);

  // Validate inputs
  if (wins > totalMatches) {
    console.error(`\n  ERROR: Wins (${wins}) cannot exceed totalMatches (${totalMatches})`);
    process.exit(1);
  }
  if (totalMatches < minMatches) {
    console.error(`\n  ERROR: totalMatches (${totalMatches}) must be >= minMatches (${minMatches})`);
    process.exit(1);
  }
  const actualWinRateBps = Math.floor((wins * 10000) / totalMatches);
  if (actualWinRateBps < minWinRateBps) {
    console.error(`\n  ERROR: Actual win rate ${actualWinRateBps} bps < minWinRate ${minWinRateBps} bps`);
    process.exit(1);
  }

  // Compute commitment: totalMatches + wins * 2^16 + salt * 2^32
  const commitment = BigInt(totalMatches) + BigInt(wins) * 65536n + BigInt(salt) * 4294967296n;
  console.log(`  Commitment:     ${commitment}`);
  console.log(`  Win Rate:       ${actualWinRateBps} bps (${(actualWinRateBps / 100).toFixed(1)}%)`);

  // Circuit input
  const input = {
    minMatches: minMatches.toString(),
    minWinRateBps: minWinRateBps.toString(),
    commitment: commitment.toString(),
    totalMatches: totalMatches.toString(),
    wins: wins.toString(),
    salt: salt.toString(),
  };

  // Resolve artifact paths
  const buildDir = path.join(__dirname, "../circuits/build");
  const wasmPath = path.join(buildDir, "match_history_proof_js/match_history_proof.wasm");
  const zkeyPath = path.join(buildDir, "match_history_final.zkey");
  const vkeyPath = path.join(buildDir, "match_history_vkey.json");

  // Verify artifacts exist
  for (const [label, p] of [["WASM", wasmPath], ["ZKey", zkeyPath], ["VKey", vkeyPath]] as const) {
    if (!fs.existsSync(p)) {
      console.error(`\n  ERROR: ${label} not found at ${p}`);
      console.error(`  Build the circuit first: cd circuits && ~/.cargo/bin/circom match_history_proof.circom --r1cs --wasm --sym -o build/`);
      process.exit(1);
    }
  }

  // ── Generate proof ──
  console.log(`\n  Generating Groth16 proof (176 constraints)...`);
  const startTime = Date.now();

  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    input,
    wasmPath,
    zkeyPath
  );

  const elapsed = Date.now() - startTime;
  console.log(`  Proof generated in ${elapsed}ms`);

  console.log(`\n=== Public Signals ===`);
  console.log(`  [0] minMatches:    ${publicSignals[0]}`);
  console.log(`  [1] minWinRateBps: ${publicSignals[1]}`);
  console.log(`  [2] commitment:    ${publicSignals[2]}`);

  // ── Verify locally ──
  const vkey = JSON.parse(fs.readFileSync(vkeyPath, "utf8"));
  const isValid = await snarkjs.groth16.verify(vkey, publicSignals, proof);
  console.log(`\n=== Local Verification ===`);
  console.log(`  Result: ${isValid ? "VALID" : "INVALID"}`);

  if (!isValid) {
    console.error("  Proof failed local verification. Aborting.");
    process.exit(1);
  }

  // ── Format for Solidity ──
  const calldata = await snarkjs.groth16.exportSolidityCallData(proof, publicSignals);
  const calldataArgs = JSON.parse(`[${calldata}]`);

  const pA: [string, string] = calldataArgs[0];
  const pB: [[string, string], [string, string]] = calldataArgs[1];
  const pC: [string, string] = calldataArgs[2];
  const pubSignals: [string, string, string] = calldataArgs[3];

  console.log(`\n=== Solidity Calldata ===`);
  console.log(`  pA: [${pA.join(", ")}]`);
  console.log(`  pB: [[${pB[0].join(", ")}], [${pB[1].join(", ")}]]`);
  console.log(`  pC: [${pC.join(", ")}]`);
  console.log(`  pubSignals: [${pubSignals.join(", ")}]`);

  // ── Submit on-chain ──
  if (submit) {
    console.log(`\n=== Submitting to Chain ===`);

    const deploymentsPath = path.join(__dirname, "../lib/deployments.json");
    const deployments = JSON.parse(fs.readFileSync(deploymentsPath, "utf8"));
    const matchVerifierAddr = deployments.coston2?.SkillProofMatchVerifier;

    if (!matchVerifierAddr) {
      console.error("  ERROR: SkillProofMatchVerifier address not found in deployments.json");
      process.exit(1);
    }

    const matchVerifierABI = JSON.parse(
      fs.readFileSync(path.join(__dirname, "../lib/match-verifier-abi.json"), "utf8")
    );

    const [signer] = await ethers.getSigners();
    console.log(`  Signer:   ${signer.address}`);
    console.log(`  Contract: ${matchVerifierAddr}`);

    const matchVerifier = new ethers.Contract(matchVerifierAddr, matchVerifierABI, signer);

    // Step 1: Register commitment
    console.log(`\n  Registering match commitment...`);
    const regTx = await matchVerifier.registerMatchCommitment(totalMatches, wins, salt);
    const regReceipt = await regTx.wait();
    console.log(`  Commitment registered (gas: ${regReceipt!.gasUsed.toString()})`);

    // Step 2: Submit proof
    console.log(`  Submitting ZK proof...`);
    const proofTx = await matchVerifier.verifyMatchHistory(pA, pB, pC, pubSignals);
    console.log(`  Tx hash:  ${proofTx.hash}`);

    const receipt = await proofTx.wait();
    console.log(`  Block:    ${receipt!.blockNumber}`);
    console.log(`  Gas used: ${receipt!.gasUsed.toString()}`);

    // Step 3: Verify recorded state
    const [verified, storedMinMatches, storedMinWinRate, storedCommitment] =
      await matchVerifier.getVerification(signer.address);

    console.log(`\n=== On-Chain State ===`);
    console.log(`  Verified:      ${verified}`);
    console.log(`  Min Matches:   ${storedMinMatches}`);
    console.log(`  Min Win Rate:  ${storedMinWinRate} bps`);
    console.log(`  Commitment:    ${storedCommitment}`);

    // Step 4: Test requirements check
    const meetsReqs = await matchVerifier.meetsMatchRequirements(signer.address, 5, 5000);
    console.log(`  Meets 5 matches + 50% win rate: ${meetsReqs}`);
    const totalCount = await matchVerifier.matchVerificationCount();
    console.log(`  Total Match Proofs: ${totalCount}`);
  }

  // ── Save proof ──
  const outputPath = path.join(buildDir, "latest_match_proof.json");
  fs.writeFileSync(
    outputPath,
    JSON.stringify(
      {
        input,
        proof,
        publicSignals,
        calldata: { pA, pB, pC, pubSignals },
        generatedAt: new Date().toISOString(),
      },
      null,
      2
    )
  );
  console.log(`\n  Proof saved to: circuits/build/latest_match_proof.json`);
  console.log(`\n=== Done ===\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
