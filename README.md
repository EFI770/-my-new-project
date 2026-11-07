# Chavruta compatibility entry

This deployment-only main branch forwards existing GitHub Pages links to the single real app:
https://chavruta-preview.efie770.workers.dev/

Application source and full acceptance tests remain in dev/frontend-rebuild, public release09d1654. The prior demo survives in Git history, not as a second hosted website. No browser storage is read, copied or cleared. Query strings and hashes are not forwarded.

The existing GitHub Pages workflow is unchanged. This branch contains only handoff HTML, a fallback404, dependency-free handoff tests, and this public deployment note. No app source, credentials or real user data is published here.

## Branch responsibilities

main is deployment-only. dev/frontend-rebuild is the real application source and full regression suite. Do not merge deployment-only main back into the application branch. Future app changes deploy from the application branch; handoff target changes are reviewed independently. Git history and the pre-handoff application checkpoint retain all source and the former demo. Existing browser data is not deleted or migrated.
