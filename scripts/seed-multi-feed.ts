import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const libDir = path.join(__dirname, "..", "lib");
  const deploymentsPath = path.join(libDir, "deployments.json");
  const deployments = JSON.parse(fs.readFileSync(deploymentsPath, "utf-8"));

  const network = await ethers.provider.getNetwork();
  const networkName = network.chainId === 114n ? "coston2" : "localhost";

  const hubAddress = deployments[networkName]?.SkillProofHub;
  if (!hubAddress) {
    throw new Error(`No SkillProofHub found for "${networkName}". Run deploy-hub.ts first.`);
  }

  const hubAbi = JSON.parse(fs.readFileSync(path.join(libDir, "hub-abi.json"), "utf-8"));
  const [deployer] = await ethers.getSigners();
  console.log("Adding multi-feed markets with account:", deployer.address);
  console.log("Hub address:", hubAddress);

  const hub = new ethers.Contract(hubAddress, hubAbi, deployer);

  const block = await ethers.provider.getBlock("latest");
  const now = block!.timestamp;

  // BTC/USD market
  const btcFeedId = "0x014254432f55534400000000000000000000000000";
  const tx1 = await hub.createMarket(
    "Will BTC exceed $100,000 USD?",
    btcFeedId,
    10000000000, // $100,000 at 5-decimal scale
    now + 86400,
    now + 172800
  );
  console.log("createMarket tx:", tx1.hash);
  await tx1.wait();
  console.log("✅ Created prediction market: Will BTC exceed $100,000... (BTC/USD feed)");

  // ETH/USD market
  const ethFeedId = "0x014554482f55534400000000000000000000000000";
  const tx2 = await hub.createMarket(
    "Will ETH exceed $4,000 USD?",
    ethFeedId,
    400000000, // $4,000 at 5-decimal scale
    now + 86400,
    now + 172800
  );
  console.log("createMarket tx:", tx2.hash);
  await tx2.wait();
  console.log("✅ Created prediction market: Will ETH exceed $4,000... (ETH/USD feed)");

  const count = await hub.marketCount();
  console.log("\nTotal markets:", count.toString());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
