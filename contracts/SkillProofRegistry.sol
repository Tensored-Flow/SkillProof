// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

contract SkillProofRegistry {
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

    struct Issuer {
        string name;
        bool isActive;
    }

    mapping(address => SkillCredential) private credentials;
    mapping(address => Issuer) public issuers;
    mapping(address => bool) public hasCredential;
    address public owner;

    event CredentialMinted(address indexed player, address indexed issuer, uint256 overallElo);
    event CredentialUpdated(address indexed player, uint256 overallElo);
    event CredentialRevoked(address indexed player);
    event IssuerRegistered(address indexed issuer, string name);
    event IssuerRevoked(address indexed issuer);

    constructor() {
        owner = msg.sender;
    }

    function registerIssuer(address issuerAddress, string calldata name) external {
        require(msg.sender == owner, "Only owner");
        issuers[issuerAddress] = Issuer(name, true);
        emit IssuerRegistered(issuerAddress, name);
    }

    function revokeIssuer(address issuerAddress) external {
        require(msg.sender == owner, "Only owner");
        issuers[issuerAddress].isActive = false;
        emit IssuerRevoked(issuerAddress);
    }

    function mintCredential(
        address player,
        string calldata playerName,
        uint256 overallElo,
        uint256 percentile,
        string[] calldata skillDomains,
        uint256[] calldata skillScores,
        uint256[] calldata skillPercentiles,
        uint256 totalMatches,
        uint256 winRate
    ) external {
        require(issuers[msg.sender].isActive, "Not active issuer");
        require(skillDomains.length == skillScores.length, "Array length mismatch");
        require(skillDomains.length == skillPercentiles.length, "Array length mismatch");
        require(!hasCredential[player], "Credential already exists");

        SkillCredential storage cred = credentials[player];
        cred.playerName = playerName;
        cred.overallElo = overallElo;
        cred.percentile = percentile;
        cred.totalMatches = totalMatches;
        cred.winRate = winRate;
        cred.issuer = msg.sender;
        cred.issuedAt = block.timestamp;
        cred.isValid = true;

        for (uint256 i = 0; i < skillDomains.length; i++) {
            cred.skillDomains.push(skillDomains[i]);
            cred.skillScores.push(skillScores[i]);
            cred.skillPercentiles.push(skillPercentiles[i]);
        }

        hasCredential[player] = true;
        emit CredentialMinted(player, msg.sender, overallElo);
    }

    function updateCredential(
        address player,
        uint256 overallElo,
        uint256 percentile,
        uint256[] calldata skillScores,
        uint256[] calldata skillPercentiles,
        uint256 totalMatches,
        uint256 winRate
    ) external {
        SkillCredential storage cred = credentials[player];
        require(cred.issuer == msg.sender, "Not original issuer");
        require(hasCredential[player] && cred.isValid, "Invalid credential");

        cred.overallElo = overallElo;
        cred.percentile = percentile;
        cred.totalMatches = totalMatches;
        cred.winRate = winRate;

        for (uint256 i = 0; i < skillScores.length; i++) {
            cred.skillScores[i] = skillScores[i];
            cred.skillPercentiles[i] = skillPercentiles[i];
        }

        emit CredentialUpdated(player, overallElo);
    }

    function revokeCredential(address player) external {
        SkillCredential storage cred = credentials[player];
        require(msg.sender == cred.issuer || msg.sender == owner, "Not authorized");
        cred.isValid = false;
        emit CredentialRevoked(player);
    }

    function getCredential(address player) external view returns (SkillCredential memory) {
        return credentials[player];
    }

    function getIssuer(address issuerAddress) external view returns (string memory name, bool isActive) {
        Issuer memory iss = issuers[issuerAddress];
        return (iss.name, iss.isActive);
    }
}
