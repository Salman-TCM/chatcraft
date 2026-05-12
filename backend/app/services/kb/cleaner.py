"""
Text cleaning and normalisation applied to all extracted content
before chunking. Goal: remove noise without destroying meaning.
"""
import re
import unicodedata


def clean(text: str) -> str:
    # Normalise unicode (NFC) and replace non-breaking spaces
    text = unicodedata.normalize("NFC", text)
    text = text.replace(" ", " ").replace("​", "")

    # Strip null bytes and other control characters (except newlines/tabs)
    text = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", "", text)

    # Collapse runs of more than 2 consecutive blank lines
    text = re.sub(r"\n{3,}", "\n\n", text)

    # Collapse runs of whitespace within a line (preserve newlines)
    lines = [re.sub(r"[ \t]+", " ", line).strip() for line in text.splitlines()]
    text = "\n".join(lines)

    # Drop lines that are pure punctuation/noise (e.g. page separators)
    text = "\n".join(
        line for line in text.splitlines()
        if len(re.sub(r"[^a-zA-Z0-9]", "", line)) >= 2 or not line.strip()
    )

    return text.strip()
