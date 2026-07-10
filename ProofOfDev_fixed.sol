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
 * Mint authorization: score and stats passed to mint() must be signed by a
 * trusted backend signer using EIP-712. This prevents callers from minting
 * arbitrary/self-reported reputation scores directly on-chain.
 */
contract ProofOfDev {
    // ─── Events ────────────────────────────────────────────────────────────────

    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event Minted(address indexed to, uint256 indexed tokenId, uint256 score);
    event SignerUpdated(address indexed oldSigner, address indexed newSigner);

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

    // Trusted backend address that signs attestations after off-chain analysis
    address public signer;

    // ─── EIP-712 ───────────────────────────────────────────────────────────────

    bytes32 private constant EIP712_DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");

    bytes32 private constant MINT_TYPEHASH = keccak256(
        "MintAttestation(address to,uint256 score,uint256 contractCount,uint256 verifiedContractCount,bool hasENS,uint256 deadline)"
    );

    bytes32 private immutable DOMAIN_SEPARATOR;

    // ─── Constructor ───────────────────────────────────────────────────────────

    constructor(string memory baseTokenURI, address initialSigner) {
        require(initialSigner != address(0), "Zero address");

        _baseTokenURI = baseTokenURI;
        owner = msg.sender;
        signer = initialSigner;

        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                EIP712_DOMAIN_TYPEHASH,
                keccak256(bytes("ProofOfDev")),
                keccak256(bytes("1")),
                block.chainid,
                address(this)
            )
        );
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

    function getApproved(uint256 tokenId) public view returns (address) {
        require(_owners[tokenId] != address(0), "Token does not exist");
        return address(0);
    }

    function isApprovedForAll(address, address) public pure returns (bool) {
        return false;
    }

    // ─── Minting ───────────────────────────────────────────────────────────────

    /**
     * @notice Mint a Proof-of-Dev token for the caller, using a signed attestation
     *         from the trusted backend signer.
     * @dev The signer computes score/contractCount/verifiedContractCount/hasENS
     *      off-chain (by analyzing the caller's wallet activity), signs an
     *      EIP-712 typed message committing to those values plus `to` and a
     *      `deadline`, and the caller submits that signature here. This prevents
     *      anyone from minting an arbitrary self-reported score.
     *
     *      `to` (bound as msg.sender) is included in the signed message so a
     *      signature issued for one address cannot be replayed by a different
     *      caller. Because each address can only ever mint once, a signature
     *      also cannot be replayed twice by the same address — no separate
     *      nonce mapping is required.
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
        require(block.timestamp <= deadline, "Attestation expired");

        bytes32 structHash = keccak256(
            abi.encode(
                MINT_TYPEHASH,
                msg.sender,
                score,
                contractCount,
                verifiedContractCount,
                hasENS,
                deadline
            )
        );

        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, structHash));

        address recovered = ecrecover(digest, v, r, s);
        require(recovered != address(0), "Invalid signature");
        require(recovered == signer, "Unauthorized attestation");

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

    function hasMinted(address account) external view returns (bool) {
        return _tokens[account] != 0;
    }

    function totalSupply() external view returns (uint256) {
        return _nextTokenId - 1;
    }

    // ─── Admin ─────────────────────────────────────────────────────────────────

    function setBaseURI(string memory baseTokenURI) external onlyOwner {
        _baseTokenURI = baseTokenURI;
    }

    function setSigner(address newSigner) external onlyOwner {
        require(newSigner != address(0), "Zero address");
        emit SignerUpdated(signer, newSigner);
        signer = newSigner;
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
