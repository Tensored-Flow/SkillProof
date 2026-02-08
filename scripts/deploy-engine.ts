import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying SkillProofEngine with account:", deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", ethers.formatEther(balance), "C2FLR");

  // Deploy
  const Factory = await ethers.getContractFactory("SkillProofEngine");
  const engine = await Factory.deploy();
  await engine.waitForDeployment();

  const address = await engine.getAddress();
  console.log("SkillProofEngine deployed to:", address);

  // Update deployments.json
  const libDir = path.join(__dirname, "..", "lib");
  const deploymentsPath = path.join(libDir, "deployments.json");
  const deployments = JSON.parse(fs.readFileSync(deploymentsPath, "utf-8"));

  const network = await ethers.provider.getNetwork();
  const networkName = network.chainId === 114n ? "coston2" : "localhost";

  if (!deployments[networkName]) deployments[networkName] = {};
  deployments[networkName].SkillProofEngine = address;
  fs.writeFileSync(deploymentsPath, JSON.stringify(deployments, null, 2) + "\n");
  console.log("Updated lib/deployments.json");

  // Extract ABI
  const artifactPath = path.join(
    __dirname, "..", "artifacts", "contracts",
    "SkillProofEngine.sol", "SkillProofEngine.json"
  );
  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf-8"));
  fs.writeFileSync(
    path.join(libDir, "engine-abi.json"),
    JSON.stringify(artifact.abi, null, 2) + "\n"
  );
  console.log("Saved ABI to lib/engine-abi.json");

  // ── Register 4 players ──
  console.log("\n═══ Registering Players ═══");

  // Player A = deployer (self-register)
  const playerA = deployer.address;
  const playerB = "0xB000000000000000000000000000000000000001";
  const playerC = "0xC000000000000000000000000000000000000001";
  const playerD = "0xD000000000000000000000000000000000000001";

  const names: Record<string, string> = {
    [playerA]: "AlphaTrader",
    [playerB]: "BetaQuant",
    [playerC]: "GammaDeriv",
    [playerD]: "DeltaRisk",
  };

  let tx = await engine.registerPlayer(["market-making", "derivatives"]);
  await tx.wait();
  console.log(`Registered ${names[playerA]} (deployer) — market-making, derivatives`);

  tx = await engine.registerPlayerByAddress(playerB, 1200, ["algo-trading", "risk-mgmt"]);
  await tx.wait();
  console.log(`Registered ${names[playerB]} — algo-trading, risk-mgmt`);

  tx = await engine.registerPlayerByAddress(playerC, 1200, ["derivatives", "portfolio"]);
  await tx.wait();
  console.log(`Registered ${names[playerC]} — derivatives, portfolio`);

  tx = await engine.registerPlayerByAddress(playerD, 1200, ["risk-mgmt", "market-making"]);
  await tx.wait();
  console.log(`Registered ${names[playerD]} — risk-mgmt, market-making`);

  // ── Record 12 matches ──
  console.log("\n═══ Recording Matches ═══");

  const matches: { p1: string; p2: string; outcome: number; domain: string }[] = [
    { p1: playerA, p2: playerB, outcome: 1, domain: "market-making" },  // A beats B
    { p1: playerA, p2: playerC, outcome: 1, domain: "derivatives" },    // A beats C
    { p1: playerD, p2: playerA, outcome: 1, domain: "risk-mgmt" },      // D beats A (upset!)
    { p1: playerB, p2: playerD, outcome: 1, domain: "algo-trading" },   // B beats D
    { p1: playerA, p2: playerB, outcome: 1, domain: "market-making" },  // A beats B again
    { p1: playerC, p2: playerD, outcome: 1, domain: "derivatives" },    // C beats D
    { p1: playerA, p2: playerD, outcome: 1, domain: "market-making" },  // A beats D
    { p1: playerB, p2: playerC, outcome: 1, domain: "algo-trading" },   // B beats C
    { p1: playerA, p2: playerC, outcome: 1, domain: "derivatives" },    // A dominant
    { p1: playerD, p2: playerB, outcome: 1, domain: "risk-mgmt" },      // D beats B
    { p1: playerA, p2: playerD, outcome: 1, domain: "market-making" },  // A top dog
    { p1: playerC, p2: playerB, outcome: 1, domain: "portfolio" },      // C beats B
  ];

  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const winnerName = names[m.p1];
    const loserName = names[m.p2];
    const desc = m.outcome === 1 ? `${winnerName} beats ${loserName}` :
                 m.outcome === 2 ? `${loserName} beats ${winnerName}` : "Draw";

    tx = await engine.recordMatch(m.p1, m.p2, m.outcome, m.domain);
    await tx.wait();
    console.log(`Match ${i + 1}: ${desc} [${m.domain}]`);
  }

  // ── Print final standings ──
  console.log("\n═══ Final ELO Standings ═══");
  console.log("─────────────────────────────────────────────────────────");
  console.log("Player          │ ELO  │ W-L-D │ Win%  │ Peak │ Streak");
  console.log("─────────────────────────────────────────────────────────");

  const allPlayers = [
    { addr: playerA, name: names[playerA] },
    { addr: playerB, name: names[playerB] },
    { addr: playerC, name: names[playerC] },
    { addr: playerD, name: names[playerD] },
  ];

  // Sort by ELO desc
  const standings: { name: string; elo: bigint; wins: bigint; losses: bigint; draws: bigint; peak: bigint; streak: bigint }[] = [];
  for (const p of allPlayers) {
    const data = await engine.getPlayer(p.addr);
    standings.push({
      name: p.name,
      elo: data.elo,
      wins: data.wins,
      losses: data.losses,
      draws: data.draws,
      peak: data.peakElo,
      streak: data.longestStreak,
    });
  }
  standings.sort((a, b) => Number(b.elo - a.elo));

  for (const s of standings) {
    const total = s.wins + s.losses + s.draws;
    const winPct = total > 0n ? ((s.wins * 100n) / total).toString() + "%" : "N/A";
    console.log(
      `${s.name.padEnd(16)}│ ${s.elo.toString().padStart(4)} │ ${s.wins}-${s.losses}-${s.draws}   │ ${winPct.padStart(4)}  │ ${s.peak.toString().padStart(4)} │ ${s.streak}`
    );
  }
  console.log("─────────────────────────────────────────────────────────");

  // ── Match history ──
  console.log("\n═══ Match History ═══");
  const matchCount = await engine.getMatchCount();
  for (let i = 0; i < Number(matchCount); i++) {
    const m = await engine.getMatch(i);
    const p1Name = names[m.player1] || m.player1.slice(0, 10);
    const p2Name = names[m.player2] || m.player2.slice(0, 10);
    const result = m.outcome === 1 ? `${p1Name} won` : m.outcome === 2 ? `${p2Name} won` : "Draw";
    const sign1 = m.player1EloChange >= 0 ? "+" : "";
    const sign2 = m.player2EloChange >= 0 ? "+" : "";
    console.log(
      `#${i + 1} ${p1Name} (${m.player1EloBefore}${sign1}${m.player1EloChange}) vs ` +
      `${p2Name} (${m.player2EloBefore}${sign2}${m.player2EloChange}) — ${result} [${m.domain}]`
    );
  }

  console.log("\n═══ Summary ═══");
  console.log("Total players:", (await engine.getPlayerCount()).toString());
  console.log("Total matches:", (await engine.getMatchCount()).toString());
  console.log("Contract:", address);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
