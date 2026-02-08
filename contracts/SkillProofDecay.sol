// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

interface ISkillProofRegistryDecay {
    struct SkillCredential {
        string playerName;
        uint256 overallElo;
        uint256 percentile;
        string[] skillDomains;
        uint256[] skillScores;
        uint256[] skillPercentiles;
        uint256 totalMatches;
        uint256 winRate;
        address issuer;
        uint256 issuedAt;
        bool isValid;
    }

    function hasCredential(address player) external view returns (bool);
    function getCredential(address player) external view returns (SkillCredential memory);
}

/// @title SkillProofDecay — Time-Weighted Credential Decay
/// @notice Reads from the deployed SkillProofRegistry and applies temporal decay
///         to ELO and percentile values. Credentials lose value over time if not
///         refreshed, incentivizing issuers to keep them current.
contract SkillProofDecay {
    ISkillProofRegistryDecay public immutable registry;

    address public owner;
    uint256 public decayRatePerDay; // basis points per day (100 = 1%)
    uint256 public minimumMultiplierBps; // floor multiplier in bps (5000 = 50%)
    uint256 public constant BPS = 10000;

    mapping(address => uint256) public lastRefreshed;

    event CredentialRefreshed(address indexed user, uint256 timestamp);
    event DecayParametersUpdated(uint256 decayRate, uint256 minimumMultiplier);

    constructor(address _registry, uint256 _decayRatePerDay, uint256 _minimumMultiplierBps) {
        require(_minimumMultiplierBps <= BPS, "Invalid minimum");
        require(_decayRatePerDay <= 1000, "Decay rate too high");
        registry = ISkillProofRegistryDecay(_registry);
        owner = msg.sender;
        decayRatePerDay = _decayRatePerDay;
        minimumMultiplierBps = _minimumMultiplierBps;
    }

    /// @notice Get the decay multiplier for a user (in basis points, 10000 = 100%).
    function getDecayMultiplier(address user) public view returns (uint256) {
        require(registry.hasCredential(user), "No credential");
        ISkillProofRegistryDecay.SkillCredential memory cred = registry.getCredential(user);
        require(cred.isValid, "Credential revoked");

        uint256 lastUpdate = lastRefreshed[user];
        if (lastUpdate == 0) lastUpdate = cred.issuedAt;

        uint256 elapsed = block.timestamp - lastUpdate;
        uint256 daysElapsed = elapsed / 1 days;

        uint256 decay = daysElapsed * decayRatePerDay;
        if (decay >= BPS - minimumMultiplierBps) {
            return minimumMultiplierBps;
        }
        return BPS - decay;
    }

    /// @notice Get the time-weighted effective ELO after decay.
    function getDecayedElo(address user) external view returns (uint256) {
        ISkillProofRegistryDecay.SkillCredential memory cred = registry.getCredential(user);
        require(registry.hasCredential(user), "No credential");
        require(cred.isValid, "Credential revoked");

        uint256 multiplier = getDecayMultiplier(user);
        return (cred.overallElo * multiplier) / BPS;
    }

    /// @notice Get the time-weighted effective percentile after decay.
    function getDecayedPercentile(address user) external view returns (uint256) {
        ISkillProofRegistryDecay.SkillCredential memory cred = registry.getCredential(user);
        require(registry.hasCredential(user), "No credential");
        require(cred.isValid, "Credential revoked");

        uint256 multiplier = getDecayMultiplier(user);
        return (cred.percentile * multiplier) / BPS;
    }

    /// @notice Get days since last update for a user.
    function getDaysSinceUpdate(address user) external view returns (uint256) {
        require(registry.hasCredential(user), "No credential");
        ISkillProofRegistryDecay.SkillCredential memory cred = registry.getCredential(user);
        require(cred.isValid, "Credential revoked");

        uint256 lastUpdate = lastRefreshed[user];
        if (lastUpdate == 0) lastUpdate = cred.issuedAt;

        return (block.timestamp - lastUpdate) / 1 days;
    }

    /// @notice Refresh a credential (resets decay timer). Only the credential's issuer can refresh.
    function refreshCredential(address user) external {
        require(registry.hasCredential(user), "No credential");
        ISkillProofRegistryDecay.SkillCredential memory cred = registry.getCredential(user);
        require(cred.isValid, "Credential revoked");
        require(msg.sender == cred.issuer, "Only issuer can refresh");

        lastRefreshed[user] = block.timestamp;
        emit CredentialRefreshed(user, block.timestamp);
    }

    /// @notice Update decay parameters (owner only).
    function updateDecayParameters(uint256 _decayRate, uint256 _minimumMultiplier) external {
        require(msg.sender == owner, "Only owner");
        require(_minimumMultiplier <= BPS, "Invalid minimum");
        require(_decayRate <= 1000, "Decay rate too high");

        decayRatePerDay = _decayRate;
        minimumMultiplierBps = _minimumMultiplier;
        emit DecayParametersUpdated(_decayRate, _minimumMultiplier);
    }
}
