// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {TestFtsoV2Interface} from
    "@flarenetwork/flare-periphery-contracts/coston2/TestFtsoV2Interface.sol";
import {ContractRegistry} from
    "@flarenetwork/flare-periphery-contracts/coston2/ContractRegistry.sol";

interface ISkillProofRegistry {
    function hasCredential(address player) external view returns (bool);
}

contract SkillProofAttestor {
    struct Attestation {
        uint256 attestedAt;
        uint256 flareTimestamp;
        int256 anchorPrice;
        string pricePair;
        bool isAttested;
    }

    // FLR/USD feed id: category 01 (crypto) + "FLR/USD" hex-encoded, zero-padded to 21 bytes
    bytes21 public constant FLR_USD_FEED_ID =
        0x01464c522f55534400000000000000000000000000;

    ISkillProofRegistry public immutable registry;
    address public owner;

    mapping(address => Attestation) private attestations;

    event CredentialAttested(
        address indexed player,
        uint256 flareTimestamp,
        int256 anchorPrice,
        string pricePair
    );

    constructor(address _registry) {
        registry = ISkillProofRegistry(_registry);
        owner = msg.sender;
    }

    /// @notice Attest a player's credential by anchoring it to a live Flare FTSO price feed.
    ///         Reads the current FLR/USD price from FTSOv2 and stores it as a verifiable
    ///         on-chain timestamp proof that this credential existed at a known oracle state.
    function attestCredential(address player) external {
        require(registry.hasCredential(player), "No credential found");
        require(!attestations[player].isAttested, "Already attested");

        // Resolve FtsoV2 via Flare's on-chain contract registry
        TestFtsoV2Interface ftsoV2 = ContractRegistry.getTestFtsoV2();

        // Read the live FLR/USD price feed
        (uint256 feedValue, int8 decimals, uint64 timestamp) =
            ftsoV2.getFeedById(FLR_USD_FEED_ID);

        // Convert to a signed price with full precision
        int256 price = int256(feedValue);
        if (decimals < 0) {
            price = price * int256(10 ** uint256(uint8(-decimals)));
        }

        attestations[player] = Attestation({
            attestedAt: block.timestamp,
            flareTimestamp: uint256(timestamp),
            anchorPrice: price,
            pricePair: "FLR/USD",
            isAttested: true
        });

        emit CredentialAttested(player, uint256(timestamp), price, "FLR/USD");
    }

    /// @notice Returns the attestation for a player.
    function getAttestation(address player) external view returns (Attestation memory) {
        return attestations[player];
    }
}
