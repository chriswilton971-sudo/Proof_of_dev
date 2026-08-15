DO NOT COMMIT SECRETS

This repository previously contained a checked-in SUBMIT_PARAMS.json which may contain sensitive data (private keys, wallet addresses, API keys, etc.). Committing secrets to a git repository can cause them to be leaked and requires immediate rotation if they were real.

What I changed
- Replaced SUBMIT_PARAMS.json with a safe template (no secret values).
- Added SUBMIT_PARAMS.example.json as a copy of the template for local editing.

Recommended follow-up actions (if a real secret was ever present)
1) Rotate/revoke any exposed credentials immediately (DEPLOYER_PRIVATE_KEY, KEEPERHUB_API_KEY, ALCHMEY key, etc.). Treat them as compromised.
2) If you need to remove the secret from the repository history, use one of these tools (coordinate with collaborators because these rewrite history):
   - git filter-repo (recommended)
   - BFG Repo-Cleaner
   Example (git filter-repo):
     git clone --mirror git@github.com:OWNER/REPO.git
     git filter-repo --path SUBMIT_PARAMS.json --invert-paths
     git push --force
3) After rotating keys, add the new secrets to GitHub (Settings → Secrets → Actions or to the appropriate Environment):
   - DEPLOYER_PRIVATE_KEY
   - NEXT_PUBLIC_ALCHEMY_API_KEY
   - NEXT_PUBLIC_CONTRACT_ADDRESS
   - KEEPERHUB_API_KEY
   - KEEPERHUB_WEBHOOK_SECRET
4) Do NOT commit any secret material. Use SUBMIT_PARAMS.example.json (or local .env.local) and pass secrets via GitHub Actions secrets or environment variables.

How to run the submit workflow safely
- Use the Actions UI or gh CLI and provide only non-secret inputs via workflow inputs. Put private keys in repository Secrets or the Environment, not in the repo.

If you want, I can:
- Open a PR that removes SUBMIT_PARAMS.json from history (requires history rewrite) — reply: rewrite-history
- Add a .gitleaks.toml allowlist for demo files instead of removing files — reply: allowlist
- Help rotate specific leaked credentials (I will provide exact steps for each provider) — reply: rotate-keys

