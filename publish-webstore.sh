#!/bin/zsh
# Publish Contact Point to the Chrome Web Store via the REST API.
#
# One-time setup (do this once in Google Cloud Console, then never again):
#   1. Create a Google Cloud project and enable the "Chrome Web Store API".
#   2. Configure an OAuth consent screen (External, add yourself as a test user).
#   3. Create an OAuth client (type: Desktop app) -> get CLIENT_ID + CLIENT_SECRET.
#   4. Generate a REFRESH_TOKEN for that client with scope
#      https://www.googleapis.com/auth/chromewebstore  (one-time browser consent).
#   5. Grab the extension's ITEM_ID from the Web Store dashboard URL.
#   Put all four into a .env file next to this script (see .env.example).
#
# Usage:
#   ./publish-webstore.sh            # build, upload a new version, and publish it live
#   ./publish-webstore.sh --draft    # build + upload only (stages a draft, does NOT go live)
#
# Note: after a real publish, Google reviews the submission before it reaches
# users (hours to a few days). Upload != live.

set -euo pipefail
ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT_DIR"

DRAFT_ONLY=0
[[ "${1:-}" == "--draft" ]] && DRAFT_ONLY=1

# --- load credentials -------------------------------------------------------
if [[ -f "$ROOT_DIR/.env" ]]; then
  set -a; source "$ROOT_DIR/.env"; set +a
fi
: "${CLIENT_ID:?Set CLIENT_ID (see .env.example)}"
: "${CLIENT_SECRET:?Set CLIENT_SECRET}"
: "${REFRESH_TOKEN:?Set REFRESH_TOKEN}"
: "${ITEM_ID:?Set ITEM_ID}"

API="https://www.googleapis.com"
VERSION="$(python3 -c 'import json;print(json.load(open("manifest.json"))["version"])')"
ZIP="$ROOT_DIR/contact-pointshareable.zip"

# --- build the package ------------------------------------------------------
echo "Building shareable package for version $VERSION..."
./build-shareable.sh >/dev/null
rm -f "$ZIP"
( cd shareable && zip -qr "$ZIP" . -x '*.DS_Store' )
echo "Packaged: $ZIP"

# --- confirm before anything that touches the live listing ------------------
if [[ "$DRAFT_ONLY" -eq 0 ]]; then
  printf "About to UPLOAD and PUBLISH version %s to the public listing. Continue? [y/N] " "$VERSION"
  read -r reply
  [[ "$reply" == "y" || "$reply" == "Y" ]] || { echo "Aborted."; exit 1; }
fi

# --- exchange refresh token for an access token -----------------------------
echo "Authenticating..."
ACCESS_TOKEN="$(curl -sf "https://oauth2.googleapis.com/token" \
  -d "client_id=$CLIENT_ID" \
  -d "client_secret=$CLIENT_SECRET" \
  -d "refresh_token=$REFRESH_TOKEN" \
  -d "grant_type=refresh_token" \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["access_token"])')"

# --- upload the new package -------------------------------------------------
echo "Uploading package..."
UPLOAD_RESP="$(curl -sf \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "x-goog-api-version: 2" \
  -X PUT -T "$ZIP" \
  "$API/upload/chromewebstore/v1.1/items/$ITEM_ID")"
echo "$UPLOAD_RESP"
UPLOAD_STATE="$(echo "$UPLOAD_RESP" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("uploadState",""))')"
if [[ "$UPLOAD_STATE" != "SUCCESS" ]]; then
  echo "Upload did not succeed (state=$UPLOAD_STATE). See response above." >&2
  exit 1
fi

if [[ "$DRAFT_ONLY" -eq 1 ]]; then
  echo "Draft uploaded for version $VERSION. Not published (--draft). Publish from the dashboard or rerun without --draft."
  exit 0
fi

# --- publish to the public listing ------------------------------------------
echo "Publishing..."
PUBLISH_RESP="$(curl -sf \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "x-goog-api-version: 2" \
  -H "Content-Length: 0" \
  -X POST \
  "$API/chromewebstore/v1.1/items/$ITEM_ID/publish")"
echo "$PUBLISH_RESP"
echo "Submitted version $VERSION. Google will review before it reaches users."
