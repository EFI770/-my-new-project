# Prepared compatibility entry, NOT published

Only this directory's index.html is the proposed GitHub Pages publication
artifact after public readiness. Do not upload the repository root or a directory
containing credentials/research logs. It sends old bookmarks/home-screen entries
to the one canonical real app. No cross-origin frontend API or Google callback
adaptation is needed because the real UI stays on its existing origin.

The fixed target is the current verified app host. If a shorter canonical host
is selected, change all three fixed destination occurrences together, verify
its auth configuration and test again before publishing. No query/hash is passed
from the old local demo to the new app, so old storage/session IDs cannot become
real-user identity inputs. localStorage is never read, copied or cleared.

Activation requires operator/public contact and deletion-policy readiness first.
Then change the GitHub Pages artifact path to this directory in an explicitly
reviewed publication commit, with the old app retained only in Git history.
Verify root and existing query-link redirect, fallback link, no redirect loop,
new Google acceptance, and physical old iPhone icon. GitHub CDN/device caches may
lag; inspect actual response/cache state before suggesting user cleanup. Never
clear user storage as an automatic fix.
