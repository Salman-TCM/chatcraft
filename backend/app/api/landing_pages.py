"""
Landing Pages API.

Routes:
  GET    /api/v1/landing-pages
  POST   /api/v1/landing-pages
  GET    /api/v1/landing-pages/{id}
  PATCH  /api/v1/landing-pages/{id}
  DELETE /api/v1/landing-pages/{id}
  POST   /api/v1/landing-pages/{id}/publish
  GET    /api/v1/landing-pages/{id}/qr        ← returns PNG QR code
  POST   /api/v1/landing-pages/{id}/ai        ← AI content generation
  GET    /p/{slug}                             ← public render (no auth)
"""
import io
import re
import secrets
import uuid
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, Request, status
from fastapi.responses import HTMLResponse, Response
from sqlalchemy import func, select

from app.core.dependencies import CurrentUser, DBSession
from app.models.form import LandingPage

router = APIRouter(tags=["landing-pages"])


def _page_dict(p: LandingPage, include_content: bool = True) -> dict:
    d: dict = {
        "id": str(p.id),
        "title": p.title,
        "name": p.name,
        "slug": p.slug,
        "short_id": p.short_id,
        "description": p.description,
        "theme": p.theme,
        "primary_color": p.primary_color,
        "is_published": p.is_published,
        "chatbot_id": str(p.chatbot_id) if p.chatbot_id else None,
        "seo_meta": p.seo_meta or {},
        "scan_count": p.scan_count,
        "created_at": p.created_at.isoformat(),
        "updated_at": p.updated_at.isoformat(),
    }
    if include_content:
        d["html_content"] = p.html_content
    return d


def _slugify(text: str) -> str:
    s = text.lower().strip()
    s = re.sub(r"[^\w\s-]", "", s)
    s = re.sub(r"[\s_-]+", "-", s)
    return s[:100]


async def _get_owned(page_id: uuid.UUID, user_id: uuid.UUID, db) -> LandingPage:
    page = await db.get(LandingPage, page_id)
    if not page or page.user_id != user_id:
        raise HTTPException(status_code=404, detail="Landing page not found")
    return page


# ── Authenticated CRUD ─────────────────────────────────────────────────────────

@router.get("/api/v1/landing-pages", response_model=dict)
async def list_pages(
    user: CurrentUser, db: DBSession,
    page: Annotated[int, Query(ge=1)] = 1,
    limit: Annotated[int, Query(ge=1, le=100)] = 30,
) -> dict:
    offset = (page - 1) * limit
    result = await db.execute(
        select(LandingPage).where(LandingPage.user_id == user.id)
        .order_by(LandingPage.created_at.desc()).offset(offset).limit(limit)
    )
    pages = result.scalars().all()
    total = (await db.execute(
        select(func.count()).select_from(LandingPage).where(LandingPage.user_id == user.id)
    )).scalar_one()
    return {
        "success": True,
        "data": [_page_dict(p, include_content=False) for p in pages],
        "total": total,
    }


@router.post("/api/v1/landing-pages", response_model=dict, status_code=status.HTTP_201_CREATED)
async def create_page(body: dict, user: CurrentUser, db: DBSession) -> dict:
    name = (body.get("name") or body.get("title") or "").strip()
    if not name:
        raise HTTPException(status_code=422, detail="name required")

    base_slug = _slugify(name)
    # Ensure unique slug for this user
    slug = base_slug
    counter = 1
    while True:
        exists = await db.execute(
            select(LandingPage).where(LandingPage.user_id == user.id, LandingPage.slug == slug)
        )
        if not exists.scalar_one_or_none():
            break
        slug = f"{base_slug}-{counter}"
        counter += 1

    page = LandingPage(
        user_id=user.id,
        chatbot_id=body.get("chatbot_id"),
        title=body.get("title", name),
        name=name,
        slug=slug,
        short_id=secrets.token_urlsafe(8)[:10],
        description=body.get("description"),
        html_content=body.get("html_content", _default_html(name)),
        theme=body.get("theme", "light"),
        primary_color=body.get("primary_color", "#6366f1"),
        seo_meta=body.get("seo_meta", {}),
    )
    db.add(page)
    await db.commit()
    await db.refresh(page)
    return {"success": True, "data": _page_dict(page)}


@router.get("/api/v1/landing-pages/{page_id}", response_model=dict)
async def get_page(page_id: uuid.UUID, user: CurrentUser, db: DBSession) -> dict:
    page = await _get_owned(page_id, user.id, db)
    return {"success": True, "data": _page_dict(page)}


