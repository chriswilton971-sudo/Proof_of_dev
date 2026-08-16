# DoraHacks Submission — KeeperHub Agents Onchain Hackathon

Generated 2026-08-15T08:23:52Z

## Real, verified on-chain evidence

- **Repo:** https://github.com/chriswilton971-sudo/Proof_of_dev
- **Deployed contract (Sepolia):** [`0xfC0899f94d62De84EE17b9196E18Ae75D6Bf944E`](https://sepolia.etherscan.io/address/0xfC0899f94d62De84EE17b9196E18Ae75D6Bf944E)
- **Mint transaction:** [`0xb35770a49bcf83dae2b291a91dfe37c2ca2474e9a4cc677cbb9da1751de76c85`](https://sepolia.etherscan.io/tx/0xb35770a49bcf83dae2b291a91dfe37c2ca2474e9a4cc677cbb9da1751de76c85) — Token ID 1
- **Ownership transferred to KeeperHub's wallet:** [`0x18689acdb77272b6c8eb352e99643ef340bf3b8d9f8fb6cad224d0d0b20eb351`](https://sepolia.etherscan.io/tx/0x18689acdb77272b6c8eb352e99643ef340bf3b8d9f8fb6cad224d0d0b20eb351)
- **`markVerified(1)` executed for real via KeeperHub's Direct Execution API:**
  [`0xd10bb200ead1b80a1746e18891d7d05dc386c10a848e7a67fb3ee1ada55df822`](https://sepolia.etherscan.io/tx/0xd10bb200ead1b80a1746e18891d7d05dc386c10a848e7a67fb3ee1ada55df822)
  - Status: `success`, not reverted
  - Executed by KeeperHub's own wallet (`sponsored: true` — KeeperHub paid gas)
  - Block 11492969, gas used 72,045
  - KeeperHub execution ID: `6f7afe3km76xpyqpy8uii`

## Demo video

_(record separately — show the mint, the ownership transfer, and the markVerified transaction above landing on Sepolia Etherscan)_

## How KeeperHub is used

`services/analysis/keeperhub.js` implements KeeperHub's Direct Execution API against the documented safe first-write sequence (simulate → broadcast with an idempotency key → poll to a terminal status). After a wallet mints a `ProofOfDev` reputation NFT, `markVerified(tokenId)` — a function the contract explicitly documents as built for automation-bot follow-up — is called through KeeperHub's own provisioned wallet rather than any key held by this app.
