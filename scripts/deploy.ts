import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying SkillProofRegistry with account:", deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", ethers.formatEther(balance), "ETH");

  const Factory = await ethers.getContractFactory("SkillProofRegistry");
  const registry = await Factory.deploy();
  await registry.waitForDeployment();

  const address = await registry.getAddress();
  console.log("SkillProofRegistry deployed to:", address);

  // Determine network name
  const network = await ethers.provider.getNetwork();
  const networkName = network.chainId === 114n ? "coston2" : "localhost";

  // Write deployments.json
  const libDir = path.join(__dirname, "..", "lib");
  if (!fs.existsSync(libDir)) {
    fs.mkdirSync(libDir, { recursive: true });
  }

  const deploymentsPath = path.join(libDir, "deployments.json");
  let deployments: Record<string, Record<string, string>> = {};
  if (fs.existsSync(deploymentsPath)) {
    deployments = JSON.parse(fs.readFileSync(deploymentsPath, "utf-8"));
  }
  deployments[networkName] = { SkillProofRegistry: address };
  fs.writeFileSync(deploymentsPath, JSON.stringify(deployments, null, 2) + "\n");
  console.log(`Saved deployment address to lib/deployments.json (network: ${networkName})`);

  // Extract ABI from compiled artifact and save to lib/abi.json
  const artifactPath = path.join(
    __dirname,
    "..",
    "artifacts",
    "contracts",
    "SkillProofRegistry.sol",
    "SkillProofRegistry.json"
  );
  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf-8"));
  fs.writeFileSync(
    path.join(libDir, "abi.json"),
    JSON.stringify(artifact.abi, null, 2) + "\n"
  );
  console.log("Saved ABI to lib/abi.json");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
