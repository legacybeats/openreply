#!/usr/bin/env python3
"""Server-only Meta app webhook setup, with credentials kept in server memory.

Default is read-only. --apply registers only the approved Instagram callback,
refusing to replace another consumer or expand into other webhook objects.
"""
import argparse
import json
import os
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request

APP_ID = "1900442214463518"
INSTAGRAM_APP_ID = "1124733303512268"
CALLBACK = "https://2-29-58-59.sslip.io/api/webhook"
# Button taps are a separate webhook field from ordinary messages. Do not
# subscribe read receipts: the approved flow requires an explicit button tap.
FIELDS = {"comments", "messages", "messaging_postbacks"}


def docker(*args):
    result = subprocess.run(["docker", *args], capture_output=True)
    if result.returncode:
        raise RuntimeError("Docker lookup failed; no secret values displayed")
    return result.stdout


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--login-mode", choices=("unified", "instagram"), default="unified")
    args = parser.parse_args()
    if os.geteuid() != 0:
        raise RuntimeError("Run only as root on the OpenReply server")
    ids = docker("ps", "-q", "--filter", "label=com.docker.swarm.service.name=openreply_web").decode().split()
    if len(ids) != 1:
        raise RuntimeError("Wait for exactly one running web container")
    config = json.loads(docker("exec", ids[0], "cat", "/run/secrets/openreply_app"))
    app_id = INSTAGRAM_APP_ID if args.login_mode == "instagram" else APP_ID
    id_key = "INSTAGRAM_APP_ID" if args.login_mode == "instagram" else "META_APP_ID"
    secret_key = "INSTAGRAM_APP_SECRET" if args.login_mode == "instagram" else "FACEBOOK_APP_SECRET"
    if config.get(id_key) != app_id or not config.get(secret_key) or not config.get("WEBHOOK_VERIFY_TOKEN"):
        raise RuntimeError("Required Meta server credentials are not installed")
    endpoint = f"https://graph.facebook.com/v27.0/{app_id}/subscriptions"
    opener = urllib.request.build_opener(NoRedirect())

    def request(data=None):
        req = urllib.request.Request(endpoint, data=urllib.parse.urlencode(data).encode() if data else None,
            headers={"Authorization": "Bearer " + app_id + "|" + config[secret_key]})
        try:
            with opener.open(req, timeout=30) as response:
                return json.load(response)
        except urllib.error.HTTPError as error:
            # Do not print URLs, request headers, provider messages or bodies.
            raise RuntimeError(f"Meta subscription request failed with HTTP {error.code}") from None

    def current():
        data = request()
        if "error" in data or "data" not in data:
            raise RuntimeError("Meta subscription read failed")
        subscriptions = data["data"]
        return next((item for item in subscriptions if item.get("object") == "instagram"), None)

    before = current()
    names = {field["name"] for field in before.get("fields", [])} if before else set()
    matches = bool(before and before.get("callback_url") == CALLBACK)
    print("Instagram callback exists:", bool(before))
    print("Callback matches OpenReply:", matches)
    print("Only approved fields configured:", bool(before and names == FIELDS))
    print("Configured Instagram fields:", ",".join(sorted(names)))
    if not args.apply:
        return
    if before and (not matches or not names.issubset(FIELDS)):
        raise RuntimeError("Existing Instagram consumer differs; left unchanged")
    if not before or names != FIELDS:
        result = request({"object": "instagram", "callback_url": CALLBACK,
                          "verify_token": config["WEBHOOK_VERIFY_TOKEN"], "fields": ",".join(sorted(FIELDS))})
        if result.get("success") is not True:
            raise RuntimeError("Meta did not confirm registration")
    after = current()
    if not after or after.get("callback_url") != CALLBACK or {f["name"] for f in after.get("fields", [])} != FIELDS:
        raise RuntimeError("Webhook readback did not match the requested configuration")
    print("Verified OpenReply Instagram callback with comments, messages and messaging_postbacks. No account grants or DMs sent.")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(str(error) if isinstance(error, RuntimeError) else "Webhook setup failed; no secret values displayed", file=sys.stderr)
        sys.exit(1)