@router.patch("/api/v1/landing-pages/{page_id}", response_model=dict)
async def update_page(page_id: uuid.UUID, body: dict, user: CurrentUser, db: DBSession) -> dict:
    page = await _get_owned(page_id, user.id, db)
    for field in ("title", "name", "description", "html_content", "theme", "primary_color", "seo_meta", "chatbot_id"):
        if field in body:
            setattr(page, field, body[field])
    await db.commit()
    await db.refresh(page)
    return {"success": True, "data": _page_dict(page)}


@router.delete("/api/v1/landing-pages/{page_id}", response_model=dict)
async def delete_page(page_id: uuid.UUID, user: CurrentUser, db: DBSession) -> dict:
    page = await _get_owned(page_id, user.id, db)
    await db.delete(page)
    await db.commit()
    return {"success": True, "data": None}


@router.post("/api/v1/landing-pages/{page_id}/publish", response_model=dict)
async def toggle_publish(page_id: uuid.UUID, user: CurrentUser, db: DBSession) -> dict:
    page = await _get_owned(page_id, user.id, db)
    page.is_published = not page.is_published
    await db.commit()
    return {"success": True, "data": {"is_published": page.is_published, "slug": page.slug}}


@router.get("/api/v1/landing-pages/{page_id}/attribution", response_model=dict)
async def get_attribution(page_id: uuid.UUID, user: CurrentUser, db: DBSession) -> dict:
    from app.models.attribution import AttributionEvent
    page = await _get_owned(page_id, user.id, db)

    result = await db.execute(
        select(AttributionEvent)
        .where(AttributionEvent.landing_page_id == page.id)
        .order_by(AttributionEvent.occurred_at.desc())
        .limit(200)
    )
    events = result.scalars().all()

    # Aggregate by source
    sources: dict[str, int] = {}
    mediums: dict[str, int] = {}
    campaigns: dict[str, int] = {}
    refs: dict[str, int] = {}

    for ev in events:
        src = ev.utm_source or "direct"
        sources[src] = sources.get(src, 0) + 1
        if ev.utm_medium:
            mediums[ev.utm_medium] = mediums.get(ev.utm_medium, 0) + 1
        if ev.utm_campaign:
            campaigns[ev.utm_campaign] = campaigns.get(ev.utm_campaign, 0) + 1
        if ev.ref:
            refs[ev.ref] = refs.get(ev.ref, 0) + 1

    def top(d: dict, n: int = 10) -> list[dict]:
        return [{"key": k, "count": v} for k, v in sorted(d.items(), key=lambda x: -x[1])[:n]]

    return {
        "success": True,
        "data": {
            "total_visits": len(events),
            "scan_count": page.scan_count or 0,
            "top_sources": top(sources),
            "top_mediums": top(mediums),
            "top_campaigns": top(campaigns),
            "top_refs": top(refs),
        },
    }


# ── QR code ───────────────────────────────────────────────────────────────────

@router.get("/api/v1/landing-pages/{page_id}/qr")
async def get_qr(
    page_id: uuid.UUID,
    user: CurrentUser,
    db: DBSession,
    request: Request,
    fmt: str = Query(default="png", pattern="^(png|svg)$"),
    size: int = Query(default=300, ge=100, le=1000),
    fill_color: str = Query(default="black", alias="fill"),
    back_color: str = Query(default="white", alias="back"),
) -> Response:
    page = await _get_owned(page_id, user.id, db)
    base = str(request.base_url).rstrip("/")
    url = f"{base}/p/{page.slug}"

    try:
        import qrcode
        import qrcode.image.svg
        from qrcode.constants import ERROR_CORRECT_L

        if fmt == "svg":
            factory = qrcode.image.svg.SvgImage
            qr = qrcode.make(url, image_factory=factory, error_correction=ERROR_CORRECT_L)
            buf = io.BytesIO()
            qr.save(buf)
            return Response(buf.getvalue(), media_type="image/svg+xml")
        else:
            qr = qrcode.QRCode(error_correction=ERROR_CORRECT_L, box_size=10, border=4)
            qr.add_data(url)
            qr.make(fit=True)
            img = qr.make_image(fill_color=fill_color, back_color=back_color)
            img = img.resize((size, size))
            buf = io.BytesIO()
            img.save(buf, format="PNG")
            return Response(buf.getvalue(), media_type="image/png")
    except ImportError:
        raise HTTPException(status_code=500, detail="qrcode library not installed")


# ── AI content generation ──────────────────────────────────────────────────────

