#!/usr/bin/env python3
"""Interactive server operator only: hidden input -> encrypted Docker secret.

Never run in a recorded agent terminal. No key values are accepted as arguments,
written to ordinary files, or logged. This installs credentials but does not
enable login emails, Meta connections or outbound delivery.
"""
import argparse
import getpass
import json
import os
from pathlib import Path
import re
import secrets
import subprocess
import sys
import warnings

SERVICES = ("openreply_web", "openreply_worker", "openreply_cron")
POINTER = Path("/var/lib/openreply/app-secret-name")


def docker(*args, data=None):
    result = subprocess.run(["docker", *args], input=data, capture_output=True)
    if result.returncode:
        raise RuntimeError("Docker operation failed; secret values were not printed")
    return result.stdout


def validate(provider, value):
    if provider == "resend":
        return bool(re.fullmatch(r"re_[A-Za-z0-9_-]{16,}", value))
    return bool(re.fullmatch(r"[a-fA-F0-9]{32}", value))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("provider", choices=("resend", "meta", "instagram"))
    parser.add_argument("--config-id", help="Non-secret Meta login configuration ID")
    parser.add_argument("--app-id", help="Non-secret Instagram app ID")
    args = parser.parse_args()
    if os.geteuid() != 0 or not sys.stdin.isatty() or not Path("/opt/openreply-review").is_dir():
        raise RuntimeError("Use an interactive root terminal on the OpenReply server")
    if args.provider == "meta" and not re.fullmatch(r"[0-9]+", args.config_id or ""):
        raise RuntimeError("Meta requires its non-secret --config-id")
    if args.provider == "instagram" and args.app_id != "1124733303512268":
        raise RuntimeError("Instagram requires the approved WavGrind Instagram app ID")

    ids = docker("ps", "-q", "--filter", "label=com.docker.swarm.service.name=openreply_web").decode().split()
    if len(ids) != 1:
        raise RuntimeError("Expected exactly one running web container")
    refs = {}
    for service in SERVICES:
        attached = json.loads(docker("service", "inspect", service, "--format", "{{json .Spec.TaskTemplate.ContainerSpec.Secrets}}"))
        refs[service] = next(item["SecretName"] for item in attached if item.get("File", {}).get("Name") == "openreply_app")
    if len(set(refs.values())) != 1:
        raise RuntimeError("App services use different secret versions; reconcile before installing a key")
    task = docker("inspect", ids[0], "--format", '{{index .Config.Labels "com.docker.swarm.task.id"}}').decode().strip()
    running = json.loads(docker("inspect", "--type", "task", task, "--format", "{{json .Spec.ContainerSpec.Secrets}}"))
    running_ref = next(item["SecretName"] for item in running if item.get("File", {}).get("Name") == "openreply_app")
    if running_ref != refs["openreply_web"]:
        raise RuntimeError("Previous rotation is still starting; wait for healthy services before adding another key")
    # Captured only in this server process; never forwarded to stdout/stderr.
    config = json.loads(docker("exec", ids[0], "cat", "/run/secrets/openreply_app"))
    if not isinstance(config, dict) or not all(isinstance(k, str) and isinstance(v, str) for k, v in config.items()):
        raise RuntimeError("Invalid existing app secret")

    warnings.simplefilter("error", getpass.GetPassWarning)
    value = getpass.getpass("Paste provider key (hidden): ").strip()
    if not validate(args.provider, value):
        raise RuntimeError("Key format does not match the selected provider")
    if value != getpass.getpass("Paste it again to confirm (hidden): ").strip():
        raise RuntimeError("Entries did not match; nothing changed")
    key_name = {"resend": "RESEND_API_KEY", "meta": "FACEBOOK_APP_SECRET", "instagram": "INSTAGRAM_APP_SECRET"}[args.provider]
    config[key_name] = value
    if args.provider == "meta":
        config["META_APP_ID"] = "1900442214463518"
        config["META_LOGIN_CONFIG_ID"] = args.config_id
    if args.provider == "instagram":
        config["INSTAGRAM_APP_ID"] = args.app_id
    name = "openreply_app_" + secrets.token_hex(8)
    docker("secret", "create", name, "-", data=json.dumps(config).encode())
    # Store only the non-secret version name before service updates, so an
    # interrupted rollout can be completed by redeploying the stack.
    POINTER.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    pending = POINTER.with_suffix(".tmp")
    pending.write_text(name + "\n")
    pending.chmod(0o600)
    pending.replace(POINTER)
    for service, old in refs.items():
        docker("service", "update", "--detach", "--secret-rm", old,
               "--secret-add", f"source={name},target=openreply_app,mode=0400", service)
    print("Provider credential saved in the server secret store. Sending gates unchanged.")


if __name__ == "__main__":
    try:
        main()
    except (Exception, KeyboardInterrupt) as error:
        print(str(error) if isinstance(error, RuntimeError) else "Credential installation stopped; no secret values displayed", file=sys.stderr)
        sys.exit(1)
