// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title ProofOfDev
 * @notice Soulbound (non-transferable) ERC-721 NFT representing a developer's
 *         on-chain reputation score. Each wallet can only mint once.
 *
 * Soulbound mechanism: transfers are blocked except for minting (from == address(0))
 * and burning (to == address(0)).
 *
 * Trust model: `score`, `contractCount`, `verifiedContractCount`, and `hasENS` are
 * NOT taken on faith from the caller. Minting requires an EIP-712 signature from
 * `trustedSigner` (the backend attester) over exactly those values plus the
 * recipient address and a deadline. This closes the trust gap where a caller
 * could otherwise self-report an arbitrary score.
 */
contract ProofOfDev {
    // ─── Events ────────────────────────────────────────────────────────────────

    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event Minted(address indexed to, uint256 indexed tokenId, uint256 score);
    event TrustedSignerUpdated(address indexed previousSigner, address indexed newSigner);

    // ─── Storage ───────────────────────────────────────────────────────────────

    string public name = "Proof of Dev";
    string public symbol = "POD";

    uint256 private _nextTokenId = 1;

    // tokenId → owner
    mapping(uint256 => address) private _owners;

    // owner → tokenId (0 = no token)
    mapping(address => uint256) private _tokens;

    // tokenId → metadata
    struct DevMetadata {
        uint256 score;
        uint256 contractCount;
        uint256 verifiedContractCount;
        bool hasENS;
        uint256 mintedAt;
    }

    mapping(uint256 => DevMetadata) private _metadata;

    // Base URI for token metadata (points to our API)
    string private _baseTokenURI;

    address public owner;

    // ─── EIP-712 ───────────────────────────────────────────────────────────────

    /// @notice Backend attester whose signature authorizes a mint.
    address public trustedSigner;

    bytes32 private constant _DOMAIN_TYPEHASH = keccak256(
        "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
    );

    // keccak256("MintAuthorization(address recipient,uint256 score,uint256 contractCount,uint256 verifiedContractCount,bool hasENS,uint256 deadline)")
    bytes32 private constant _MINT_AUTH_TYPEHASH =
        keccak256(
            "MintAuthorization(address recipient,uint256 score,uint256 contractCount,uint256 verifiedContractCount,bool hasENS,uint256 deadline)"
        );

    /// @dev Domain separator is bound to this contract's address and chain at
    ///      deploy time, so a signature cannot be replayed on another chain or
    ///      against a different deployment.
    bytes32 public immutable DOMAIN_SEPARATOR;

    // ─── Constructor ───────────────────────────────────────────────────────────

    constructor(string memory baseTokenURI, address trustedSigner_) {
        require(trustedSigner_ != address(0), "Zero trustedSigner");
        _baseTokenURI = baseTokenURI;
        owner = msg.sender;
        trustedSigner = trustedSigner_;

        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                _DOMAIN_TYPEHASH,
                keccak256(bytes("ProofOfDev")),
                keccak256(bytes("1")),
                block.chainid,
                address(this)
            )
        );

        emit TrustedSignerUpdated(address(0), trustedSigner_);
    }

    // ─── Modifiers ─────────────────────────────────────────────────────────────

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    // ─── ERC-721 Core ──────────────────────────────────────────────────────────

    function balanceOf(address account) public view returns (uint256) {
        require(account != address(0), "Zero address");
        return _tokens[account] != 0 ? 1 : 0;
    }

    function ownerOf(uint256 tokenId) public view returns (address) {
        address tokenOwner = _owners[tokenId];
        require(tokenOwner != address(0), "Token does not exist");
        return tokenOwner;
    }

    function tokenURI(uint256 tokenId) public view returns (string memory) {
        require(_owners[tokenId] != address(0), "Token does not exist");
        return string(abi.encodePacked(_baseTokenURI, "/", _toString(tokenId)));
    }

    function supportsInterface(bytes4 interfaceId) public pure returns (bool) {
        return
            interfaceId == 0x80ac58cd || // ERC-721
            interfaceId == 0x5b5e139f || // ERC-721Metadata
            interfaceId == 0x01ffc9a7;   // ERC-165
    }

    // ─── Soulbound: block all transfers ────────────────────────────────────────

    function transferFrom(address, address, uint256) public pure {
        revert("Soulbound: non-transferable");
    }

    function safeTransferFrom(address, address, uint256) public pure {
        revert("Soulbound: non-transferable");
    }

    function safeTransferFrom(address, address, uint256, bytes calldata) public pure {
        revert("Soulbound: non-transferable");
    }

    function approve(address, uint256) public pure {
        revert("Soulbound: non-transferable");
    }

    function setApprovalForAll(address, bool) public pure {
        revert("Soulbound: non-transferable");
    }

    // ─── Minting ───────────────────────────────────────────────────────────────

    /**
     * @notice Mint a Proof-of-Dev token for the caller.
     * @dev Each address can only mint once. The score and metadata are NOT
     *      trusted from the caller: they must be accompanied by a valid
     *      EIP-712 signature from `trustedSigner` over the exact same values,
     *      bound to `msg.sender`, and not past `deadline`. This is what
     *      prevents a caller from self-reporting an arbitrary score.
     */
    function mint(
        uint256 score,
        uint256 contractCount,
        uint256 verifiedContractCount,
        bool hasENS,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external returns (uint256) {
        require(_tokens[msg.sender] == 0, "Already minted");
        require(block.timestamp <= deadline, "Authorization expired");

        bytes32 structHash = keccak256(
            abi.encode(
                _MINT_AUTH_TYPEHASH,
                msg.sender,
                score,
                contractCount,
                verifiedContractCount,
                hasENS,
                deadline
            )
        );
        bytes32 digest = keccak256(
            abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, structHash)
        );

        address signer = ecrecover(digest, v, r, s);
        require(signer != address(0), "Invalid signature");
        require(signer == trustedSigner, "Unauthorized: bad signature");

        uint256 tokenId = _nextTokenId++;

        _owners[tokenId] = msg.sender;
        _tokens[msg.sender] = tokenId;

        _metadata[tokenId] = DevMetadata({
            score: score,
            contractCount: contractCount,
            verifiedContractCount: verifiedContractCount,
            hasENS: hasENS,
            mintedAt: block.timestamp
        });

        emit Transfer(address(0), msg.sender, tokenId);
        emit Minted(msg.sender, tokenId, score);

        return tokenId;
    }

    // ─── Metadata Getters ──────────────────────────────────────────────────────

    function getMetadata(uint256 tokenId)
        external
        view
        returns (DevMetadata memory)
    {
        require(_owners[tokenId] != address(0), "Token does not exist");
        return _metadata[tokenId];
    }

    function getTokenByAddress(address account) external view returns (uint256) {
        return _tokens[account];
    }

    function totalSupply() external view returns (uint256) {
        return _nextTokenId - 1;
    }

    // ─── Admin ─────────────────────────────────────────────────────────────────

    function setBaseURI(string memory baseTokenURI) external onlyOwner {
        _baseTokenURI = baseTokenURI;
    }

    /**
     * @notice Rotate the trusted attester key that authorizes mints.
     * @dev Does not invalidate DOMAIN_SEPARATOR — outstanding signatures from
     *      the previous signer simply stop being accepted going forward.
     */
    function setTrustedSigner(address newSigner) external onlyOwner {
        require(newSigner != address(0), "Zero trustedSigner");
        emit TrustedSignerUpdated(trustedSigner, newSigner);
        trustedSigner = newSigner;
    }

    // ─── Utilities ─────────────────────────────────────────────────────────────

    function _toString(uint256 value) internal pure returns (string memory) {
        if (value == 0) return "0";
        uint256 temp = value;
        uint256 digits;
        while (temp != 0) {
            digits++;
            temp /= 10;
        }
        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits -= 1;
            buffer[digits] = bytes1(uint8(48 + uint256(value % 10)));
            value /= 10;
        }
        return string(buffer);
    }
}
