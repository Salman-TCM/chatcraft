"""
Legacy Bengali (Bijoy/SutonnyMJ) font-encoding detection and repair in the
KB text extractor. These fonts remap Bengali glyphs onto ordinary Latin-1
code points, so extracted PDF/DOCX/TXT text comes out as near-valid but
meaningless Windows-1252 text instead of Bengali Unicode.
"""

from app.services.kb.extractor import _fix_legacy_bengali_encoding, _looks_like_bijoy_encoded

# Real sample retrieved from a live agent's knowledge base — legacy
# Bijoy-encoded text for a clause of the Muslim Family Laws Ordinance, 1961.
_BIJOY_SAMPLE = (
    "mvwjkx cwil` MwVZ n‡e|\n"
    " GK Rb †Pqvig¨vb I GB Aa¨v‡`‡k ewY©Z wel‡qi m‡½ hy³ cÿ mg~‡ni cÖ‡Z¨‡Ki GKRb K‡i\n"
    "cÖwZwbwai mgš^‡q mvwjkx cwil` (Arbitration Council) MVb Kiv nq|"
)

_ENGLISH_SAMPLE = (
    "This is a plain English paragraph about arbitration councils and "
    "inheritance law, nothing unusual about it at all, just normal prose."
)

_CORRECT_UNICODE_BENGALI = (
    "এই নথিটি সম্পূর্ণভাবে সঠিক ইউনিকোড বাংলায় লেখা হয়েছে, কোনো সমস্যা নেই।"
)


def test_detects_bijoy_encoded_text():
    assert _looks_like_bijoy_encoded(_BIJOY_SAMPLE) is True


def test_does_not_flag_plain_english():
    assert _looks_like_bijoy_encoded(_ENGLISH_SAMPLE) is False


def test_does_not_flag_correct_unicode_bengali():
    assert _looks_like_bijoy_encoded(_CORRECT_UNICODE_BENGALI) is False


def test_does_not_flag_empty_string():
    assert _looks_like_bijoy_encoded("") is False


def test_converts_bijoy_sample_to_readable_bengali():
    fixed = _fix_legacy_bengali_encoding(_BIJOY_SAMPLE)
    assert fixed != _BIJOY_SAMPLE
    # Actual Bengali Unicode range characters should now dominate the text.
    bengali_chars = sum(1 for c in fixed if "ঀ" <= c <= "৿")
    assert bengali_chars > 20
    # Spot-check a couple of correctly decoded words.
    assert "পরিষদ" in fixed  # "council/board"
    assert "গঠিত" in fixed  # "formed/constituted"


def test_leaves_plain_english_untouched():
    assert _fix_legacy_bengali_encoding(_ENGLISH_SAMPLE) == _ENGLISH_SAMPLE


def test_leaves_correct_unicode_bengali_untouched():
    assert _fix_legacy_bengali_encoding(_CORRECT_UNICODE_BENGALI) == _CORRECT_UNICODE_BENGALI


def test_leaves_empty_string_untouched():
    assert _fix_legacy_bengali_encoding("") == ""
