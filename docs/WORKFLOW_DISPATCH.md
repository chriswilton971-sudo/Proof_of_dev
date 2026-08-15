docs: Added note about the new dispatch workflow

This commit adds a safe workflow (submit-hackathon-dispatch.yml) that
allows maintainers to run the Submit-to-KeeperHub flow via workflow_dispatch
inputs rather than committing SUBMIT_PARAMS.json into the repository.

Usage:
- In GitHub Actions UI select the "Submit to KeeperHub (Dispatch)" workflow
  and provide the tokenId and keeperWallet inputs. The dispatcher will
  call the existing submit-hackathon.yml workflow with those inputs.
