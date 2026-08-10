// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract ArticleArchive {
    uint256 public constant MAX_ARTICLE_BYTES = 24_576;

    struct Publication {
        bytes payload;
        bytes32 contentHash;
        bytes32 payloadHash;
        uint256 version;
        uint256 publishedAt;
        uint256 publishedAtBlock;
    }

    address public immutable owner;
    mapping(bytes32 => Publication) private publications;

    error EmptyContentHash();
    error EmptyPayload();
    error EmptySlugHash();
    error NotOwner();
    error PayloadTooLarge(uint256 size, uint256 maximum);
    error UnchangedContent();

    event ArticlePublished(
        bytes32 indexed slugHash,
        bytes32 indexed contentHash,
        bytes32 indexed payloadHash,
        uint256 version,
        uint256 byteLength
    );

    constructor(address initialOwner) {
        if (initialOwner == address(0)) revert NotOwner();
        owner = initialOwner;
    }

    function publish(bytes32 slugHash, bytes calldata payload, bytes32 contentHash) external {
        if (msg.sender != owner) revert NotOwner();
        if (slugHash == bytes32(0)) revert EmptySlugHash();
        if (payload.length == 0) revert EmptyPayload();
        if (payload.length > MAX_ARTICLE_BYTES) {
            revert PayloadTooLarge(payload.length, MAX_ARTICLE_BYTES);
        }
        if (contentHash == bytes32(0)) revert EmptyContentHash();

        Publication storage publication = publications[slugHash];
        if (publication.contentHash == contentHash) revert UnchangedContent();

        publication.payload = payload;
        publication.contentHash = contentHash;
        publication.payloadHash = keccak256(payload);
        publication.version += 1;
        publication.publishedAt = block.timestamp;
        publication.publishedAtBlock = block.number;

        emit ArticlePublished(
            slugHash,
            contentHash,
            publication.payloadHash,
            publication.version,
            payload.length
        );
    }

    function article(bytes32 slugHash) external view returns (bytes memory) {
        return publications[slugHash].payload;
    }

    function publication(bytes32 slugHash) external view returns (
        bytes32 contentHash,
        bytes32 payloadHash,
        uint256 version,
        uint256 publishedAt,
        uint256 publishedAtBlock,
        uint256 byteLength
    ) {
        Publication storage item = publications[slugHash];
        return (
            item.contentHash,
            item.payloadHash,
            item.version,
            item.publishedAt,
            item.publishedAtBlock,
            item.payload.length
        );
    }
}
