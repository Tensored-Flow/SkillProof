// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

interface ISkillProofRegistryAgg {
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

/// @title SkillProofAggregator — Multi-Issuer Credential Composer
/// @notice Aggregates credentials across multiple issuers into a composite skill
///         score. Users link multiple credential addresses to one primary identity,
///         then query a unified view: weighted ELO, domain coverage, cross-domain bonus.
contract SkillProofAggregator {
    ISkillProofRegistryAgg public immutable registry;
    address public owner;

    // Identity linking: primary → all credential addresses (including primary itself)
    mapping(address => address[]) public linkedAddresses;
    mapping(address => address) public primaryOf; // reverse lookup: linked → primary

    struct AggregateScore {
        uint256 compositeElo;        // weighted average ELO
        uint256 compositePercentile; // weighted average percentile
        uint256 totalMatches;        // sum of all matches
        uint256 issuerCount;         // number of valid credentials
        uint256 domainCount;         // total domains across all credentials
        uint256 crossDomainBonus;    // bonus for breadth (50 per extra issuer)
        uint256 overallScore;        // compositeElo + crossDomainBonus
    }

    event AddressLinked(address indexed primary, address indexed linked);
    event AddressUnlinked(address indexed primary, address indexed unlinked);

    constructor(address _registry) {
        registry = ISkillProofRegistryAgg(_registry);
        owner = msg.sender;
    }

    /// @notice Link a credential address to a primary identity.
    /// @dev Owner or the linked address itself can call. The primary is auto-added
    ///      on the first link call if not already present.
    function linkAddress(address primary, address linked) external {
        require(msg.sender == owner || msg.sender == linked, "Unauthorized");
        require(primaryOf[linked] == address(0), "Already linked");
        require(linked != address(0), "Zero address");

        // Auto-add primary as first entry if this is the first link
        if (linkedAddresses[primary].length == 0) {
            linkedAddresses[primary].push(primary);
            primaryOf[primary] = primary;
        }

        // Don't double-add if linked == primary (already added above)
        if (linked != primary) {
            linkedAddresses[primary].push(linked);
            primaryOf[linked] = primary;
        }

        emit AddressLinked(primary, linked);
    }

    /// @notice Unlink a credential address from a primary identity (owner only).
    function unlinkAddress(address primary, address linked) external {
        require(msg.sender == owner, "Only owner");
        require(linked != primary, "Cannot unlink primary");
        require(primaryOf[linked] == primary, "Not linked to this primary");

        // Remove from array
        address[] storage addrs = linkedAddresses[primary];
        for (uint256 i = 0; i < addrs.length; i++) {
            if (addrs[i] == linked) {
                addrs[i] = addrs[addrs.length - 1];
                addrs.pop();
                break;
            }
        }
        delete primaryOf[linked];

        emit AddressUnlinked(primary, linked);
    }

    /// @notice Get all credential addresses for a primary identity.
    function getLinkedAddresses(address primary) external view returns (address[] memory) {
        return linkedAddresses[primary];
    }

    /// @notice Get number of linked addresses for a primary identity.
    function getLinkedCount(address primary) external view returns (uint256) {
        return linkedAddresses[primary].length;
    }

    /// @notice Compute aggregate score across all linked credentials.
    function getAggregateScore(address primary) external view returns (AggregateScore memory) {
        address[] memory addrs = linkedAddresses[primary];

        // If no linked addresses, try the primary address directly
        if (addrs.length == 0) {
            if (!registry.hasCredential(primary)) {
                return AggregateScore(0, 0, 0, 0, 0, 0, 0);
            }
            ISkillProofRegistryAgg.SkillCredential memory cred = registry.getCredential(primary);
            if (!cred.isValid) {
                return AggregateScore(0, 0, 0, 0, 0, 0, 0);
            }
            return AggregateScore(
                cred.overallElo,
                cred.percentile,
                cred.totalMatches,
                1,
                cred.skillDomains.length,
                0,
                cred.overallElo
            );
        }

        // Aggregate across all linked addresses
        uint256 totalElo = 0;
        uint256 totalPercentile = 0;
        uint256 totalMatches = 0;
        uint256 issuerCount = 0;
        uint256 domainCount = 0;

        for (uint256 i = 0; i < addrs.length; i++) {
            if (!registry.hasCredential(addrs[i])) continue;
            ISkillProofRegistryAgg.SkillCredential memory cred = registry.getCredential(addrs[i]);
            if (!cred.isValid) continue;

            totalElo += cred.overallElo;
            totalPercentile += cred.percentile;
            totalMatches += cred.totalMatches;
            domainCount += cred.skillDomains.length;
            issuerCount++;
        }

        if (issuerCount == 0) {
            return AggregateScore(0, 0, 0, 0, 0, 0, 0);
        }

        uint256 compositeElo = totalElo / issuerCount;
        uint256 compositePercentile = totalPercentile / issuerCount;

        // Cross-domain bonus: 50 ELO per additional issuer beyond the first
        uint256 crossDomainBonus = (issuerCount - 1) * 50;

        return AggregateScore(
            compositeElo,
            compositePercentile,
            totalMatches,
            issuerCount,
            domainCount,
            crossDomainBonus,
            compositeElo + crossDomainBonus
        );
    }
}
