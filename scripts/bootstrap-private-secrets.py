#!/usr/bin/env python3
"""Run ONLY on the OpenReply server. Generate directly into Docker secrets.

No values are written to files, arguments, stdout, or logs. Refuses to overwrite
existing secrets. External provider keys must be entered later, privately.
"""
import json
import secrets
import subprocess

def docker(*args, data=None):
    return subprocess.run(["docker", *args], input=data, capture_output=True, check=True)

existing = docker("secret", "ls", "--format", "{{.Name}}").stdout.decode().splitlines()
names = ["openreply_postgres_v1", "openreply_redis_v1", "openreply_app_v1"]
if any(name in existing for name in names):
    raise SystemExit("Bootstrap refused: OpenReply secrets already exist; inspect names only before continuing.")

pg, redis = secrets.token_hex(32), secrets.token_hex(32)
config = {
    "DATABASE_URL": f"postgresql://postgres:{pg}@postgres:5432/openreply",
    "REDIS_URL": f"redis://:{redis}@redis:6379",
    "NEXTAUTH_SECRET": secrets.token_hex(32),
    "ENCRYPTION_KEY": secrets.token_hex(32),
    "CRON_SECRET": secrets.token_hex(32),
    "WEBHOOK_VERIFY_TOKEN": secrets.token_hex(32),
}
for name, value in zip(names, [pg, redis, json.dumps(config)]):
    docker("secret", "create", name, "-", data=value.encode())
    print(f"Created secret: {name} (value not displayed)")
