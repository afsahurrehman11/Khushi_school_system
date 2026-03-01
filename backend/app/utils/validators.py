import re

# Accept both the new format (92XXXXXXXXXX) and legacy formats like +92-XXXXXXXXXX
PHONE_REGEX_NEW = re.compile(r'^92\d{10}$')
PHONE_REGEX_LEGACY = re.compile(r'^\+92-\d{10}$')
PHONE_REGEX_LOCAL = re.compile(r'^0\d{10}$')


def is_valid_pk_phone(phone: str) -> bool:
    """Return True if phone matches one of accepted Pakistan phone formats.

    Accepted examples:
    - 92XXXXXXXXXX (recommended)
    - +92-XXXXXXXXXX (legacy)
    - 03XXXXXXXXX (local mobile starting with 0)
    """
    if not phone:
        return False
    phone = str(phone).strip()
    return bool(
        PHONE_REGEX_NEW.fullmatch(phone)
        or PHONE_REGEX_LEGACY.fullmatch(phone)
        or PHONE_REGEX_LOCAL.fullmatch(phone)
    )


def normalize_phone(phone: str) -> str:
    """Normalize phone string to canonical `92XXXXXXXXXX` when possible.

    - Converts `+92-3001234567` -> `923001234567`
    - Converts `03001234567` -> `923001234567`
    - Leaves already-normalized values unchanged.
    """
    if phone is None:
        return phone
    s = str(phone).strip()
    if PHONE_REGEX_NEW.fullmatch(s):
        return s
    if PHONE_REGEX_LEGACY.fullmatch(s):
        return s.replace('+92-', '92')
    m = PHONE_REGEX_LOCAL.fullmatch(s)
    if m:
        # drop leading 0 and prefix 92
        return '92' + s[1:]
    return s
