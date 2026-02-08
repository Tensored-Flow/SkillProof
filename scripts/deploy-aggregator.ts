import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying SkillProofAggregator with account:", deployer.address);

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

  // Deploy SkillProofAggregator
  const Factory = await ethers.getContractFactory("SkillProofAggregator");
  const aggregator = await Factory.deploy(registryAddress);
  await aggregator.waitForDeployment();

  const address = await aggregator.getAddress();
  console.log("SkillProofAggregator deployed to:", address);

  // Update deployments.json
  if (!deployments[networkName]) deployments[networkName] = {};
  deployments[networkName].SkillProofAggregator = address;
  fs.writeFileSync(deploymentsPath, JSON.stringify(deployments, null, 2) + "\n");
  console.log("Updated lib/deployments.json");

  // Extract ABI
  const artifactPath = path.join(
    __dirname, "..", "artifacts", "contracts",
    "SkillProofAggregator.sol", "SkillProofAggregator.json"
  );
  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf-8"));
  fs.writeFileSync(
    path.join(libDir, "aggregator-abi.json"),
    JSON.stringify(artifact.abi, null, 2) + "\n"
  );
  console.log("Saved ABI to lib/aggregator-abi.json");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
