/**
 * ZK Proof Generator for SkillProof Protocol
 *
 * Generates a Groth16 proof that ELO >= threshold without revealing the ELO.
 * Optionally submits the proof on-chain to the SkillProofZKVerifier contract.
 *
 * Usage:
 *   # Default values (ELO=1847, threshold=1500, salt=12345)
 *   npx hardhat run scripts/generate-zk-proof.ts
 *
 *   # Custom values via environment variables
 *   ELO=2105 THRESHOLD=1800 SALT=99999 npx hardhat run scripts/generate-zk-proof.ts
 *
 *   # Submit on-chain to Coston2
 *   SUBMIT=true npx hardhat run scripts/generate-zk-proof.ts --network coston2
 */

import { ethers } from "hardhat";
import * as snarkjs from "snarkjs";
import * as path from "path";
import * as fs from "fs";

async function main() {
  // Parse arguments from env vars (hardhat run doesn't pass positional args)
  const elo = parseInt(process.env.ELO || "1847");
  const threshold = parseInt(process.env.THRESHOLD || "1500");
  const salt = parseInt(process.env.SALT || "12345");
  const submit = process.env.SUBMIT === "true";

  console.log(`\n=== ZK Proof Generator ===`);
  console.log(`  ELO:       ${elo}`);
  console.log(`  Threshold: ${threshold}`);
  console.log(`  Salt:      ${salt}`);
  console.log(`  Submit:    ${submit}`);

  // Validate inputs
  if (elo < threshold) {
    console.error(`\n  ERROR: ELO (${elo}) must be >= threshold (${threshold})`);
    console.error(`  The circuit proves ELO >= threshold; it will fail if ELO < threshold.`);
    process.exit(1);
  }

  // Compute credential commitment (must match circuit logic)
  // commitment = elo + salt * 2^32
  const commitment = BigInt(elo) + BigInt(salt) * 4294967296n;
  console.log(`  Commitment: ${commitment}`);

  // Circuit input
  const input = {
    threshold: threshold.toString(),
    credentialCommitment: commitment.toString(),
    elo: elo.toString(),
    salt: salt.toString(),
  };

  // Resolve artifact paths
  const buildDir = path.join(__dirname, "../circuits/build");
  const wasmPath = path.join(buildDir, "threshold_proof_js/threshold_proof.wasm");
  const zkeyPath = path.join(buildDir, "threshold_proof_final.zkey");
  const vkeyPath = path.join(buildDir, "verification_key.json");

  // Verify artifacts exist
  for (const [label, p] of [["WASM", wasmPath], ["ZKey", zkeyPath], ["VKey", vkeyPath]] as const) {
    if (!fs.existsSync(p)) {
      console.error(`\n  ERROR: ${label} not found at ${p}`);
      console.error(`  Run the circuit build first (see circuits/ directory).`);
      process.exit(1);
    }
  }

  // ── Generate proof ──
  console.log(`\n  Generating Groth16 proof...`);
  const startTime = Date.now();

  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    input,
    wasmPath,
    zkeyPath
  );

  const elapsed = Date.now() - startTime;
  console.log(`  Proof generated in ${elapsed}ms`);

  console.log(`\n=== Public Signals ===`);
  console.log(`  [0] valid:      ${publicSignals[0]}`);
  console.log(`  [1] threshold:  ${publicSignals[1]}`);
  console.log(`  [2] commitment: ${publicSignals[2]}`);

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
    const zkVerifierAddr = deployments.coston2?.SkillProofZKVerifier;

    if (!zkVerifierAddr) {
      console.error("  ERROR: SkillProofZKVerifier address not found in deployments.json");
      process.exit(1);
    }

    const zkWrapperABI = JSON.parse(
      fs.readFileSync(path.join(__dirname, "../lib/zk-wrapper-abi.json"), "utf8")
    );

    const [signer] = await ethers.getSigners();
    console.log(`  Signer:   ${signer.address}`);
    console.log(`  Contract: ${zkVerifierAddr}`);

    const zkVerifier = new ethers.Contract(zkVerifierAddr, zkWrapperABI, signer);

    // Check if already verified
    const alreadyVerified = await zkVerifier.isZKVerified(signer.address);
    if (alreadyVerified) {
      const existingThreshold = await zkVerifier.getVerifiedThreshold(signer.address);
      console.log(`  Already ZK-verified with threshold: ${existingThreshold}`);
      console.log(`  Submitting new proof will update the record.`);
    }

    const tx = await zkVerifier.verifyThresholdZK(pA, pB, pC, pubSignals);
    console.log(`  Tx hash:  ${tx.hash}`);

    const receipt = await tx.wait();
    console.log(`  Block:    ${receipt!.blockNumber}`);
    console.log(`  Gas used: ${receipt!.gasUsed.toString()}`);

    // Verify it recorded
    const nowVerified = await zkVerifier.isZKVerified(signer.address);
    const storedThreshold = await zkVerifier.getVerifiedThreshold(signer.address);
    const storedCommitment = await zkVerifier.getVerifiedCommitment(signer.address);
    const totalCount = await zkVerifier.getZKVerificationCount();

    console.log(`\n=== On-Chain State ===`);
    console.log(`  ZK Verified:     ${nowVerified}`);
    console.log(`  Threshold:       ${storedThreshold}`);
    console.log(`  Commitment:      ${storedCommitment}`);
    console.log(`  Total ZK Proofs: ${totalCount}`);
  }

  // ── Save proof ──
  const outputPath = path.join(buildDir, "latest_proof.json");
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
  console.log(`\n  Proof saved to: circuits/build/latest_proof.json`);
  console.log(`\n=== Done ===\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
