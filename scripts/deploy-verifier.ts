import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying SkillProofVerifier with account:", deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", ethers.formatEther(balance), "C2FLR");

  // Read deployment addresses
  const libDir = path.join(__dirname, "..", "lib");
  const deploymentsPath = path.join(libDir, "deployments.json");
  const deployments = JSON.parse(fs.readFileSync(deploymentsPath, "utf-8"));

  const network = await ethers.provider.getNetwork();
  const networkName = network.chainId === 114n ? "coston2" : "localhost";

  const registryAddress = deployments[networkName]?.SkillProofRegistry;
  if (!registryAddress) {
    throw new Error(`No SkillProofRegistry found for "${networkName}". Run deploy.ts first.`);
  }
  console.log("Using SkillProofRegistry at:", registryAddress);

  // Deploy SkillProofVerifier
  const Factory = await ethers.getContractFactory("SkillProofVerifier");
  const verifier = await Factory.deploy(registryAddress);
  await verifier.waitForDeployment();

  const address = await verifier.getAddress();
  console.log("✅ Verifier deployed at:", address);

  // Update deployments.json
  deployments[networkName].SkillProofVerifier = address;
  fs.writeFileSync(deploymentsPath, JSON.stringify(deployments, null, 2) + "\n");
  console.log("Updated lib/deployments.json");

  // Extract ABI and save to lib/verifier-abi.json
  const artifactPath = path.join(
    __dirname, "..", "artifacts", "contracts",
    "SkillProofVerifier.sol", "SkillProofVerifier.json"
  );
  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf-8"));
  fs.writeFileSync(
    path.join(libDir, "verifier-abi.json"),
    JSON.stringify(artifact.abi, null, 2) + "\n"
  );
  console.log("Saved ABI to lib/verifier-abi.json");

  // ── Set Merkle root from Registry credentials ──
  console.log("\n── Setting Merkle root from Registry ──");

  // Determine credentialed player addresses
  let playerAddresses: string[];
  const signers = await ethers.getSigners();

  if (networkName === "localhost" && signers.length >= 6) {
    // Localhost: signers[1..4] were minted in test fixture
    playerAddresses = signers.slice(1, 5).map((s) => s.address);
  } else {
    // Coston2: deployer + known seeded addresses from mnemonic
    const mnemonic = "test test test test test test test test test test test junk";
    const mariaWallet = ethers.HDNodeWallet.fromMnemonic(
      ethers.Mnemonic.fromPhrase(mnemonic),
      "m/44'/60'/0'/0/4"
    );
    const rajWallet = ethers.HDNodeWallet.fromMnemonic(
      ethers.Mnemonic.fromPhrase(mnemonic),
      "m/44'/60'/0'/0/5"
    );

    playerAddresses = [deployer.address, mariaWallet.address, rajWallet.address];
  }

  // Filter to only addresses that actually have credentials
  const registryAbi = JSON.parse(fs.readFileSync(path.join(libDir, "abi.json"), "utf-8"));
  const registry = new ethers.Contract(registryAddress, registryAbi, deployer);

  const validPlayers: string[] = [];
  for (const addr of playerAddresses) {
    try {
      const hasCred = await registry.hasCredential(addr);
      if (hasCred) {
        validPlayers.push(addr);
        console.log(`  ✓ ${addr} has credential`);
      } else {
        console.log(`  ✗ ${addr} no credential (skipping)`);
      }
    } catch {
      console.log(`  ✗ ${addr} failed to check (skipping)`);
    }
  }

  if (validPlayers.length > 0) {
    const tx = await verifier.updateMerkleRootFromRegistry(validPlayers);
    await tx.wait();
    const root = await verifier.credentialMerkleRoot();
    console.log("✅ Merkle root set:", root);
  } else {
    console.log("⚠ No valid players found — Merkle root not set");
  }

  const count = await verifier.getVerificationCount();
  console.log("✅ Verification count:", count.toString());

  // ── Summary ──
  console.log("\n══════════════════════════════════════");
  console.log("   VERIFIER DEPLOYMENT COMPLETE");
  console.log("══════════════════════════════════════");
  console.log("Verifier:    ", address);
  console.log("Registry:    ", registryAddress);
  console.log("Network:     ", networkName);
  console.log("Players:     ", validPlayers.length);
  console.log("══════════════════════════════════════");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
