// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract ProofOfDev {
    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event Minted(address indexed to, uint256 indexed tokenId, uint256 score);
    event ScoreUpdated(address indexed account, uint256 indexed tokenId, uint256 oldScore, uint256 newScore);
    event Burned(address indexed account, uint256 indexed tokenId);
    event SignerUpdated(address indexed oldSigner, address indexed newSigner);
    event BaseURIUpdated(string oldURI, string newURI);
    event OwnershipTransferStarted(address indexed previousOwner, address indexed pendingOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

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

    string public constant name = "Proof of Dev";
    string public constant symbol = "POD";

    uint256 private _nextTokenId = 1;
    mapping(uint256 => address) private _owners;
    mapping(address => uint256) private _tokens;
    mapping(address => uint256) public nonces;

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
    address public signer;

    bytes32 private constant EIP712_DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");

    bytes32 private constant MINT_TYPEHASH = keccak256(
        "MintAttestation(address to,uint256 score,uint256 contractCount,uint256 verifiedContractCount,bool hasENS,uint256 nonce,uint256 deadline)"
    );

    bytes32 private constant UPDATE_TYPEHASH = keccak256(
        "UpdateAttestation(address to,uint256 score,uint256 contractCount,uint256 verifiedContractCount,bool hasENS,uint256 nonce,uint256 deadline)"
    );

    uint256 private constant SECP256K1_HALF_N =
        0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0;

    uint256 private immutable _cachedChainId;
    bytes32 private immutable _cachedDomainSeparator;

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

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

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
        return interfaceId == 0x80ac58cd || interfaceId == 0x5b5e139f || interfaceId == 0x01ffc9a7;
    }

    function getApproved(uint256 tokenId) external view returns (address) {
        if (_owners[tokenId] == address(0)) revert TokenDoesNotExist();
        return address(0);
    }

    function isApprovedForAll(address, address) external pure returns (bool) {
        return false;
    }

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

    function _buildDomainSeparator() private view returns (bytes32) {
        return keccak256(
            abi.encode(
                EIP712_DOMAIN_TYPEHASH, keccak256(bytes("ProofOfDev")), keccak256(bytes("1")), block.chainid, address(this)
            )
        );
    }

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

    /// @dev Shared attestation-verification logic for mint() and updateScore().
    ///      Factoring this out keeps each external function's local-variable
    ///      count low enough to avoid "stack too deep" under the default
    ///      (non-viaIR) compiler pipeline used by most tooling and block
    ///      explorer verifiers.
    function _authorize(
        bytes32 typehash,
        uint256 score,
        uint256 contractCount,
        uint256 verifiedContractCount,
        bool hasENS,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) private {
        if (block.timestamp > deadline) revert AttestationExpired();

        uint256 nonce = nonces[msg.sender];

        bytes32 structHash = keccak256(
            abi.encode(typehash, msg.sender, score, contractCount, verifiedContractCount, hasENS, nonce, deadline)
        );

        address recovered = _verifySignature(structHash, v, r, s);
        if (recovered != signer) revert UnauthorizedAttestation();

        nonces[msg.sender] = nonce + 1;
    }

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

        _authorize(MINT_TYPEHASH, score, contractCount, verifiedContractCount, hasENS, deadline, v, r, s);

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

        _authorize(UPDATE_TYPEHASH, score, contractCount, verifiedContractCount, hasENS, deadline, v, r, s);

        DevMetadata storage meta = _metadata[tokenId];
        uint256 oldScore = meta.score;

        meta.score = score;
        meta.contractCount = contractCount;
        meta.verifiedContractCount = verifiedContractCount;
        meta.hasENS = hasENS;
        meta.updatedAt = block.timestamp;

        emit ScoreUpdated(msg.sender, tokenId, oldScore, score);
    }

    function burn() external {
        uint256 tokenId = _tokens[msg.sender];
        if (tokenId == 0) revert NotMinted();

        delete _owners[tokenId];
        delete _tokens[msg.sender];
        delete _metadata[tokenId];

        emit Transfer(msg.sender, address(0), tokenId);
        emit Burned(msg.sender, tokenId);
    }

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

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        pendingOwner = newOwner;
        emit OwnershipTransferStarted(owner, newOwner);
    }

    function acceptOwnership() external {
        if (msg.sender != pendingOwner) revert NotPendingOwner();
        emit OwnershipTransferred(owner, msg.sender);
        owner = msg.sender;
        pendingOwner = address(0);
    }

    function setBaseURI(string calldata baseTokenURI) external onlyOwner {
        string memory oldURI = _baseTokenURI;
        _baseTokenURI = baseTokenURI;
        emit BaseURIUpdated(oldURI, baseTokenURI);
    }

    function setSigner(address newSigner) external onlyOwner {
        if (newSigner == address(0)) revert ZeroAddress();
        address oldSigner = signer;
        signer = newSigner;
        emit SignerUpdated(oldSigner, newSigner);
    }

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
