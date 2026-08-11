// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract FriendLinksArchive {
    uint256 public constant MAX_PAYLOAD_BYTES = 24_576;

    address public immutable owner;
    bytes32 public contentHash;
    bytes32 public payloadHash;
    uint256 public version;
    uint256 public publishedAt;
    uint256 public publishedAtBlock;

    bytes private friendLinksJSON;

    error EmptyContentHash();
    error EmptyPayload();
    error NotOwner();
    error PayloadTooLarge(uint256 size, uint256 maximum);
    error UnchangedContent();

    event FriendLinksPublished(
        bytes32 indexed contentHash,
        bytes32 indexed payloadHash,
        uint256 indexed version,
        uint256 byteLength
    );

    constructor(address initialOwner) {
        if (initialOwner == address(0)) revert NotOwner();
        owner = initialOwner;
    }

    function publish(bytes calldata nextPayload, bytes32 nextContentHash) external {
        if (msg.sender != owner) revert NotOwner();
        if (nextPayload.length == 0) revert EmptyPayload();
        if (nextPayload.length > MAX_PAYLOAD_BYTES) {
            revert PayloadTooLarge(nextPayload.length, MAX_PAYLOAD_BYTES);
        }
        if (nextContentHash == bytes32(0)) revert EmptyContentHash();
        if (nextContentHash == contentHash) revert UnchangedContent();

        friendLinksJSON = nextPayload;
        contentHash = nextContentHash;
        payloadHash = keccak256(nextPayload);
        version += 1;
        publishedAt = block.timestamp;
        publishedAtBlock = block.number;

        emit FriendLinksPublished(contentHash, payloadHash, version, nextPayload.length);
    }

    function data() external view returns (bytes memory) {
        return friendLinksJSON;
    }
}
