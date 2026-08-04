"""
Rich content parser — extracts <<<RICH>>>...<<<END>>> blocks from AI response text.

AI can embed structured UI components (carousels, cards, quick replies, buttons)
inside normal text by wrapping JSON in these delimiters. The parser splits the
response into alternating text and rich-block segments so the frontend can render
them appropriately.
"""

import json
import re

_RICH_RE = re.compile(r"<<<RICH>>>(.*?)<<<END>>>", re.DOTALL)
_YOUTUBE_RE = re.compile(
    r"(https?://(?:www\.)?(?:youtube\.com/watch\?v=|youtu\.be/)[\w\-]{11}[^\s]*)"
)


def parse_rich_blocks(text: str) -> tuple[str, list[dict]]:
    """
    Extract <<<RICH>>>...<<<END>>> blocks from AI response text.
    Returns (clean_text, [rich_block, ...]) where clean_text has the delimiters removed.
    """
    blocks: list[dict] = []

    def _replace(m: re.Match) -> str:
        raw = m.group(1).strip()
        try:
            blocks.append(json.loads(raw))
        except json.JSONDecodeError:
            blocks.append({"type": "text", "content": raw})
        return ""

    clean = _RICH_RE.sub(_replace, text).strip()
    return clean, blocks


def embed_youtube_links(text: str) -> str:
    """
    Wrap bare YouTube URLs so the frontend knows to render them as embeds.
    Replaces the URL with a <<<RICH>>> embed block inline.
    """

    def _replace(m: re.Match) -> str:
        url = m.group(1)
        block = json.dumps({"type": "youtube", "url": url})
        return f" <<<RICH>>>{block}<<<END>>> "

    return _YOUTUBE_RE.sub(_replace, text)


def process_ai_response(text: str) -> dict:
    """
    Full pipeline: detect YouTube links, parse rich blocks.
    Returns structured response ready for the chat API.
    """
    text = embed_youtube_links(text)
    clean_text, rich_blocks = parse_rich_blocks(text)
    return {
        "text": clean_text,
        "rich_blocks": rich_blocks,
    }


# ─── Rich block schema helpers ───────────────────────────────────────────────


def make_carousel(cards: list[dict]) -> dict:
    """cards: [{title, subtitle, image_url, buttons: [{label, action, value}]}]"""
    return {"type": "carousel", "cards": cards}


def make_quick_replies(text: str, replies: list[str | dict]) -> dict:
    """replies: list of strings or {label, value} dicts (max 13)."""
    items = []
    for r in replies[:13]:
        if isinstance(r, str):
            items.append({"label": r, "value": r})
        else:
            items.append(r)
    return {"type": "quick_replies", "text": text, "replies": items}


def make_buttons(text: str, buttons: list[dict]) -> dict:
    """buttons: [{label, type: url|phone|email|postback|landing_page, value}]"""
    return {"type": "buttons", "text": text, "buttons": buttons}
