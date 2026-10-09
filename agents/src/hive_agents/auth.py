from __future__ import annotations

import hmac


def parse_bearer_token(authorization_header: str | None) -> str | None:
    if not authorization_header:
        return None
    header = authorization_header.strip()
    if not header.lower().startswith("bearer "):
        return None
    token = header[7:].strip()
    return token or None


def tokens_equal(expected: str, provided: str) -> bool:
    a = expected.encode("utf-8")
    b = provided.encode("utf-8")
    return hmac.compare_digest(a, b)


def is_authorized(*, authorization_header: str | None, expected_token: str) -> bool:
    provided = parse_bearer_token(authorization_header)
    if provided is None:
        return False
    return tokens_equal(expected_token, provided)