@router.post("/api/v1/landing-pages/{page_id}/ai", response_model=dict)
async def ai_generate(
    page_id: uuid.UUID,
    body: dict,
    user: CurrentUser,
    db: DBSession,
) -> dict:
    page = await _get_owned(page_id, user.id, db)
    prompt = (body.get("prompt") or "").strip()
    if not prompt:
        raise HTTPException(status_code=422, detail="prompt required")

    from app.services.llm import ChatMessage, LLMRouter
    llm = LLMRouter(model=body.get("model", "claude-sonnet-4-6"))
    messages = [
        ChatMessage(
            role="system",
            content=(
                "You are an expert landing page copywriter. Generate clean, semantic HTML "
                "for a landing page section. Return only the HTML fragment (no <html>/<body> tags). "
                "Use inline Tailwind CSS classes if requested, otherwise use plain semantic HTML. "
                f"Page title: {page.title}. Primary color: {page.primary_color}."
            ),
        ),
        ChatMessage(role="user", content=prompt),
    ]
    response = await llm.complete(messages, max_tokens=2048)
    return {"success": True, "data": {"html": response.content.strip()}}


# ── Public page render (no auth) ───────────────────────────────────────────────

@router.get("/p/{slug}", response_class=HTMLResponse)
async def public_page(
    slug: str,
    request: Request,
    db: DBSession,
) -> HTMLResponse:
    result = await db.execute(
        select(LandingPage).where(LandingPage.slug == slug, LandingPage.is_published.is_(True))
    )
    page = result.scalar_one_or_none()

    if not page:
        # Also try short_id lookup
        result2 = await db.execute(
            select(LandingPage).where(LandingPage.short_id == slug, LandingPage.is_published.is_(True))
        )
        page = result2.scalar_one_or_none()

    if not page:
        return HTMLResponse("<h1>Page not found</h1>", status_code=404)

    # Track QR scan if ?qr=1
    if request.query_params.get("qr"):
        page.scan_count = (page.scan_count or 0) + 1

    # Record attribution event (fire-and-forget; don't block the response)
    import hashlib as _hashlib
    from app.models.attribution import AttributionEvent
    client_ip = request.client.host if request.client else ""
    ip_hash = _hashlib.sha256(client_ip.encode()).hexdigest()[:16] if client_ip else None
    db.add(AttributionEvent(
        user_id=page.user_id,
        landing_page_id=page.id,
        touch_type="first",
        ref=request.query_params.get("ref"),
        utm_source=request.query_params.get("utm_source"),
        utm_medium=request.query_params.get("utm_medium"),
        utm_campaign=request.query_params.get("utm_campaign"),
        utm_content=request.query_params.get("utm_content"),
        utm_term=request.query_params.get("utm_term"),
        page_slug=page.slug,
        session_id=request.query_params.get("sid"),
        ip_hash=ip_hash,
    ))
    await db.commit()

    # Pre-fill URL params substitution in html_content
    html = page.html_content
    for key in ("email", "phone", "first_name", "last_name", "ref", "agent"):
        val = request.query_params.get(key, "")
        if val:
            html = html.replace(f"{{{{url.{key}}}}}", val)

    # Custom primary color override
    primary = request.query_params.get("primaryColor", page.primary_color)
    is_dark = request.query_params.get("dark", "") == "1" or page.theme == "dark"

    seo = page.seo_meta or {}
    title = seo.get("title") or page.title
    description = seo.get("description") or page.description or ""
    og_image = seo.get("og_image", "")
    robots = seo.get("robots", "index,follow")

    full_html = f"""<!DOCTYPE html>
<html lang="en" class="{'dark' if is_dark else ''}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>{title}</title>
  <meta name="description" content="{description}" />
  <meta name="robots" content="{robots}" />
  <meta property="og:title" content="{title}" />
  <meta property="og:description" content="{description}" />
  {f'<meta property="og:image" content="{og_image}" />' if og_image else ''}
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
  <style>
    *, *::before, *::after {{ box-sizing: border-box; }}
    :root {{ --primary: {primary}; }}
    body {{ font-family: 'Inter', sans-serif; margin: 0; {'background:#0f172a;color:#f1f5f9;' if is_dark else 'background:#fff;color:#0f172a;'} }}
    a {{ color: var(--primary); }}
  </style>
</head>
<body>
{html}
</body>
</html>"""

    return HTMLResponse(full_html)


# ── Helpers ────────────────────────────────────────────────────────────────────

def _default_html(name: str) -> str:
    return f"""<section style="max-width:720px;margin:80px auto;padding:0 24px;text-align:center">
  <h1 style="font-size:2.5rem;font-weight:700;margin-bottom:1rem">{name}</h1>
  <p style="font-size:1.125rem;color:#64748b;margin-bottom:2rem">
    Your landing page is ready. Edit this content to tell your story.
  </p>
  <a href="#" style="display:inline-block;background:var(--primary);color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600">
    Get Started
  </a>
</section>"""
