// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title SkillProofEngine — Trustless On-Chain ELO Computation
/// @notice Processes match results and computes ELO ratings entirely on-chain
/// @dev Uses fixed-point arithmetic (10000 = 1.0) for ELO calculations
contract SkillProofEngine {
    address public owner;

    uint256 public constant PRECISION = 10000;
    uint256 public constant BPS = 10000;
    uint256 public constant BASE_ELO = 1200;
    uint256 public constant K_NEW = 32;         // K-factor for < 30 games
    uint256 public constant K_ESTABLISHED = 24; // K-factor for 30+ games
    uint256 public constant K_EXPERT = 16;      // K-factor for 2000+ ELO

    struct Player {
        uint256 elo;
        uint256 wins;
        uint256 losses;
        uint256 draws;
        uint256 totalMatches;
        uint256 peakElo;
        uint256 currentStreak; // positive = win streak, 0 = loss/draw reset
        uint256 longestStreak;
        string[] domains;
        bool registered;
    }

    struct MatchResult {
        address player1;
        address player2;
        uint8 outcome; // 1 = player1 wins, 2 = player2 wins, 3 = draw
        uint256 player1EloBefore;
        uint256 player2EloBefore;
        int256 player1EloChange;
        int256 player2EloChange;
        uint256 timestamp;
        string domain;
    }

    mapping(address => Player) private _players;
    address[] public playerList;
    MatchResult[] public matchHistory;

    // Domain-specific ELO tracking
    mapping(address => mapping(string => uint256)) public domainElo;

    // Leaderboard helpers
    uint256 public totalMatches;
    uint256 public totalPlayers;

    // Authorized match reporters (game servers/oracles)
    mapping(address => bool) public authorizedReporters;

    event PlayerRegistered(address indexed player, uint256 initialElo);
    event MatchRecorded(
        uint256 indexed matchId,
        address indexed player1,
        address indexed player2,
        uint8 outcome,
        int256 player1Change,
        int256 player2Change
    );
    event EloUpdated(address indexed player, uint256 oldElo, uint256 newElo);

    constructor() {
        owner = msg.sender;
        authorizedReporters[msg.sender] = true;
    }

    // ━━━ REGISTRATION ━━━

    /// @notice Register a new player with base ELO
    function registerPlayer(string[] calldata domains) external {
        require(!_players[msg.sender].registered, "Already registered");

        Player storage p = _players[msg.sender];
        p.elo = BASE_ELO;
        p.peakElo = BASE_ELO;
        p.registered = true;

        for (uint256 i = 0; i < domains.length; i++) {
            p.domains.push(domains[i]);
            domainElo[msg.sender][domains[i]] = BASE_ELO;
        }

        playerList.push(msg.sender);
        totalPlayers++;

        emit PlayerRegistered(msg.sender, BASE_ELO);
    }

    /// @notice Register a player by address (owner/reporter only — for seeding)
    function registerPlayerByAddress(
        address player,
        uint256 initialElo,
        string[] calldata domains
    ) external {
        require(authorizedReporters[msg.sender], "Not authorized");
        require(!_players[player].registered, "Already registered");

        Player storage p = _players[player];
        p.elo = initialElo;
        p.peakElo = initialElo;
        p.registered = true;

        for (uint256 i = 0; i < domains.length; i++) {
            p.domains.push(domains[i]);
            domainElo[player][domains[i]] = initialElo;
        }

        playerList.push(player);
        totalPlayers++;

        emit PlayerRegistered(player, initialElo);
    }

    // ━━━ MATCH RECORDING ━━━

    /// @notice Record a match result and compute new ELO ratings
    /// @param player1 First player address
    /// @param player2 Second player address
    /// @param outcome 1=player1 wins, 2=player2 wins, 3=draw
    /// @param domain The skill domain this match was in
    function recordMatch(
        address player1,
        address player2,
        uint8 outcome,
        string calldata domain
    ) external {
        require(authorizedReporters[msg.sender], "Not authorized");
        require(_players[player1].registered, "Player 1 not registered");
        require(_players[player2].registered, "Player 2 not registered");
        require(outcome >= 1 && outcome <= 3, "Invalid outcome");
        require(player1 != player2, "Cannot play self");

        uint256 elo1Before = _players[player1].elo;
        uint256 elo2Before = _players[player2].elo;

        // Calculate expected scores (fixed-point)
        uint256 expected1 = _expectedScore(elo1Before, elo2Before);
        uint256 expected2 = PRECISION - expected1;

        // Actual scores (fixed-point)
        uint256 actual1;
        uint256 actual2;
        if (outcome == 1) {
            actual1 = PRECISION;
            actual2 = 0;
        } else if (outcome == 2) {
            actual1 = 0;
            actual2 = PRECISION;
        } else {
            actual1 = PRECISION / 2;
            actual2 = PRECISION / 2;
        }

        // Calculate ELO changes
        uint256 k1 = _kFactor(_players[player1]);
        uint256 k2 = _kFactor(_players[player2]);

        int256 change1 = _eloChange(k1, actual1, expected1);
        int256 change2 = _eloChange(k2, actual2, expected2);

        // Apply changes (floor at 100 ELO to prevent going too low)
        uint256 newElo1 = _applyChange(elo1Before, change1);
        uint256 newElo2 = _applyChange(elo2Before, change2);

        // Update player stats
        _updatePlayerStats(player1, newElo1, outcome == 1, outcome == 3);
        _updatePlayerStats(player2, newElo2, outcome == 2, outcome == 3);

        // Update domain-specific ELO
        if (bytes(domain).length > 0) {
            domainElo[player1][domain] = newElo1;
            domainElo[player2][domain] = newElo2;
        }

        // Record match
        matchHistory.push(MatchResult({
            player1: player1,
            player2: player2,
            outcome: outcome,
            player1EloBefore: elo1Before,
            player2EloBefore: elo2Before,
            player1EloChange: change1,
            player2EloChange: change2,
            timestamp: block.timestamp,
            domain: domain
        }));

        totalMatches++;

        emit MatchRecorded(matchHistory.length - 1, player1, player2, outcome, change1, change2);
        emit EloUpdated(player1, elo1Before, newElo1);
        emit EloUpdated(player2, elo2Before, newElo2);
    }

    // ━━━ ELO MATH (fixed-point) ━━━

    /// @notice Calculate expected score using approximated sigmoid
    /// @dev Real formula: 1 / (1 + 10^((rB - rA) / 400))
    ///      We approximate with a piecewise linear function for gas efficiency
    function _expectedScore(uint256 ratingA, uint256 ratingB) internal pure returns (uint256) {
        int256 diff = int256(ratingA) - int256(ratingB);

        // Clamp to [-400, 400] range for the approximation
        if (diff > 400) diff = 400;
        if (diff < -400) diff = -400;

        // Linear approximation of the sigmoid:
        // At diff = 0: expected = 0.5 (5000)
        // At diff = +400: expected ≈ 0.91 (9000)
        // At diff = -400: expected ≈ 0.09 (1000)
        // Slope: 10 per rating point
        uint256 expected = uint256(int256(5000) + (diff * 10));

        // Clamp to [500, 9500] — nobody has 0% or 100% chance
        if (expected < 500) expected = 500;
        if (expected > 9500) expected = 9500;

        return expected;
    }

    /// @notice Get K-factor based on player experience
    function _kFactor(Player storage player) internal view returns (uint256) {
        if (player.elo >= 2000) return K_EXPERT;
        if (player.totalMatches >= 30) return K_ESTABLISHED;
        return K_NEW;
    }

    /// @notice Calculate ELO change
    function _eloChange(uint256 k, uint256 actual, uint256 expected) internal pure returns (int256) {
        int256 diff = int256(actual) - int256(expected);
        return (int256(k) * diff) / int256(PRECISION);
    }

    /// @notice Apply ELO change with floor at 100
    function _applyChange(uint256 currentElo, int256 change) internal pure returns (uint256) {
        if (change >= 0) {
            return currentElo + uint256(change);
        } else {
            uint256 decrease = uint256(-change);
            if (decrease >= currentElo - 100) {
                return 100; // Floor
            }
            return currentElo - decrease;
        }
    }

    /// @notice Update player statistics after a match
    function _updatePlayerStats(address player, uint256 newElo, bool won, bool drew) internal {
        Player storage p = _players[player];
        p.elo = newElo;
        p.totalMatches++;

        if (won) {
            p.wins++;
            p.currentStreak++;
            if (p.currentStreak > p.longestStreak) {
                p.longestStreak = p.currentStreak;
            }
        } else if (drew) {
            p.draws++;
            p.currentStreak = 0;
        } else {
            p.losses++;
            p.currentStreak = 0;
        }

        if (newElo > p.peakElo) {
            p.peakElo = newElo;
        }
    }

    // ━━━ VIEW FUNCTIONS ━━━

    /// @notice Get full player stats
    function getPlayer(address player) external view returns (
        uint256 elo,
        uint256 wins,
        uint256 losses,
        uint256 draws,
        uint256 matchCount,
        uint256 peakElo,
        uint256 currentStreak,
        uint256 longestStreak,
        bool registered
    ) {
        Player storage p = _players[player];
        return (p.elo, p.wins, p.losses, p.draws, p.totalMatches, p.peakElo, p.currentStreak, p.longestStreak, p.registered);
    }

    /// @notice Get player's win rate (basis points, 10000 = 100%)
    function getWinRate(address player) external view returns (uint256) {
        Player storage p = _players[player];
        if (p.totalMatches == 0) return 0;
        return (p.wins * BPS) / p.totalMatches;
    }

    /// @notice Check if player is registered
    function isRegistered(address player) external view returns (bool) {
        return _players[player].registered;
    }

    /// @notice Get domain-specific ELO
    function getDomainElo(address player, string calldata domain) external view returns (uint256) {
        return domainElo[player][domain];
    }

    /// @notice Get match details
    function getMatch(uint256 matchId) external view returns (MatchResult memory) {
        return matchHistory[matchId];
    }

    /// @notice Get total match count
    function getMatchCount() external view returns (uint256) {
        return matchHistory.length;
    }

    /// @notice Get player count
    function getPlayerCount() external view returns (uint256) {
        return totalPlayers;
    }

    /// @notice Calculate what the ELO changes WOULD be for a hypothetical match
    /// @dev Useful for UI to show potential ELO changes before a match
    function simulateMatch(
        address player1,
        address player2,
        uint8 outcome
    ) external view returns (int256 change1, int256 change2) {
        uint256 expected1 = _expectedScore(_players[player1].elo, _players[player2].elo);
        uint256 expected2 = PRECISION - expected1;

        uint256 actual1;
        uint256 actual2;
        if (outcome == 1) { actual1 = PRECISION; actual2 = 0; }
        else if (outcome == 2) { actual1 = 0; actual2 = PRECISION; }
        else { actual1 = PRECISION / 2; actual2 = PRECISION / 2; }

        change1 = _eloChange(_kFactor(_players[player1]), actual1, expected1);
        change2 = _eloChange(_kFactor(_players[player2]), actual2, expected2);
    }

    // ━━━ ADMIN ━━━

    function addReporter(address reporter) external {
        require(msg.sender == owner, "Only owner");
        authorizedReporters[reporter] = true;
    }

    function removeReporter(address reporter) external {
        require(msg.sender == owner, "Only owner");
        authorizedReporters[reporter] = false;
    }
}
