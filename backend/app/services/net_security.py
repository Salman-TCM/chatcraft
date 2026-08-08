"""
SSRF-safety helpers shared between the schema layer (validate at save time) and
the runtime (block at fire time). Kept in one place so both agree on the rules.
"""

from __future__ import annotations

import ipaddress
from urllib.parse import urlparse

_PRIVATE_NETS = [
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("169.254.0.0/16"),  # link-local / cloud metadata
    ipaddress.ip_network("::1/128"),
    ipaddress.ip_network("fc00::/7"),
]

# Bare hostnames without a dot are treated as unresolvable / internal
# (Docker compose service names, `localhost`, cloud metadata aliases).
_BLOCKED_HOSTNAMES = {"localhost", "metadata.google.internal", "metadata.internal"}


_METADATA_IP = ipaddress.ip_address("169.254.169.254")


def is_valid_self_hosted_url(url: str) -> bool:
    """Looser check for a user's own self-hosted model endpoint.

    Unlike `is_ssrf_safe`, this allows localhost/private/LAN addresses —
    that's the whole point of "self-hosted" (Ollama, vLLM, LM Studio typically
    run on 127.0.0.1 or a LAN IP). It still blocks the cloud metadata IP,
    since there's no legitimate self-hosted-model reason to target it.
    """
    try:
        parsed = urlparse(url)
        if parsed.scheme not in ("http", "https"):
            return False
        host = (parsed.hostname or "").lower().rstrip(".")
        if not host:
            return False
        if host in ("metadata.google.internal", "metadata.internal"):
            return False
        try:
            if ipaddress.ip_address(host) == _METADATA_IP:
                return False
        except ValueError:
            pass  # not an IP literal — fine
        return True
    except Exception:
        return False


def is_ssrf_safe(url: str) -> bool:
    """Return True only if the URL does not target a private/internal address."""
    try:
        parsed = urlparse(url)
        if parsed.scheme not in ("http", "https"):
            return False
        host = (parsed.hostname or "").lower().rstrip(".")
        if not host:
            return False
        if host in _BLOCKED_HOSTNAMES:
            return False
        if host.endswith(".local") or host.endswith(".internal") or host.endswith(".localhost"):
            return False
        # Bare hostnames without a dot (e.g. "backend", "redis", "postgres")
        # are Docker service names — refuse them at save time so we don't
        # accidentally point at internal infrastructure.
        if "." not in host:
            try:
                ipaddress.ip_address(host)
            except ValueError:
                return False
        try:
            ip = ipaddress.ip_address(host)
            return not any(ip in net for net in _PRIVATE_NETS)
        except ValueError:
            pass  # not an IP literal — dotted hostname is OK
        return True
    except Exception:
        return False
