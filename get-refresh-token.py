#!/usr/bin/env python3
"""One-time helper: mint a Chrome Web Store REFRESH_TOKEN and write it to .env.

Prerequisites, in Google Cloud Console (console.cloud.google.com):

  1. Create or select a project.
  2. APIs & Services -> Library -> enable "Chrome Web Store API".
  3. APIs & Services -> OAuth consent screen -> External. Add your own
     Google account under "Test users". Publishing status can stay
     "Testing" — this is only ever used by you.
  4. APIs & Services -> Credentials -> Create credentials ->
     OAuth client ID -> Application type: "Desktop app".
  5. Put the client id and secret into .env as CLIENT_ID and CLIENT_SECRET.
  6. Run this script:  python3 get-refresh-token.py

Desktop-app clients may use any loopback port without registering a redirect
URI, so there is nothing else to configure.

The token is written straight into .env. It is never printed in full.
"""

import http.server
import json
import re
import sys
import urllib.parse
import urllib.request
import webbrowser
from pathlib import Path

PORT = 8976
SCOPE = "https://www.googleapis.com/auth/chromewebstore"
ENV_PATH = Path(__file__).resolve().parent / ".env"


def read_env():
    if not ENV_PATH.exists():
        sys.exit("No .env found. Copy .env.example to .env first.")
    values = {}
    for line in ENV_PATH.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        values[key.strip()] = value.strip()
    return values


def write_env_value(key, value):
    lines = ENV_PATH.read_text().splitlines()
    pattern = re.compile(rf"^{re.escape(key)}=")
    replaced = False
    for i, line in enumerate(lines):
        if pattern.match(line.strip()):
            lines[i] = f"{key}={value}"
            replaced = True
            break
    if not replaced:
        lines.append(f"{key}={value}")
    ENV_PATH.write_text("\n".join(lines) + "\n")


def capture_code():
    """Serve one request on the loopback port and return its ?code= value."""
    captured = {}

    class Handler(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            params = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            captured["code"] = params.get("code", [""])[0]
            captured["error"] = params.get("error", [""])[0]
            ok = bool(captured["code"])
            body = (
                b"Authorised. Close this tab and return to the terminal."
                if ok
                else b"Authorisation failed. Check the terminal."
            )
            self.send_response(200)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *args):
            pass

    server = http.server.HTTPServer(("127.0.0.1", PORT), Handler)
    server.handle_request()
    server.server_close()
    return captured.get("code", ""), captured.get("error", "")


def main():
    env = read_env()
    client_id = env.get("CLIENT_ID", "")
    client_secret = env.get("CLIENT_SECRET", "")
    if not client_id or not client_secret:
        sys.exit("Set CLIENT_ID and CLIENT_SECRET in .env first, then rerun.")

    redirect_uri = f"http://localhost:{PORT}"
    auth_url = "https://accounts.google.com/o/oauth2/auth?" + urllib.parse.urlencode(
        {
            "client_id": client_id,
            "redirect_uri": redirect_uri,
            "response_type": "code",
            "scope": SCOPE,
            "access_type": "offline",
            "prompt": "consent",
        }
    )

    print("Opening your browser to grant access.")
    print("Google will warn the app is unverified — that is expected for your")
    print('own Desktop client. Choose "Advanced" then "Go to ... (unsafe)".')
    print()
    print("If the browser does not open, paste this URL into it:")
    print(auth_url)
    print()
    print(f"Waiting for the redirect on {redirect_uri} ...")

    webbrowser.open(auth_url)
    code, error = capture_code()

    if error:
        sys.exit(f"Authorisation denied: {error}")
    if not code:
        sys.exit("No authorisation code received. Rerun and try again.")

    payload = urllib.parse.urlencode(
        {
            "client_id": client_id,
            "client_secret": client_secret,
            "code": code,
            "grant_type": "authorization_code",
            "redirect_uri": redirect_uri,
        }
    ).encode()

    request = urllib.request.Request("https://oauth2.googleapis.com/token", data=payload)
    with urllib.request.urlopen(request) as response:
        data = json.load(response)

    refresh_token = data.get("refresh_token", "")
    if not refresh_token:
        sys.exit(
            "No refresh_token in the response. Revoke the app at\n"
            "https://myaccount.google.com/permissions and rerun — Google only\n"
            "returns one on first consent."
        )

    write_env_value("REFRESH_TOKEN", refresh_token)
    print()
    print(f"REFRESH_TOKEN written to .env ({len(refresh_token)} chars).")
    print("Verify with:  ./publish-webstore.sh --draft")


if __name__ == "__main__":
    main()
