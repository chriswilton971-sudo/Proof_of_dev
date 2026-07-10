// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title ProofOfDev
 * @notice Soulbound (non-transferable) ERC-721 token representing a developer's
 *         on-chain reputation score, attested off-chain by a trusted signer
 *         (EIP-712) and minted on-chain by the wallet being scored.
 *
 * Design notes:
 * - Each wallet may hold at most one token at a time (`mint` reverts if the
 *   caller already holds one).
 * - Soulbound: all transfer/approval paths revert. The only ways a token
 *   changes owner are mint (from == address(0)) and burn (to == address(0)).
 * - Scores can be refreshed post-mint via `updateScore`, gated by the same
 *   signer + a per-address nonce, so a dev's reputation can evolve over time
 *   without re-minting or redeploying.
 * - The same per-address nonce also protects `mint`: since a wallet can burn
 *   its token and mint again later, a stale signed attestation must not be
 *   replayable after a burn. Incrementing the nonce on every successful mint
 *   and update closes that gap.
 * - The EIP-712 domain separator is rebuilt automatically if block.chainid
 *   changes after deployment (chain fork protection).
 *
 * Mint authorization: score and stats passed to mint() must be signed by a
 * trusted backend signer using EIP-712. This prevents callers from minting
 * arbitrary/self-reported reputation scores directly on-chain.
 */
