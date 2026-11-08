"""Create deploy/home/.env with strong random secrets. Never overwrites an existing file (that would lock you out of your data)."""
import base64
import os
import secrets
import sys

path = sys.argv[1] if len(sys.argv) > 1 else ".env"
if os.path.exists(path):
    print(f"{path} already exists - keeping it (delete it only if you also want to wipe the database and files).")
    sys.exit(0)
fernet = base64.urlsafe_b64encode(os.urandom(32)).decode()
lines = [
    "# Secrets for the home server. Keep this file private; never share or commit it. Back it up somewhere safe.",
    f"POSTGRES_PASSWORD={secrets.token_hex(24)}",
    f"S3_ACCESS_KEY_ID=yb{secrets.token_hex(8)}",
    f"S3_SECRET_ACCESS_KEY={secrets.token_hex(24)}",
    f"TOKEN_ENCRYPTION_KEY={fernet}",
    "",
    "# Optional free keys: remove the # and paste the key after = , then: docker compose up -d",
    "# PEXELS_API_KEY=",
    "# PIXABAY_API_KEY=",
    "# YOUTUBE_API_KEY=",
    "# GOOGLE_OAUTH_CLIENT_ID=",
    "# GOOGLE_OAUTH_CLIENT_SECRET=",
]
with open(path, "w", newline="\n") as f:
    f.write("\n".join(lines) + "\n")
print(f"Created {path} with new random passwords.")
