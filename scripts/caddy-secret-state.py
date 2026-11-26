#!/usr/bin/env python3
"""Server-only TLS-state persistence: RAM -> encrypted Docker secret -> RAM.

No secret value touches a regular file, shell argument, local machine, or log.
The state pointer contains a secret NAME only. Old encrypted versions are kept.
"""
import hashlib
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tarfile

POINTER = Path("/var/lib/openreply/tls-secret-name")
SERVICE = "openreply_caddy"


def docker(*args, data=None):
    result = subprocess.run(["docker", *args], input=data, capture_output=True)
    if result.returncode:
        # Docker diagnostics are intentionally not forwarded: no payload leaks.
        raise RuntimeError("Docker operation failed; inspect service status without secret values")
    return result.stdout


def canonical_archive(raw=None):
    output = io.BytesIO()
    with tarfile.open(fileobj=output, mode="w") as target:
        if raw:
            with tarfile.open(fileobj=io.BytesIO(raw), mode="r:") as source:
                for member in sorted(source.getmembers(), key=lambda item: item.name):
                    if not member.isfile() or "/locks/" in member.name or "last_clean" in member.name:
                        continue
                    name = member.name.removeprefix("./")
                    if name.startswith("/") or ".." in name.split("/"):
                        raise RuntimeError("Invalid TLS archive path")
                    entry = tarfile.TarInfo(name)
                    entry.size, entry.mode = member.size, 0o600
                    target.addfile(entry, source.extractfile(member))
    return output.getvalue()


def main():
    if os.geteuid() != 0 or sys.argv[1:] not in (["init"], ["snapshot"]):
        raise RuntimeError("Run as root on the server with init or snapshot")
    initial = sys.argv[1] == "init"
    if initial and POINTER.exists():
        print("TLS secret store already initialized")
        return
    if initial:
        payload, attached = canonical_archive(), []
    else:
        ids = docker("ps", "-q", "--filter", f"label=com.docker.swarm.service.name={SERVICE}").decode().split()
        if len(ids) != 1:
            raise RuntimeError("Expected exactly one running HTTPS container")
        payload = canonical_archive(docker("exec", ids[0], "tar", "-cf", "-", "-C", "/data", "."))
        # Do not replace a known certificate with an empty/unready store.
        with tarfile.open(fileobj=io.BytesIO(payload)) as archive:
            if not any(item.name.endswith(".crt") for item in archive.getmembers()):
                raise RuntimeError("Certificate not ready; existing secret unchanged")
        attached = json.loads(docker("service", "inspect", SERVICE, "--format", "{{json .Spec.TaskTemplate.ContainerSpec.Secrets}}"))
    name = "openreply_tls_" + hashlib.sha256(payload).hexdigest()[:20]
    existing = docker("secret", "ls", "--format", "{{.Name}}").decode().splitlines()
    if name not in existing:
        docker("secret", "create", name, "-", data=payload)
    current = next((item["SecretName"] for item in attached if item.get("File", {}).get("Name") == "caddy_state"), None)
    if not initial and current != name:
        args = ["service", "update", "--detach", "--secret-add", f"source={name},target=caddy_state,mode=0400"]
        if current:
            args += ["--secret-rm", current]
        docker(*args, SERVICE)
    POINTER.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    pending = POINTER.with_suffix(".tmp")
    pending.write_text(name + "\n")  # A non-secret identifier only.
    pending.chmod(0o600)
    pending.replace(POINTER)
    print("TLS state saved in Docker secret store" if current != name else "TLS secret state unchanged")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(str(error) if isinstance(error, RuntimeError) else "TLS state operation failed", file=sys.stderr)
        sys.exit(1)