contract ProofOfDev {
    // ─── Events ────────────────────────────────────────────────────────────

    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event Minted(address indexed to, uint256 indexed tokenId, uint256 score);
    event ScoreUpdated(address indexed account, uint256 indexed tokenId, uint256 oldScore, uint256 newScore);
    event Burned(address indexed account, uint256 indexed tokenId);
    event SignerUpdated(address indexed oldSigner, address indexed newSigner);
    event BaseURIUpdated(string oldURI, string newURI);
    event OwnershipTransferStarted(address indexed previousOwner, address indexed pendingOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    // ─── Errors ────────────────────────────────────────────────────────────

    error AlreadyMinted();
    error NotMinted();
    error TokenDoesNotExist();
    error AttestationExpired();
    error InvalidSignature();
    error InvalidSignatureS();
    error UnauthorizedAttestation();
    error ZeroAddress();
    error NotOwner();
    error NotPendingOwner();
    error NonTransferable();

    // ─── Storage ─────────────────────────────────────────────────────────────

    string public constant name = "Proof of Dev";
    string public constant symbol = "POD";

    uint256 private _nextTokenId = 1;

    mapping(uint256 => address) private _owners;      // tokenId => owner
    mapping(address => uint256) private _tokens;       // owner => tokenId (0 = none)
    mapping(address => uint256) public nonces;         // owner => next valid attestation nonce

    struct DevMetadata {
        uint256 score;
        uint256 contractCount;
        uint256 verifiedContractCount;
        bool hasENS;
        uint256 mintedAt;
        uint256 updatedAt;
    }

    mapping(uint256 => DevMetadata) private _metadata;

    string private _baseTokenURI;

    address public owner;
    address public pendingOwner;
    address public signer; // address whose signature attests to a wallet's score

    // ─── EIP-712 ─────────────────────────────────────────────────────────────

    bytes32 private constant EIP712_DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");

    bytes32 private constant MINT_TYPEHASH = keccak256(
        "MintAttestation(address to,uint256 score,uint256 contractCount,uint256 verifiedContractCount,bool hasENS,uint256 nonce,uint256 deadline)"
    );

    bytes32 private constant UPDATE_TYPEHASH = keccak256(
        "UpdateAttestation(address to,uint256 score,uint256 contractCount,uint256 verifiedContractCount,bool hasENS,uint256 nonce,uint256 deadline)"
    );

    // secp256k1 curve order / 2 — used to reject malleable (high-s) signatures
    uint256 private constant SECP256K1_HALF_N =
        0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0;

    uint256 private immutable _cachedChainId;
    bytes32 private immutable _cachedDomainSeparator;

    // ─── Constructor ───────────────────────────────────────────────────────

    constructor(string memory baseTokenURI, address initialSigner) {
        if (initialSigner == address(0)) revert ZeroAddress();

        _baseTokenURI = baseTokenURI;
        owner = msg.sender;
        signer = initialSigner;

        _cachedChainId = block.chainid;
        _cachedDomainSeparator = _buildDomainSeparator();

        emit OwnershipTransferred(address(0), msg.sender);
        emit SignerUpdated(address(0), initialSigner);
    }

    // ─── Modifiers ───────────────────────────────────────────────────────────

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    // ─── ERC-721 Core (read-only paths) ───────────────────────────────────────

    function balanceOf(address account) external view returns (uint256) {
        if (account == address(0)) revert ZeroAddress();
        return _tokens[account] != 0 ? 1 : 0;
    }

    function ownerOf(uint256 tokenId) external view returns (address) {
        address tokenOwner = _owners[tokenId];
        if (tokenOwner == address(0)) revert TokenDoesNotExist();
        return tokenOwner;
    }

    function tokenURI(uint256 tokenId) external view returns (string memory) {
        if (_owners[tokenId] == address(0)) revert TokenDoesNotExist();
        return string(abi.encodePacked(_baseTokenURI, "/", _toString(tokenId)));
    }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == 0x80ac58cd // ERC-721
            || interfaceId == 0x5b5e139f // ERC-721Metadata
            || interfaceId == 0x01ffc9a7; // ERC-165
    }

    function getApproved(uint256 tokenId) external view returns (address) {
        if (_owners[tokenId] == address(0)) revert TokenDoesNotExist();
        return address(0);
    }

    function isApprovedForAll(address, address) external pure returns (bool) {
        return false;
    }

    // ─── Soulbound: block all transfer / approval paths ───────────────────────

    function transferFrom(address, address, uint256) external pure {
        revert NonTransferable();
    }

    function safeTransferFrom(address, address, uint256) external pure {
        revert NonTransferable();
    }

    function safeTransferFrom(address, address, uint256, bytes calldata) external pure {
        revert NonTransferable();
    }

    function approve(address, uint256) external pure {
        revert NonTransferable();
    }

    function setApprovalForAll(address, bool) external pure {
        revert NonTransferable();
    }

    // ─── EIP-712 internals ─────────────────────────────────────────────────────

    function _buildDomainSeparator() private view returns (bytes32) {
        return keccak256(
            abi.encode(
                EIP712_DOMAIN_TYPEHASH, keccak256(bytes("ProofOfDev")), keccak256(bytes("1")), block.chainid, address(this)
            )
        );
    }

    /// @dev Rebuilds the domain separator if the chain forked since deployment.
    function _domainSeparator() private view returns (bytes32) {
        if (block.chainid == _cachedChainId) {
            return _cachedDomainSeparator;
        }
        return _buildDomainSeparator();
    }

    function _verifySignature(bytes32 structHash, uint8 v, bytes32 r, bytes32 s) private view returns (address) {
        if (uint256(s) > SECP256K1_HALF_N) revert InvalidSignatureS();

        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", _domainSeparator(), structHash));
        address recovered = ecrecover(digest, v, r, s);
        if (recovered == address(0)) revert InvalidSignature();
        return recovered;
    }

    // ─── Minting ───────────────────────────────────────────────────────────────

    /**
     * @notice Mint a Proof-of-Dev token for the caller, using a signer-attested score.
     * @dev The signer computes score/contractCount/verifiedContractCount/hasENS
     *      off-chain (by analyzing the caller's wallet activity), signs an
     *      EIP-712 typed message committing to those values plus `to`, the
     *      caller's current `nonce`, and a `deadline`, and the caller submits
     *      that signature here. This prevents anyone from minting an arbitrary
     *      self-reported score.
     *
     *      `to` (bound as msg.sender) is included in the signed message so a
     *      signature issued for one address cannot be replayed by a different
     *      caller. The nonce is included (and bumped on success) so a stale
     *      attestation can't be replayed after the caller burns and re-mints.
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
    ) external returns (uint256 tokenId) {
        if (_tokens[msg.sender] != 0) revert AlreadyMinted();
        if (block.timestamp > deadline) revert AttestationExpired();

        uint256 nonce = nonces[msg.sender];

        bytes32 structHash = keccak256(
            abi.encode(MINT_TYPEHASH, msg.sender, score, contractCount, verifiedContractCount, hasENS, nonce, deadline)
        );

        address recovered = _verifySignature(structHash, v, r, s);
        if (recovered != signer) revert UnauthorizedAttestation();

        nonces[msg.sender] = nonce + 1;

        unchecked {
            tokenId = _nextTokenId++;
        }

        _owners[tokenId] = msg.sender;
        _tokens[msg.sender] = tokenId;

        _metadata[tokenId] = DevMetadata({
            score: score,
            contractCount: contractCount,
            verifiedContractCount: verifiedContractCount,
            hasENS: hasENS,
            mintedAt: block.timestamp,
            updatedAt: block.timestamp
        });

        emit Transfer(address(0), msg.sender, tokenId);
        emit Minted(msg.sender, tokenId, score);
    }

    /**
     * @notice Refresh the score/metadata on an already-minted token.
     * @dev Uses the same signer-attestation pattern as mint, with its own
     *      typehash and the shared per-address nonce for replay protection.
     */
    function updateScore(
        uint256 score,
        uint256 contractCount,
        uint256 verifiedContractCount,
        bool hasENS,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external {
        uint256 tokenId = _tokens[msg.sender];
        if (tokenId == 0) revert NotMinted();
        if (block.timestamp > deadline) revert AttestationExpired();

        uint256 nonce = nonces[msg.sender];

        bytes32 structHash = keccak256(
            abi.encode(UPDATE_TYPEHASH, msg.sender, score, contractCount, verifiedContractCount, hasENS, nonce, deadline)
        );

        address recovered = _verifySignature(structHash, v, r, s);
        if (recovered != signer) revert UnauthorizedAttestation();

        nonces[msg.sender] = nonce + 1;

        DevMetadata storage meta = _metadata[tokenId];
        uint256 oldScore = meta.score;

        meta.score = score;
        meta.contractCount = contractCount;
        meta.verifiedContractCount = verifiedContractCount;
        meta.hasENS = hasENS;
        meta.updatedAt = block.timestamp;

        emit ScoreUpdated(msg.sender, tokenId, oldScore, score);
    }

    /// @notice Burn the caller's own token. No one else can burn it for them.
    function burn() external {
        uint256 tokenId = _tokens[msg.sender];
        if (tokenId == 0) revert NotMinted();

        delete _owners[tokenId];
        delete _tokens[msg.sender];
        delete _metadata[tokenId];

        emit Transfer(msg.sender, address(0), tokenId);
        emit Burned(msg.sender, tokenId);
    }

    // ─── Metadata Getters ────────────────────────────────────────────────────

    function getMetadata(uint256 tokenId) external view returns (DevMetadata memory) {
        if (_owners[tokenId] == address(0)) revert TokenDoesNotExist();
        return _metadata[tokenId];
    }

    function getTokenByAddress(address account) external view returns (uint256) {
        return _tokens[account];
    }

    function hasMinted(address account) external view returns (bool) {
        return _tokens[account] != 0;
    }

    function totalSupply() external view returns (uint256) {
        return _nextTokenId - 1;
    }

    // ─── Admin ───────────────────────────────────────────────────────────────

    /// @notice Step 1 of a two-step ownership transfer. Prevents a bad address
    ///         from permanently locking the contract's admin functions.
    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        pendingOwner = newOwner;
        emit OwnershipTransferStarted(owner, newOwner);
    }

    /// @notice Step 2: the new owner must explicitly accept.
    function acceptOwnership() external {
        if (msg.sender != pendingOwner) revert NotPendingOwner();
        emit OwnershipTransferred(owner, msg.sender);
        owner = msg.sender;
        pendingOwner = address(0);
    }

    function setBaseURI(string calldata baseTokenURI) external onlyOwner {
        emit BaseURIUpdated(_baseTokenURI, baseTokenURI);
        _baseTokenURI = baseTokenURI;
    }

    function setSigner(address newSigner) external onlyOwner {
        if (newSigner == address(0)) revert ZeroAddress();
        emit SignerUpdated(signer, newSigner);
        signer = newSigner;
    }

    // ─── Utilities ───────────────────────────────────────────────────────────

    function _toString(uint256 value) private pure returns (string memory) {
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
