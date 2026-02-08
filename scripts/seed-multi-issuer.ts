import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  // Load deployment address
  const libDir = path.join(__dirname, "..", "lib");
  const deploymentsPath = path.join(libDir, "deployments.json");
  const deployments = JSON.parse(fs.readFileSync(deploymentsPath, "utf-8"));

  const network = await ethers.provider.getNetwork();
  const networkName = network.chainId === 114n ? "coston2" : "localhost";
  const registryAddress = deployments[networkName]?.SkillProofRegistry;
  if (!registryAddress) {
    throw new Error(`No SkillProofRegistry found for "${networkName}". Run deploy.ts first.`);
  }

  const abi = JSON.parse(fs.readFileSync(path.join(libDir, "abi.json"), "utf-8"));
  const [deployer] = await ethers.getSigners();
  console.log("Multi-issuer seed with deployer:", deployer.address);
  console.log("Registry:", registryAddress);
  console.log("Network:", networkName);

  const registry = new ethers.Contract(registryAddress, abi, deployer);

  // ══════════════════════════════════════════════════════════════════════
  // Determine ChessArena issuer + player addresses
  // ══════════════════════════════════════════════════════════════════════

  let chessIssuerSigner;
  let mariaAddress: string;
  let rajAddress: string;

  const signers = await ethers.getSigners();

  if (signers.length >= 6) {
    // Localhost: use available Hardhat signers
    // signers[0] = deployer, [1] = Leon Wang, [2] = Alex Chen (from seed.ts)
    // [3] = ChessArena issuer, [4] = Maria, [5] = Raj
    chessIssuerSigner = signers[3];
    mariaAddress = signers[4].address;
    rajAddress = signers[5].address;
  } else {
    // Coston2: derive from mnemonic + fund the issuer
    const mnemonic = "test test test test test test test test test test test junk";

    // ChessArena issuer at path /10 (avoiding collision with seed.ts paths /1, /2)
    const chessIssuerWallet = ethers.HDNodeWallet.fromMnemonic(
      ethers.Mnemonic.fromPhrase(mnemonic),
      "m/44'/60'/0'/0/10"
    ).connect(ethers.provider);
    chessIssuerSigner = chessIssuerWallet;

    // Player addresses at paths /4 and /5
    const mariaWallet = ethers.HDNodeWallet.fromMnemonic(
      ethers.Mnemonic.fromPhrase(mnemonic),
      "m/44'/60'/0'/0/4"
    );
    const rajWallet = ethers.HDNodeWallet.fromMnemonic(
      ethers.Mnemonic.fromPhrase(mnemonic),
      "m/44'/60'/0'/0/5"
    );
    mariaAddress = mariaWallet.address;
    rajAddress = rajWallet.address;

    // Fund the ChessArena issuer for gas
    console.log("\n── Funding ChessArena issuer ──");
    const fundTx = await deployer.sendTransaction({
      to: chessIssuerSigner.address,
      value: ethers.parseEther("0.5"),
    });
    await fundTx.wait();
    console.log(`Sent 0.5 C2FLR to ${chessIssuerSigner.address} (tx: ${fundTx.hash})`);
  }

  console.log("\nChessArena issuer:", chessIssuerSigner.address);
  console.log("Maria Rodriguez: ", mariaAddress);
  console.log("Raj Patel:       ", rajAddress);

  // ══════════════════════════════════════════════════════════════════════
  // Step 1: Register ChessArena issuer (owner-only)
  // ══════════════════════════════════════════════════════════════════════

  console.log("\n── Step 1: Register issuer ChessArena ──");
  const tx1 = await registry.connect(deployer).registerIssuer(
    chessIssuerSigner.address,
    "ChessArena"
  );
  console.log("registerIssuer tx:", tx1.hash);
  await tx1.wait();
  console.log("✅ Registered issuer: ChessArena");

  // Connect registry to the ChessArena issuer for minting
  const registryAsChess = registry.connect(chessIssuerSigner);

  // ══════════════════════════════════════════════════════════════════════
  // Step 2: Mint credential — Maria Rodriguez (ELO 2105, 99th percentile)
  // ══════════════════════════════════════════════════════════════════════

  console.log("\n── Step 2: Mint credential for Maria Rodriguez ──");
  const tx2 = await registryAsChess.mintCredential(
    mariaAddress,
    "Maria Rodriguez",
    2105,
    99,
    ["opening-theory", "endgame", "tactics", "positional-play"],
    [2200, 2050, 2150, 1980],
    [99, 97, 99, 95],
    312,
    74
  );
  console.log("mintCredential tx:", tx2.hash);
  await tx2.wait();
  console.log("✅ Minted credential: Maria Rodriguez (ELO 2105, 99th percentile) — ChessArena");

  // ══════════════════════════════════════════════════════════════════════
  // Step 3: Mint credential — Raj Patel (ELO 1456, 58th percentile)
  // ══════════════════════════════════════════════════════════════════════

  console.log("\n── Step 3: Mint credential for Raj Patel ──");
  const tx3 = await registryAsChess.mintCredential(
    rajAddress,
    "Raj Patel",
    1456,
    58,
    ["opening-theory", "tactics", "blitz"],
    [1500, 1480, 1390],
    [62, 60, 48],
    87,
    51
  );
  console.log("mintCredential tx:", tx3.hash);
  await tx3.wait();
  console.log("✅ Minted credential: Raj Patel (ELO 1456, 58th percentile) — ChessArena");

  // ══════════════════════════════════════════════════════════════════════
  // Verify: Read back credentials
  // ══════════════════════════════════════════════════════════════════════

  console.log("\n── Verification ──");
  const mariaCred = await registry.getCredential(mariaAddress);
  const rajCred = await registry.getCredential(rajAddress);
  const chessIssuer = await registry.getIssuer(chessIssuerSigner.address);

  console.log(`ChessArena issuer: name="${chessIssuer.name}", active=${chessIssuer.isActive}`);
  console.log(`Maria: ELO=${mariaCred.overallElo}, percentile=${mariaCred.percentile}, issuer=${mariaCred.issuer}`);
  console.log(`Raj:   ELO=${rajCred.overallElo}, percentile=${rajCred.percentile}, issuer=${rajCred.issuer}`);

  // ── Summary ──
  console.log("\n══════════════════════════════════════");
  console.log("  MULTI-ISSUER SEEDING COMPLETE");
  console.log("══════════════════════════════════════");
  console.log("Issuer:  ChessArena @", chessIssuerSigner.address);
  console.log("Player3: Maria Rodriguez @", mariaAddress);
  console.log("Player4: Raj Patel @", rajAddress);
  console.log("══════════════════════════════════════");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
