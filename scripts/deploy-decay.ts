import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying SkillProofDecay with account:", deployer.address);

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
    throw new Error(`No SkillProofRegistry found for network "${networkName}". Deploy registry first.`);
  }
  console.log("Using SkillProofRegistry at:", registryAddress);

  const decayRatePerDay = 100; // 1% per day (100 bps)
  const minimumMultiplierBps = 5000; // 50% floor
  console.log("Decay rate:", decayRatePerDay, "bps/day (1%)");
  console.log("Minimum multiplier:", minimumMultiplierBps, "bps (50%)");

  // Deploy SkillProofDecay
  const Factory = await ethers.getContractFactory("SkillProofDecay");
  const decay = await Factory.deploy(registryAddress, decayRatePerDay, minimumMultiplierBps);
  await decay.waitForDeployment();

  const address = await decay.getAddress();
  console.log("SkillProofDecay deployed to:", address);

  // Update deployments.json
  if (!deployments[networkName]) deployments[networkName] = {};
  deployments[networkName].SkillProofDecay = address;
  fs.writeFileSync(deploymentsPath, JSON.stringify(deployments, null, 2) + "\n");
  console.log("Updated lib/deployments.json");

  // Extract ABI
  const artifactPath = path.join(
    __dirname, "..", "artifacts", "contracts",
    "SkillProofDecay.sol", "SkillProofDecay.json"
  );
  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf-8"));
  fs.writeFileSync(
    path.join(libDir, "decay-abi.json"),
    JSON.stringify(artifact.abi, null, 2) + "\n"
  );
  console.log("Saved ABI to lib/decay-abi.json");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
