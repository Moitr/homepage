// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract HomepageArchive {
    uint256 public constant MAX_HTML_BYTES = 24_576;

    address public immutable owner;
    bytes32 public contentHash;
    bytes32 public payloadHash;
    uint256 public version;
    uint256 public publishedAt;
    uint256 public publishedAtBlock;

    bytes private homepageHTML;

    error EmptyHTML();
    error EmptyHash();
    error HTMLTooLarge(uint256 size, uint256 maximum);
    error NotOwner();
    error UnchangedContent();

    event HomepagePublished(
        bytes32 indexed contentHash,
        bytes32 indexed payloadHash,
        uint256 indexed version,
        uint256 byteLength
    );

    constructor(address initialOwner) {
        if (initialOwner == address(0)) revert NotOwner();
        owner = initialOwner;
    }

    function publish(bytes calldata nextHTML, bytes32 nextContentHash) external {
        if (msg.sender != owner) revert NotOwner();
        if (nextHTML.length == 0) revert EmptyHTML();
        if (nextHTML.length > MAX_HTML_BYTES) {
            revert HTMLTooLarge(nextHTML.length, MAX_HTML_BYTES);
        }
        if (nextContentHash == bytes32(0)) revert EmptyHash();
        if (nextContentHash == contentHash) revert UnchangedContent();

        homepageHTML = nextHTML;
        contentHash = nextContentHash;
        payloadHash = keccak256(nextHTML);
        version += 1;
        publishedAt = block.timestamp;
        publishedAtBlock = block.number;

        emit HomepagePublished(contentHash, payloadHash, version, nextHTML.length);
    }

    function html() external view returns (bytes memory) {
        return homepageHTML;
    }
}
