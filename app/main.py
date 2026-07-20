"""Vita — сайт-генератор обоев «жизнь в точках» + персональные ссылки для автообоев."""
import io
import hashlib
import json
import os
import re
import secrets
import sqlite3
from datetime import date, timedelta
from html import escape as esc
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from PIL import Image, ImageOps

from .render import SHAPES, render_goal, render_wallpaper

ROOT = Path(__file__).resolve().parent.parent
# VITA_DATA — переопределение каталога данных (dev/тесты не трогают боевую БД)
DATA = Path(os.environ.get("VITA_DATA") or (ROOT / "data"))
DATA.mkdir(parents=True, exist_ok=True)
DB_PATH = DATA / "vita.db"

CODE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"
HANDLE_RE = re.compile(r"[a-z0-9_]{3,24}")
# Тег (бывший «ник») — уникальный @идентификатор профиля.
# Профиль с тегом владельца получает плашку «Разработчик Vita».
DEVELOPER_HANDLE = "vit"
# Зарезервированные теги выдаются только через /admin/handle.
RESERVED_HANDLES = {DEVELOPER_HANDLE, "vita", "vitadots", "admin", "support"}

# Starter tags are issued only by the server. The rarity roll is intentionally
# simple and auditable: 70% common, 22% rare, 7% epic, 1% legendary.
STARTER_TAGS = {
    "common": (
        {
            "id": "first_step",
            "name": "Первый шаг",
            "description": "Начал свой путь в Vita",
            "icon": "🌱",
        },
        {
            "id": "vita_beginner",
            "name": "Новичок Vita",
            "description": "Создал свой Vita ID",
            "icon": "●",
        },
    ),
    "rare": (
        {
            "id": "blue_spark",
            "name": "Синяя искра",
            "description": "Редкий стартовый знак",
            "icon": "💧",
        },
        {
            "id": "night_runner",
            "name": "Ночной ход",
            "description": "Редкий знак решительного старта",
            "icon": "🌙",
        },
    ),
    "epic": (
        {
            "id": "violet_pulse",
            "name": "Фиолетовый импульс",
            "description": "Эпический стартовый знак",
            "icon": "🔮",
        },
    ),
    "legendary": (
        {
            "id": "golden_origin",
            "name": "Золотое начало",
            "description": "Легендарный стартовый знак Vita",
            "icon": "✦",
        },
    ),
}

# авто-модерация ленты: ссылки и явный спам в названии цели
FEED_TITLE_BLOCK = re.compile(
    r"(https?://|www\.|\.ru/|\.com/|t\.me/|@\w{5,}|"
    r"порно|xxx|казино|ставк|vpn[\s-]?бот)",
    re.IGNORECASE,
)

# Ссылка iCloud на мастер-ярлык «Vita» (создаётся один раз на iPhone владельца,
# см. README). Пока пусто — на странице установки кнопка в состоянии «готовится».
SHORTCUT_ICLOUD_URL = os.environ.get("SHORTCUT_ICLOUD_URL", "")

TRIAL_DAYS = 7
REVIEW_DAYS = 7  # вторая неделя — автоматом за отзыв после использования
# токен админки: /admin?token=... — боевой задаётся в .env, не публиковать
ADMIN_TOKEN = os.environ.get("ADMIN_TOKEN", "vt-dev")

# --- «Сетевая блокировка» Vita Focus: тумблеры доменов через AdGuard Home ---
# AGH живёт в соседнем контейнере (см. docker-compose), наружу торчит только
# /dns-query через Caddy. Пустой NETBLOCK_TOKEN = фича выключена (всегда 403).
AGH_URL = os.environ.get("AGH_URL", "http://172.17.0.1:8083")
NETBLOCK_TOKEN = os.environ.get("NETBLOCK_TOKEN", "")
NETBLOCK_DOH_URL = "https://vitadots.ru/dns-query"
NETBLOCK_APPS: dict = {
    "instagram": {"title": "Instagram", "domains": ["instagram.com", "cdninstagram.com", "instagr.am", "ig.me"]},
    "tiktok": {"title": "TikTok", "domains": ["tiktok.com", "tiktokcdn.com", "tiktokv.com", "ttwstatic.com", "ibytedtos.com", "ibyteimg.com", "byteoversea.com", "musical.ly"]},
    "youtube": {"title": "YouTube", "domains": ["youtube.com", "ytimg.com", "googlevideo.com", "youtu.be", "youtube-nocookie.com", "ggpht.com"]},
    "x": {"title": "X (Twitter)", "domains": ["twitter.com", "x.com", "twimg.com", "t.co"]},
    "vk": {"title": "ВКонтакте", "domains": ["vk.com", "vk.me", "vk.ru", "userapi.com", "vkuseraudio.net", "vkuservideo.net"]},
    "telegram": {"title": "Telegram (частично)", "domains": ["telegram.org", "t.me", "telegram.me", "telesco.pe", "cdn-telegram.org"]},
    "facebook": {"title": "Facebook", "domains": ["facebook.com", "fbcdn.net", "fb.com", "facebook.net", "fb.watch"]},
    "reddit": {"title": "Reddit", "domains": ["reddit.com", "redd.it", "redditmedia.com", "redditstatic.com"]},
    "snapchat": {"title": "Snapchat", "domains": ["snapchat.com", "sc-cdn.net", "snapads.com", "sc-static.net"]},
    "pinterest": {"title": "Pinterest", "domains": ["pinterest.com", "pinimg.com", "pinterest.ru"]},
}
# Карточка живёт в WKWebView приложения (origin null) — нужен CORS.
NETBLOCK_CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
}


def db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.execute(
        "CREATE TABLE IF NOT EXISTS links("
        "code TEXT PRIMARY KEY, config TEXT NOT NULL, "
        "created TEXT NOT NULL DEFAULT (datetime('now')))"
    )
    conn.execute(
        "CREATE TABLE IF NOT EXISTS profiles("
        "code TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE, "
        "handle TEXT NOT NULL DEFAULT '', name TEXT NOT NULL DEFAULT '', "
        "bio TEXT NOT NULL DEFAULT '', avatar_id TEXT NOT NULL DEFAULT '', "
        "settings TEXT NOT NULL DEFAULT '{}', "
        "created TEXT NOT NULL DEFAULT (datetime('now')))"
    )
    for col in (
        "handle TEXT NOT NULL DEFAULT ''",
        "bio TEXT NOT NULL DEFAULT ''",
        "avatar_id TEXT NOT NULL DEFAULT ''",
    ):
        try:
            conn.execute(f"ALTER TABLE profiles ADD COLUMN {col}")
        except sqlite3.OperationalError:
            pass
    conn.execute(
        "CREATE TABLE IF NOT EXISTS profile_devices("
        "profile_code TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE, "
        "created TEXT NOT NULL DEFAULT (datetime('now')), "
        "PRIMARY KEY(profile_code, token_hash))"
    )
    conn.execute(
        "CREATE TABLE IF NOT EXISTS profile_tags("
        "profile_code TEXT NOT NULL, tag_id TEXT NOT NULL, name TEXT NOT NULL, "
        "description TEXT NOT NULL DEFAULT '', icon TEXT NOT NULL DEFAULT '', "
        "rarity TEXT NOT NULL, earned_at TEXT NOT NULL DEFAULT (datetime('now')), "
        "PRIMARY KEY(profile_code, tag_id))"
    )
    # Backfill pre-account profiles without exposing their private Vita ID.
    # The first pass also repairs a partially applied migration before adding
    # the case-insensitive unique index. Later requests inspect only incomplete
    # rows, because db() is opened on every request.
    handle_index_exists = conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type = 'index' "
        "AND name = 'profiles_handle_unique'"
    ).fetchone() is not None
    if handle_index_exists:
        profile_rows = conn.execute(
            "SELECT code, handle, name FROM profiles "
            "WHERE COALESCE(trim(handle), '') = '' "
            "OR COALESCE(trim(name), '') = ''"
        ).fetchall()
    else:
        profile_rows = conn.execute(
            "SELECT code, handle, name FROM profiles ORDER BY created, code"
        ).fetchall()
    seen_handles: set[str] = set()
    for profile_code, raw_handle, raw_name in profile_rows:
        handle = (raw_handle or "").strip().lower()
        if HANDLE_RE.fullmatch(handle) is None or handle in seen_handles:
            handle = _unique_profile_handle(conn)
        if handle != raw_handle:
            conn.execute("UPDATE profiles SET handle = ? WHERE code = ?", (handle, profile_code))
        seen_handles.add(handle)
        if not (raw_name or "").strip():
            conn.execute("UPDATE profiles SET name = ? WHERE code = ?", (handle, profile_code))
    for (profile_code,) in conn.execute(
        "SELECT p.code FROM profiles p "
        "WHERE NOT EXISTS ("
        "SELECT 1 FROM profile_tags t WHERE t.profile_code = p.code"
        ")"
    ).fetchall():
        _ensure_starter_tag(conn, profile_code)
    conn.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS profiles_handle_unique "
        "ON profiles(handle COLLATE NOCASE)"
    )
    for col in (
        "fetches INTEGER NOT NULL DEFAULT 0",
        "last_fetch TEXT",
        "access_until TEXT",
        "review_at TEXT",  # когда получена вторая неделя за отзыв (одноразово)
    ):
        try:
            conn.execute(f"ALTER TABLE links ADD COLUMN {col}")
        except sqlite3.OperationalError:
            pass  # колонка уже есть
    conn.execute(
        "CREATE TABLE IF NOT EXISTS ideas("
        "id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL, "
        "idea TEXT NOT NULL, contact TEXT NOT NULL, "
        "created TEXT NOT NULL DEFAULT (datetime('now')))"
    )
    conn.execute(
        "CREATE TABLE IF NOT EXISTS reviews("
        "id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL, "
        "text TEXT NOT NULL, "
        "created TEXT NOT NULL DEFAULT (datetime('now')))"
    )
    # трекер целей «тыкалка»: цель + отметки дней (checkins)
    conn.execute(
        "CREATE TABLE IF NOT EXISTS goals("
        "code TEXT PRIMARY KEY, title TEXT NOT NULL, days INTEGER NOT NULL, "
        "start TEXT NOT NULL, reward TEXT NOT NULL DEFAULT '', "
        "color TEXT NOT NULL DEFAULT '#34c759', bg TEXT NOT NULL DEFAULT 'black', "
        "shape TEXT NOT NULL DEFAULT 'circle', "
        "created TEXT NOT NULL DEFAULT (datetime('now')))"
    )
    conn.execute(
        "CREATE TABLE IF NOT EXISTS checkins("
        "code TEXT NOT NULL, day TEXT NOT NULL, PRIMARY KEY(code, day))"
    )
    try:
        conn.execute("ALTER TABLE goals ADD COLUMN root TEXT")  # корень челленджа (NULL = сам себе корень)
    except sqlite3.OperationalError:
        pass
    try:
        conn.execute("ALTER TABLE goals ADD COLUMN feed_hidden INTEGER NOT NULL DEFAULT 0")
    except sqlite3.OperationalError:
        pass
    for table in ("goals", "links"):
        try:
            conn.execute(f"ALTER TABLE {table} ADD COLUMN owner_code TEXT")
        except sqlite3.OperationalError:
            pass
    conn.execute(
        "CREATE TABLE IF NOT EXISTS feed_posts("
        "code TEXT PRIMARY KEY, owner_code TEXT NOT NULL, kind TEXT NOT NULL, "
        "source_code TEXT NOT NULL, title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', "
        "image_id TEXT NOT NULL DEFAULT '', hidden INTEGER NOT NULL DEFAULT 0, "
        "created TEXT NOT NULL DEFAULT (datetime('now')))"
    )
    # вейтлист беты Vita Focus (contact = телега/инста, PRIMARY KEY даёт дедуп)
    conn.execute(
        "CREATE TABLE IF NOT EXISTS focus_wait("
        "contact TEXT PRIMARY KEY, "
        "created TEXT NOT NULL DEFAULT (datetime('now')))"
    )
    conn.execute(
        "CREATE TABLE IF NOT EXISTS netblock("
        "app TEXT PRIMARY KEY, "
        "blocked INTEGER NOT NULL DEFAULT 0)"
    )
    return conn


class LinkIn(BaseModel):
    mode: str = "month"
    color: str = "#f2f2f2"
    bg: str = "black"
    bgImage: str = ""
    shape: str = "circle"
    glass: bool = False
    title: str = ""
    footer: bool = True
    brand: bool = True  # лого vita на обоях; в render.py уже есть cfg.get("brand", True)
    birth: str = "2000-01-01"
    start: str = ""
    end: str = ""
    idea: str = ""
    contact: str = ""
    ownerToken: str = ""


class ReviewIn(BaseModel):
    code: str
    text: str = ""


class GoalIn(BaseModel):
    title: str = ""
    days: int = 30
    reward: str = ""
    color: str = "#34c759"
    bg: str = "black"
    shape: str = "circle"
    start: str = ""
    ownerToken: str = ""


class ProfileIn(BaseModel):
    ownerToken: str = ""
    name: str = ""


class ProfileUpdateIn(BaseModel):
    ownerToken: str = ""
    name: str | None = None
    handle: str | None = None
    bio: str | None = None


class ProfileConnectIn(BaseModel):
    ownerToken: str = ""
    profileCode: str = ""


class GoalEditIn(BaseModel):
    ownerToken: str = ""
    title: str = ""
    days: int = 30
    reward: str = ""
    color: str = "#34c759"
    shape: str = "circle"


class OwnerIn(BaseModel):
    ownerToken: str = ""


class FeedPostIn(BaseModel):
    ownerToken: str = ""
    kind: str = "goal"
    sourceCode: str = ""
    title: str = ""
    description: str = ""
    imageId: str = ""


class ProfileSettingsIn(BaseModel):
    ownerToken: str = ""
    settings: dict = Field(default_factory=dict)


class ProfileCodeSettingsIn(BaseModel):
    settings: dict = Field(default_factory=dict)


class CheckIn(BaseModel):
    day: str = ""


class FocusWaitIn(BaseModel):
    contact: str = ""


def _gen_code() -> str:
    return "".join(secrets.choice(CODE_ALPHABET) for _ in range(6))


def _gen_profile_code() -> str:
    return "".join(secrets.choice(CODE_ALPHABET) for _ in range(10))


def _unique_profile_handle(conn: sqlite3.Connection) -> str:
    for _ in range(32):
        handle = f"vita_{_gen_code()}"
        if conn.execute(
            "SELECT 1 FROM profiles WHERE handle = ? COLLATE NOCASE", (handle,)
        ).fetchone() is None:
            return handle
    raise HTTPException(503, "Не удалось подобрать имя профиля — попробуй ещё раз")


def _starter_rarity() -> str:
    roll = secrets.randbelow(100)
    if roll < 70:
        return "common"
    if roll < 92:
        return "rare"
    if roll < 99:
        return "epic"
    return "legendary"


def _ensure_starter_tag(conn: sqlite3.Connection, profile_code: str) -> None:
    if conn.execute(
        "SELECT 1 FROM profile_tags WHERE profile_code = ? LIMIT 1", (profile_code,)
    ).fetchone():
        return
    rarity = _starter_rarity()
    tag = secrets.choice(STARTER_TAGS[rarity])
    conn.execute(
        "INSERT INTO profile_tags(profile_code, tag_id, name, description, icon, rarity) "
        "VALUES(?, ?, ?, ?, ?, ?)",
        (profile_code, tag["id"], tag["name"], tag["description"], tag["icon"], rarity),
    )


def _profile_tags(conn: sqlite3.Connection, profile_code: str) -> list[dict]:
    return [
        {
            "id": tag_id,
            "name": name,
            "description": description,
            "icon": icon,
            "rarity": rarity,
            "earnedAt": earned_at,
        }
        for tag_id, name, description, icon, rarity, earned_at in conn.execute(
            "SELECT tag_id, name, description, icon, rarity, earned_at "
            "FROM profile_tags WHERE profile_code = ? ORDER BY earned_at, tag_id",
            (profile_code,),
        )
    ]


def _avatar_url(avatar_id: str) -> str:
    return f"/media/avatar/{avatar_id}.jpg" if avatar_id else ""


def _normalize_handle(raw: str) -> str:
    handle = raw.strip().lower().removeprefix("@")
    if HANDLE_RE.fullmatch(handle) is None:
        raise HTTPException(422, "Тег: 3–24 символа, только латиница, цифры и _")
    return handle


def _normalize_profile_name(raw: str) -> str:
    name = " ".join(raw.strip().split())
    if not (2 <= len(name) <= 40):
        raise HTTPException(422, "Имя должно быть от 2 до 40 символов")
    if FEED_TITLE_BLOCK.search(name):
        raise HTTPException(422, "В имени не должно быть ссылок или рекламы")
    return name


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _profile_for_token(conn: sqlite3.Connection, token: str, create: bool = False) -> str | None:
    token = token.strip()
    if not (20 <= len(token) <= 200):
        if create:
            raise HTTPException(422, "Не удалось создать Vita ID — обнови страницу")
        return None
    digest = _token_hash(token)
    row = conn.execute(
        "SELECT profile_code FROM profile_devices WHERE token_hash = ?", (digest,)
    ).fetchone()
    if not row:
        row = conn.execute("SELECT code FROM profiles WHERE token_hash = ?", (digest,)).fetchone()
    if row:
        return row[0]
    if not create:
        return None
    for _ in range(8):
        code = _gen_profile_code()
        handle = _unique_profile_handle(conn)
        try:
            conn.execute(
                "INSERT INTO profiles(code, token_hash, handle, name) VALUES(?, ?, ?, ?)",
                (code, digest, handle, handle),
            )
            conn.execute(
                "INSERT INTO profile_devices(profile_code, token_hash) VALUES(?, ?)",
                (code, digest),
            )
            _ensure_starter_tag(conn, code)
            return code
        except sqlite3.IntegrityError:
            continue
    raise HTTPException(503, "Не удалось создать Vita ID — попробуй ещё раз")


def _clean_profile_settings(value: dict) -> dict:
    allowed = {}
    theme = value.get("theme")
    if theme in ("graphite", "violet", "ocean", "ember", "photo"):
        allowed["theme"] = theme
    style = value.get("dotStyle")
    if style in ("goal", "circle", "soft", "square", "diamond", "heart", "star", "hex"):
        allowed["dotStyle"] = style
    color = value.get("dotColor")
    if color == "auto" or _valid_color(color):
        allowed["dotColor"] = color.upper() if color != "auto" else color
    return allowed


def _valid_color(c: str) -> bool:
    return isinstance(c, str) and len(c) == 7 and c[0] == "#" and all(
        ch in "0123456789abcdefABCDEF" for ch in c[1:]
    )


def _feed_title_ok(title: str) -> bool:
    """Лента: без ссылок и явного спама в названии."""
    t = title.strip()
    if len(t) < 2:
        return False
    return not FEED_TITLE_BLOCK.search(t)


def _challenge_root(code: str, root: str | None) -> str:
    return root or code


def _feed_items(conn: sqlite3.Connection, limit: int = 60) -> list[dict]:
    rows = conn.execute(
        "SELECT g.code, g.title, g.days, g.color, g.shape, cnt.peers, "
        "       COALESCE(done.cnt, 0) "
        "FROM (SELECT COALESCE(root, code) AS rc, COUNT(*) AS peers "
        "      FROM goals WHERE COALESCE(feed_hidden, 0) = 0 "
        "      GROUP BY rc HAVING peers >= 2) cnt "
        "JOIN goals g ON g.code = cnt.rc "
        "LEFT JOIN ("
        "  SELECT COALESCE(g2.root, g2.code) AS rc, COUNT(*) AS cnt "
        "  FROM goals g2 "
        "  WHERE (SELECT COUNT(*) FROM checkins c WHERE c.code = g2.code) >= g2.days "
        "  GROUP BY rc"
        ") done ON done.rc = cnt.rc "
        "WHERE COALESCE(g.feed_hidden, 0) = 0 "
        "ORDER BY cnt.peers DESC, done.cnt DESC, g.created DESC "
        f"LIMIT {int(limit)}"
    ).fetchall()
    items = []
    for c, t, d, col, sh, peers, completed in rows:
        if not _feed_title_ok(t):
            continue
        items.append({
            "code": c, "title": t, "days": d, "color": col,
            "shape": sh, "peers": peers, "completed": completed,
        })
    return items


def _feed_posts(conn: sqlite3.Connection, limit: int = 60) -> list[dict]:
    rows = conn.execute(
        "SELECT code, kind, source_code, title, description, image_id, created, owner_code "
        "FROM feed_posts WHERE hidden = 0 ORDER BY created DESC LIMIT ?",
        (min(max(limit, 1), 100),),
    ).fetchall()
    posts = []
    for code, kind, source, title, description, image_id, created, owner_code in rows:
        if not _feed_title_ok(title):
            continue
        target = f"/c/{source}" if kind in ("goal", "widget") else f"/s/{source}"
        posts.append({
            "code": code, "kind": kind, "sourceCode": source, "title": title,
            "description": description, "image": f"/media/post/{image_id}.jpg" if image_id else "",
            "target": target, "created": created,
            "author": _public_profile_payload(conn, profile_code=owner_code),
        })
    return posts


def _completed_for_challenge(conn: sqlite3.Connection, code: str, root: str | None) -> int:
    key = _challenge_root(code, root)
    return conn.execute(
        "SELECT COUNT(*) FROM goals g "
        "WHERE COALESCE(g.root, g.code) = ? "
        "AND (SELECT COUNT(*) FROM checkins c WHERE c.code = g.code) >= g.days",
        (key,),
    ).fetchone()[0]


def _public_profile_payload(
    conn: sqlite3.Connection,
    *,
    profile_code: str | None = None,
    handle: str | None = None,
) -> dict:
    if profile_code is not None:
        row = conn.execute(
            "SELECT code, handle, name, bio, avatar_id FROM profiles WHERE code = ?",
            (profile_code,),
        ).fetchone()
    else:
        row = conn.execute(
            "SELECT code, handle, name, bio, avatar_id FROM profiles "
            "WHERE handle = ? COLLATE NOCASE",
            (handle or "",),
        ).fetchone()
    if row is None:
        raise HTTPException(404, "Профиль не найден")
    code, public_handle, name, bio, avatar_id = row
    return {
        "handle": public_handle,
        "name": name,
        "bio": bio,
        "avatar": _avatar_url(avatar_id),
        # TODO(достижения): плашки-теги спрятаны до переработки в «достижения»;
        # данные копятся в profile_tags, наружу пока не отдаём.
        "tags": [],
        "developer": (public_handle or "").lower() == DEVELOPER_HANDLE,
    }


def _profile_payload(conn: sqlite3.Connection, profile_code: str) -> dict:
    row = conn.execute(
        "SELECT handle, name, bio, avatar_id, settings, created "
        "FROM profiles WHERE code = ?",
        (profile_code,),
    ).fetchone()
    if row is None:
        raise HTTPException(404, "Vita ID не найден")
    goals = [
        {
            "code": code, "title": title, "days": days, "start": start,
            "color": color, "shape": shape, "done": done, "created": created,
        }
        for code, title, days, start, color, shape, done, created in conn.execute(
            "SELECT g.code, g.title, g.days, g.start, g.color, g.shape, "
            "(SELECT COUNT(*) FROM checkins c WHERE c.code = g.code), g.created "
            "FROM goals g WHERE g.owner_code = ? ORDER BY g.created DESC",
            (profile_code,),
        )
    ]
    wallpapers = []
    for code, raw, created in conn.execute(
        "SELECT code, config, created FROM links WHERE owner_code = ? ORDER BY created DESC",
        (profile_code,),
    ):
        try:
            cfg = json.loads(raw)
        except (TypeError, json.JSONDecodeError):
            cfg = {}
        wallpapers.append({
            "code": code,
            "title": cfg.get("title") or "Обои Vita",
            "mode": cfg.get("mode", "month"),
            "color": cfg.get("color", "#f2f2f2"),
            "shape": cfg.get("shape", "circle"),
            "created": created,
        })
    posts = [
        {
            "code": code, "kind": kind, "sourceCode": source, "title": title,
            "description": description, "imageId": image_id, "created": created,
        }
        for code, kind, source, title, description, image_id, created in conn.execute(
            "SELECT code, kind, source_code, title, description, image_id, created "
            "FROM feed_posts WHERE owner_code = ? ORDER BY created DESC",
            (profile_code,),
        )
    ]
    try:
        settings = json.loads(row[4] or "{}")
    except json.JSONDecodeError:
        settings = {}
    return {
        "code": profile_code,
        "handle": row[0],
        "name": row[1],
        "bio": row[2],
        "avatar": _avatar_url(row[3]),
        # TODO(достижения): см. _public_profile_payload — плашки спрятаны.
        "tags": [],
        "developer": (row[0] or "").lower() == DEVELOPER_HANDLE,
        "settings": settings,
        "goals": goals,
        "wallpapers": wallpapers,
        "posts": posts,
        "created": row[5],
    }


app = FastAPI(title="vita")


@app.get("/")
def index():
    # HTML не кэшируем: статика версионируется (?v=N), а страница всегда свежая
    return FileResponse(ROOT / "static" / "index.html", headers={"Cache-Control": "no-cache"})


@app.get("/robots.txt")
def robots():
    # персональные ссылки (обои/установка/цели) поисковикам не нужны
    return Response(
        "User-agent: *\nAllow: /\n"
        "Disallow: /s/\nDisallow: /w/\nDisallow: /g/\nDisallow: /gw/\nDisallow: /c/\nDisallow: /me\nDisallow: /admin\n"
        "Sitemap: https://vitadots.ru/sitemap.xml\n",
        media_type="text/plain",
    )


@app.get("/sitemap.xml")
def sitemap():
    urls = "".join(
        f"<url><loc>https://vitadots.ru/{p}</loc></url>" for p in ("", "goals", "feed", "focus", "privacy")
    )
    return Response(
        f'<?xml version="1.0" encoding="UTF-8"?>'
        f'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">{urls}</urlset>',
        media_type="application/xml",
    )


@app.post("/api/upload-bg")
async def upload_bg(file: UploadFile = File(...)):
    """Своё фото для фона обоев — ресайз под экран iPhone, хранится на сервере."""
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(422, "Нужна картинка — JPG, PNG или HEIC")
    raw = await file.read()
    if len(raw) > 12 * 1024 * 1024:
        raise HTTPException(422, "Слишком большой файл — до 12 МБ")
    try:
        img = Image.open(io.BytesIO(raw)).convert("RGB")
    except Exception:
        raise HTTPException(422, "Не получилось прочитать картинку")
    from .render import W, H, cover_crop

    img = cover_crop(img, W, H)
    bg_dir = DATA / "bg"
    bg_dir.mkdir(parents=True, exist_ok=True)
    img_id = _gen_code()
    img.save(bg_dir / f"{img_id}.jpg", "JPEG", quality=88)
    return {"id": img_id}


@app.post("/api/upload-post-image")
async def upload_post_image(file: UploadFile = File(...)):
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(422, "Нужна картинка")
    raw = await file.read()
    if len(raw) > 12 * 1024 * 1024:
        raise HTTPException(422, "Слишком большой файл — до 12 МБ")
    try:
        img = Image.open(io.BytesIO(raw)).convert("RGB")
        img.thumbnail((1600, 1600), Image.Resampling.LANCZOS)
    except Exception:
        raise HTTPException(422, "Не получилось прочитать картинку")
    image_id = _gen_code()
    post_dir = DATA / "posts"
    post_dir.mkdir(parents=True, exist_ok=True)
    img.save(post_dir / f"{image_id}.jpg", "JPEG", quality=88, optimize=True)
    return {"id": image_id}


@app.get("/media/post/{image_id}.jpg")
def post_image(image_id: str):
    if not re.fullmatch(r"[a-z0-9]{6}", image_id):
        raise HTTPException(404, "Картинка не найдена")
    path = DATA / "posts" / f"{image_id}.jpg"
    if not path.exists():
        raise HTTPException(404, "Картинка не найдена")
    return FileResponse(path, media_type="image/jpeg", headers={"Cache-Control": "public, max-age=86400"})


@app.get("/media/avatar/{image_id}.jpg")
def avatar_image(image_id: str):
    if not re.fullmatch(r"[a-z0-9]{10}", image_id):
        raise HTTPException(404, "Аватар не найден")
    path = DATA / "avatars" / f"{image_id}.jpg"
    if not path.exists():
        raise HTTPException(404, "Аватар не найден")
    return FileResponse(
        path,
        media_type="image/jpeg",
        headers={"Cache-Control": "public, max-age=31536000, immutable"},
    )


@app.post("/api/link")
def create_link(cfg: LinkIn, request: Request):
    idea, contact = cfg.idea.strip(), cfg.contact.strip()
    if len(idea) < 10:
        raise HTTPException(422, "Расскажи идею чуть подробнее — хотя бы пару слов")
    if len(contact) < 2:
        raise HTTPException(422, "Оставь телегу или инсту — туда придёт вторая неделя")
    if cfg.bg == "custom":
        if not cfg.bgImage or not re.fullmatch(r"[a-z0-9]{6}", cfg.bgImage):
            raise HTTPException(422, "Загрузи своё фото для фона")
        if not (DATA / "bg" / f"{cfg.bgImage}.jpg").exists():
            raise HTTPException(422, "Фото не найдено — выбери снова")
    code = "".join(secrets.choice(CODE_ALPHABET) for _ in range(6))
    until = (date.today() + timedelta(days=TRIAL_DAYS)).isoformat()
    config = json.dumps(cfg.model_dump(exclude={"idea", "contact", "ownerToken"}), ensure_ascii=False)
    with db() as conn:
        owner_code = _profile_for_token(conn, cfg.ownerToken, create=bool(cfg.ownerToken.strip()))
        conn.execute(
            "INSERT INTO links(code, config, access_until, owner_code) VALUES(?, ?, ?, ?)",
            (code, config, until, owner_code),
        )
        conn.execute(
            "INSERT INTO ideas(code, idea, contact) VALUES(?, ?, ?)",
            (code, idea, contact),
        )
    base = str(request.base_url).rstrip("/")
    return {"code": code, "url": f"{base}/w/{code}.png", "setup": f"{base}/s/{code}", "until": until}


@app.post("/api/review")
def create_review(rv: ReviewIn):
    text = rv.text.strip()
    if len(text) < 15:
        raise HTTPException(422, "Напиши чуть подробнее — хотя бы строчку живого текста")
    with db() as conn:
        row = conn.execute(
            "SELECT access_until, review_at FROM links WHERE code = ?", (rv.code,)
        ).fetchone()
        if row is None:
            raise HTTPException(404, "Нет такой ссылки")
        if row[1]:  # вторую неделю уже дарили
            raise HTTPException(409, "Вторая неделя уже активирована — спасибо, что остаёшься 🙏")
        conn.execute("INSERT INTO reviews(code, text) VALUES(?, ?)", (rv.code, text))
        conn.execute(
            "UPDATE links SET review_at = datetime('now') WHERE code = ?", (rv.code,)
        )
        new_until = _extend(conn, rv.code, REVIEW_DAYS, row[0])
    until_d = date.fromisoformat(new_until)
    return {"code": rv.code, "until": new_until, "until_h": until_d.strftime("%d.%m")}


def _access_state(access_until: str | None) -> tuple[bool, date | None]:
    """(доступ истёк, дата заморозки). NULL = бессрочный доступ."""
    if not access_until:
        return False, None
    try:
        until = date.fromisoformat(access_until)
    except ValueError:
        return False, None
    return date.today() > until, until


def _extend(conn: sqlite3.Connection, code: str, days: int, current: str | None) -> str:
    """Продлить доступ от максимума (сегодня, текущий срок). Возвращает новую дату ISO."""
    _, until = _access_state(current)
    base = max(date.today(), until) if until else date.today()
    new_until = (base + timedelta(days=days)).isoformat()
    conn.execute("UPDATE links SET access_until = ? WHERE code = ?", (new_until, code))
    return new_until


REVIEW_BLOCK = """<div class="review" id="reviewBlock">
  <h3>Открой вторую неделю — бесплатно</h3>
  <p class="hint">Расскажи, как тебе Vita: для чего используешь, что зацепило, чего не хватает.
    Пара живых фраз — и мы дарим ещё 7 дней.</p>
  <textarea id="reviewText" rows="4"
    placeholder="Например: наконец вижу, сколько недель уже прожито — отрезвляет и бодрит одновременно…"></textarea>
  <button id="reviewSend" class="btn primary">Отправить и получить +7 дней</button>
  <p class="hint err" id="reviewStatus"></p>
</div>"""

REVIEW_DONE = """<div class="review">
  <h3>Спасибо за отзыв 🙏</h3>
  <p class="hint">Вторая неделя уже активна. Точки живут дальше.</p>
</div>"""


@app.get("/s/{code}")
def setup_page(code: str, request: Request):
    with db() as conn:
        row = conn.execute(
            "SELECT access_until, fetches, review_at FROM links WHERE code = ?", (code,)
        ).fetchone()
    if row is None:
        raise HTTPException(404, "Нет такой ссылки")
    access_until, fetches, review_at = row
    url = str(request.base_url).rstrip("/") + f"/w/{code}.png"
    if SHORTCUT_ICLOUD_URL:
        btn = f'<a class="btn primary" href="{SHORTCUT_ICLOUD_URL}">Добавить ярлык</a>'
    else:
        btn = '<span class="btn primary disabled">Ярлык готовится — скоро здесь</span>'
    expired, until = _access_state(access_until)
    if until is None:
        access = ""
    elif expired:
        access = f"Доступ закончился {until.strftime('%d.%m')} — продли, и точки оживут."
    else:
        access = f"Твоя неделя активна до {until.strftime('%d.%m')}."
    # блок отзыва: только тем, кто уже пользовался (обои реально тянулись) или у кого доступ истёк,
    # и только если вторую неделю ещё не дарили — иначе пусто/благодарность
    if review_at:
        review = REVIEW_DONE
    elif fetches and fetches > 0 or expired:
        review = REVIEW_BLOCK
    else:
        review = ""
    html = (ROOT / "static" / "setup.html").read_text(encoding="utf-8")
    return HTMLResponse(
        html.replace("{{URL}}", url)
        .replace("{{SHORTCUT_BTN}}", btn)
        .replace("{{ACCESS}}", access)
        .replace("{{REVIEW}}", review)
        .replace("{{CODE}}", code),
        headers={"Cache-Control": "no-cache"},
    )


@app.get("/w/{code}.png")
def wallpaper(code: str):
    with db() as conn:
        row = conn.execute(
            "SELECT config, access_until FROM links WHERE code = ?", (code,)
        ).fetchone()
        if row is not None:
            conn.execute(
                "UPDATE links SET fetches = fetches + 1, last_fetch = datetime('now') WHERE code = ?",
                (code,),
            )
    if row is None:
        raise HTTPException(404, "Нет такой ссылки")
    expired, until = _access_state(row[1])
    img = render_wallpaper(
        json.loads(row[0]),
        today=until if expired else None,  # прогресс заморожен на дате окончания
        expired=expired,
    )
    buf = io.BytesIO()
    img.save(buf, "PNG")
    return Response(
        buf.getvalue(),
        media_type="image/png",
        headers={"Cache-Control": "no-store"},  # Ярлыки должны тянуть свежую картинку каждый день
    )


# --- трекер целей «тыкалка» (клон Ripples, чисто веб) ---


@app.get("/goals")
def goals_new():
    return FileResponse(ROOT / "static" / "goals.html", headers={"Cache-Control": "no-cache"})


@app.get("/focus")
def focus_page():
    return FileResponse(ROOT / "static" / "focus.html", headers={"Cache-Control": "no-cache"})


@app.get("/privacy")
def privacy_page():
    return FileResponse(ROOT / "static" / "privacy.html", headers={"Cache-Control": "no-cache"})


@app.get("/me")
def cabinet_page():
    return FileResponse(ROOT / "static" / "me.html", headers={"Cache-Control": "no-cache"})


@app.get("/u/{handle}")
def member_page(handle: str):
    return FileResponse(ROOT / "static" / "member.html", headers={"Cache-Control": "no-cache"})


@app.post("/api/profile")
def ensure_profile(profile: ProfileIn):
    name = _normalize_profile_name(profile.name) if profile.name.strip() else ""
    with db() as conn:
        code = _profile_for_token(conn, profile.ownerToken, create=True)
        if name:
            conn.execute("UPDATE profiles SET name = ? WHERE code = ?", (name, code))
        return _profile_payload(conn, code)


@app.patch("/api/profile")
def update_profile(profile: ProfileUpdateIn):
    with db() as conn:
        code = _profile_for_token(conn, profile.ownerToken)
        if code is None:
            raise HTTPException(401, "Нет доступа к Vita ID")

        fields: dict[str, str] = {}
        if profile.name is not None:
            fields["name"] = _normalize_profile_name(profile.name)
        if profile.handle is not None:
            handle = _normalize_handle(profile.handle)
            if handle in RESERVED_HANDLES:
                current = conn.execute(
                    "SELECT handle FROM profiles WHERE code = ?", (code,)
                ).fetchone()
                if current is None or (current[0] or "").lower() != handle:
                    raise HTTPException(409, "Этот тег зарезервирован")
            occupied = conn.execute(
                "SELECT 1 FROM profiles WHERE handle = ? COLLATE NOCASE AND code != ?",
                (handle, code),
            ).fetchone()
            if occupied:
                raise HTTPException(409, "Этот тег уже занят")
            fields["handle"] = handle
        if profile.bio is not None:
            bio = profile.bio.strip()
            if len(bio) > 280:
                raise HTTPException(422, "Описание — максимум 280 символов")
            if FEED_TITLE_BLOCK.search(bio):
                raise HTTPException(422, "В описании не должно быть ссылок или рекламы")
            fields["bio"] = bio

        if fields:
            assignments = ", ".join(f"{key} = ?" for key in fields)
            try:
                conn.execute(
                    f"UPDATE profiles SET {assignments} WHERE code = ?",
                    (*fields.values(), code),
                )
            except sqlite3.IntegrityError as error:
                raise HTTPException(409, "Этот тег уже занят") from error
        return _profile_payload(conn, code)


@app.post("/api/profile/avatar")
async def upload_profile_avatar(
    ownerToken: str = Form(""),
    file: UploadFile = File(...),
):
    with db() as conn:
        code = _profile_for_token(conn, ownerToken)
        if code is None:
            raise HTTPException(401, "Нет доступа к Vita ID")

    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(422, "Нужна картинка")
    raw = await file.read(8 * 1024 * 1024 + 1)
    if len(raw) > 8 * 1024 * 1024:
        raise HTTPException(422, "Слишком большой файл — до 8 МБ")
    try:
        image = Image.open(io.BytesIO(raw))
        if image.width * image.height > 40_000_000:
            raise ValueError("image is too large")
        image = ImageOps.exif_transpose(image).convert("RGB")
        image = ImageOps.fit(image, (512, 512), method=Image.Resampling.LANCZOS)
    except Exception:
        raise HTTPException(422, "Не получилось прочитать картинку")

    avatar_dir = DATA / "avatars"
    avatar_dir.mkdir(parents=True, exist_ok=True)
    for _ in range(16):
        avatar_id = _gen_profile_code()
        avatar_path = avatar_dir / f"{avatar_id}.jpg"
        if not avatar_path.exists():
            break
    else:
        raise HTTPException(503, "Не удалось сохранить аватар — попробуй ещё раз")
    image.save(avatar_path, "JPEG", quality=90, optimize=True)

    old_avatar_id = ""
    try:
        with db() as conn:
            code = _profile_for_token(conn, ownerToken)
            if code is None:
                raise HTTPException(401, "Нет доступа к Vita ID")
            row = conn.execute("SELECT avatar_id FROM profiles WHERE code = ?", (code,)).fetchone()
            old_avatar_id = row[0] if row else ""
            conn.execute("UPDATE profiles SET avatar_id = ? WHERE code = ?", (avatar_id, code))
            payload = _profile_payload(conn, code)
    except Exception:
        avatar_path.unlink(missing_ok=True)
        raise

    if old_avatar_id and old_avatar_id != avatar_id:
        (avatar_dir / f"{old_avatar_id}.jpg").unlink(missing_ok=True)
    return payload


@app.post("/api/profile/connect")
def connect_profile(profile: ProfileConnectIn):
    code = profile.profileCode.strip().lower()
    token = profile.ownerToken.strip()
    if len(code) != 10 or any(ch not in CODE_ALPHABET for ch in code):
        raise HTTPException(422, "Проверь десятизначный Vita ID")
    if not (20 <= len(token) <= 200):
        raise HTTPException(422, "Не удалось подключить это устройство")
    digest = _token_hash(token)
    with db() as conn:
        if conn.execute("SELECT 1 FROM profiles WHERE code = ?", (code,)).fetchone() is None:
            raise HTTPException(404, "Vita ID не найден")
        current = conn.execute(
            "SELECT profile_code FROM profile_devices WHERE token_hash = ?", (digest,)
        ).fetchone()
        if current and current[0] != code:
            raise HTTPException(409, "Это устройство уже связано с другим Vita ID")
        conn.execute(
            "INSERT OR IGNORE INTO profile_devices(profile_code, token_hash) VALUES(?, ?)",
            (code, digest),
        )
        return _profile_payload(conn, code)


@app.post("/api/me")
def profile_library(owner: OwnerIn):
    with db() as conn:
        code = _profile_for_token(conn, owner.ownerToken)
        if code is None:
            raise HTTPException(401, "Vita ID не найден на этом устройстве")
        return _profile_payload(conn, code)


@app.get("/api/member/{handle}")
def public_profile(handle: str):
    value = handle.strip().lower()
    if HANDLE_RE.fullmatch(value) is None:
        raise HTTPException(404, "Профиль не найден")
    with db() as conn:
        return _public_profile_payload(conn, handle=value)


@app.get("/api/profile/{code}/bundle")
def profile_bundle(code: str):
    """Read-only bundle for pairing Vita Focus with a private Vita ID."""
    with db() as conn:
        payload = _profile_payload(conn, code.lower())
    return {
        "code": payload["code"],
        "handle": payload["handle"],
        "name": payload["name"],
        "bio": payload["bio"],
        "avatar": payload["avatar"],
        "tags": payload["tags"],
        "settings": payload["settings"],
        "goals": payload["goals"],
    }


@app.put("/api/profile/settings")
def save_profile_settings(update: ProfileSettingsIn):
    settings = _clean_profile_settings(update.settings)
    with db() as conn:
        code = _profile_for_token(conn, update.ownerToken)
        if code is None:
            raise HTTPException(401, "Нет доступа к Vita ID")
        conn.execute(
            "UPDATE profiles SET settings = ? WHERE code = ?",
            (json.dumps(settings, ensure_ascii=False), code),
        )
    return {"code": code, "settings": settings}


@app.put("/api/profile/{code}/settings")
def sync_profile_settings(code: str, update: ProfileCodeSettingsIn):
    """A Vita ID is a private pairing code; it may update only the small widget settings bundle."""
    settings = _clean_profile_settings(update.settings)
    with db() as conn:
        exists = conn.execute("SELECT 1 FROM profiles WHERE code = ?", (code.lower(),)).fetchone()
        if exists is None:
            raise HTTPException(404, "Vita ID не найден")
        conn.execute(
            "UPDATE profiles SET settings = ? WHERE code = ?",
            (json.dumps(settings, ensure_ascii=False), code.lower()),
        )
    return {"code": code.lower(), "settings": settings}


@app.get("/.well-known/security.txt")
def security_txt():
    return FileResponse(ROOT / "static" / ".well-known/security.txt", media_type="text/plain")


@app.post("/api/focus-wait")
def focus_wait(fw: FocusWaitIn):
    """Вейтлист беты Vita Focus: телега/инста. Повторная отправка — тоже ок (дедуп по contact)."""
    contact = fw.contact.strip()
    if len(contact) < 2:
        raise HTTPException(422, "Оставь телегу или инсту — туда позовём в бету")
    with db() as conn:
        conn.execute("INSERT OR IGNORE INTO focus_wait(contact) VALUES(?)", (contact[:64],))
    return {"ok": True}


@app.get("/feed")
def feed_page():
    return FileResponse(ROOT / "static" / "feed.html", headers={"Cache-Control": "no-cache"})


@app.get("/api/feed")
def feed_list():
    """Публикации людей + челленджи, которые уже подхватили другие."""
    with db() as conn:
        items = _feed_items(conn, 60)
        posts = _feed_posts(conn, 60)
    return {"posts": posts, "top": items[:3], "items": items}


@app.post("/api/feed-post")
def create_feed_post(post: FeedPostIn):
    kind = post.kind if post.kind in ("goal", "wallpaper", "widget") else "goal"
    source = post.sourceCode.strip().lower()
    title = post.title.strip()
    description = post.description.strip()[:500]
    if len(title) < 2 or not _feed_title_ok(title):
        raise HTTPException(422, "Добавь короткое название без ссылок")
    if FEED_TITLE_BLOCK.search(description):
        raise HTTPException(422, "В описании не должно быть ссылок или рекламы")
    image_id = post.imageId.strip().lower()
    if image_id and not (DATA / "posts" / f"{image_id}.jpg").exists():
        raise HTTPException(422, "Фото не найдено")
    with db() as conn:
        owner_code = _profile_for_token(conn, post.ownerToken)
        if owner_code is None:
            raise HTTPException(401, "Открой «Моя Vita» и попробуй снова")
        table = "goals" if kind in ("goal", "widget") else "links"
        owned = conn.execute(
            f"SELECT 1 FROM {table} WHERE code = ? AND owner_code = ?", (source, owner_code)
        ).fetchone()
        if owned is None:
            raise HTTPException(403, "Можно публиковать только свои работы")
        for _ in range(8):
            code = _gen_code()
            try:
                conn.execute(
                    "INSERT INTO feed_posts(code, owner_code, kind, source_code, title, description, image_id) "
                    "VALUES(?, ?, ?, ?, ?, ?, ?)",
                    (code, owner_code, kind, source, title[:80], description, image_id),
                )
                break
            except sqlite3.IntegrityError:
                continue
        else:
            raise HTTPException(503, "Не удалось опубликовать — попробуй ещё раз")
    return {"code": code, "url": f"/feed#post-{code}", "sourceCode": source}


@app.post("/api/goal")
def create_goal(g: GoalIn, request: Request):
    title = g.title.strip()
    if len(title) < 2:
        raise HTTPException(422, "Назови цель — хотя бы пару слов")
    if not _feed_title_ok(title):
        raise HTTPException(422, "В названии не должно быть ссылок и рекламы — только суть цели")
    days = min(max(int(g.days), 1), 365)
    start = _parse_start(g.start)
    color = g.color if _valid_color(g.color) else "#34c759"
    bg = g.bg if g.bg in ("black", "white", "navy") else "black"
    shape = g.shape if g.shape in SHAPES else "circle"
    code = _gen_code()
    with db() as conn:
        owner_code = _profile_for_token(conn, g.ownerToken, create=bool(g.ownerToken.strip()))
        conn.execute(
            "INSERT INTO goals(code, title, days, start, reward, color, bg, shape, owner_code) "
            "VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (code, title[:80], days, start, g.reward.strip()[:200], color, bg, shape, owner_code),
        )
    base = str(request.base_url).rstrip("/")
    return {"code": code, "url": f"{base}/g/{code}"}


def _parse_start(value: str) -> str:
    try:
        return date.fromisoformat(value).isoformat()
    except (ValueError, TypeError):
        return date.today().isoformat()


def _goal_row(code: str):
    with db() as conn:
        g = conn.execute(
            "SELECT code, title, days, start, reward, color, bg, shape, root FROM goals WHERE code = ?",
            (code,),
        ).fetchone()
        done = [r[0] for r in conn.execute(
            "SELECT day FROM checkins WHERE code = ? ORDER BY day", (code,)
        )]
    return g, done


def _peers(code: str, root: str | None) -> int:
    """Сколько всего людей делают этот челлендж (включая корень и все копии)."""
    key = root or code
    with db() as conn:
        return conn.execute(
            "SELECT COUNT(*) FROM goals WHERE COALESCE(root, code) = ?", (key,)
        ).fetchone()[0]


@app.get("/g/{code}")
def goal_page(code: str):
    g, _ = _goal_row(code)
    if g is None:
        raise HTTPException(404, "Нет такой цели")
    html = (ROOT / "static" / "goal.html").read_text(encoding="utf-8")
    return HTMLResponse(
        html.replace("{{CODE}}", code).replace("{{SHORTCUT_URL}}", SHORTCUT_ICLOUD_URL),
        headers={"Cache-Control": "no-cache"},
    )


@app.get("/c/{code}")
def challenge_page(code: str):
    g, _ = _goal_row(code)
    if g is None:
        raise HTTPException(404, "Нет такой цели")
    html = (ROOT / "static" / "challenge.html").read_text(encoding="utf-8")
    return HTMLResponse(html.replace("{{CODE}}", code), headers={"Cache-Control": "no-cache"})


@app.get("/api/goal/{code}")
def goal_state(code: str, request: Request):
    g, done = _goal_row(code)
    if g is None:
        raise HTTPException(404, "Нет такой цели")
    _, title, days, start, reward, color, bg, shape, root = g
    with db() as conn:
        completed = _completed_for_challenge(conn, code, root)
        owner_row = conn.execute("SELECT owner_code FROM goals WHERE code = ?", (code,)).fetchone()
        viewer = _profile_for_token(conn, request.headers.get("x-vita-token", ""))
    return {
        "code": code, "title": title, "days": days, "start": start, "reward": reward,
        "color": color, "bg": bg, "shape": shape, "done": done,
        "peers": _peers(code, root), "completed": completed,
        "editable": bool(viewer and owner_row and viewer == owner_row[0]),
    }


@app.patch("/api/goal/{code}")
def goal_edit(code: str, update: GoalEditIn):
    title = update.title.strip()
    if len(title) < 2:
        raise HTTPException(422, "Назови цель — хотя бы пару слов")
    if not _feed_title_ok(title):
        raise HTTPException(422, "В названии не должно быть ссылок и рекламы")
    days = min(max(int(update.days), 1), 365)
    color = update.color if _valid_color(update.color) else "#34c759"
    shape = update.shape if update.shape in SHAPES else "circle"
    with db() as conn:
        viewer = _profile_for_token(conn, update.ownerToken)
        row = conn.execute(
            "SELECT owner_code, start FROM goals WHERE code = ?", (code,)
        ).fetchone()
        if row is None:
            raise HTTPException(404, "Нет такой цели")
        if viewer is None or row[0] != viewer:
            raise HTTPException(403, "Эту цель может редактировать только её владелец")
        last_done = conn.execute(
            "SELECT MAX(day) FROM checkins WHERE code = ?", (code,)
        ).fetchone()[0]
        if last_done and date.fromisoformat(last_done) > date.fromisoformat(row[1]) + timedelta(days=days - 1):
            raise HTTPException(422, "Нельзя убрать уже отмеченные дни — увеличь длительность")
        conn.execute(
            "UPDATE goals SET title = ?, days = ?, reward = ?, color = ?, shape = ? WHERE code = ?",
            (title[:80], days, update.reward.strip()[:200], color, shape, code),
        )
    return {"ok": True, "code": code}


@app.post("/api/goal/{code}/toggle")
def goal_toggle(code: str, ci: CheckIn):
    g, _ = _goal_row(code)
    if g is None:
        raise HTTPException(404, "Нет такой цели")
    _, _, days, start, *_ = g
    try:
        day = date.fromisoformat(ci.day)
        start_d = date.fromisoformat(start)
    except (ValueError, TypeError):
        raise HTTPException(422, "Некорректная дата")
    # отмечать можно только дни в пределах цели и не в будущем
    if not (start_d <= day <= start_d + timedelta(days=days - 1)):
        raise HTTPException(422, "День вне цели")
    if day > date.today():
        raise HTTPException(422, "Будущее ещё не прожито 🙂")
    with db() as conn:
        exists = conn.execute(
            "SELECT 1 FROM checkins WHERE code = ? AND day = ?", (code, ci.day)
        ).fetchone()
        if exists:
            conn.execute("DELETE FROM checkins WHERE code = ? AND day = ?", (code, ci.day))
            return {"done": False}
        conn.execute("INSERT INTO checkins(code, day) VALUES(?, ?)", (code, ci.day))
    return {"done": True}


@app.post("/api/goal/{code}/join")
def goal_join(code: str, request: Request, owner: OwnerIn | None = None):
    with db() as conn:
        row = conn.execute(
            "SELECT title, days, color, bg, shape, root FROM goals WHERE code = ?", (code,)
        ).fetchone()
        if row is None:
            raise HTTPException(404, "Нет такой цели")
        title, days, color, bg, shape, root = row
        newcode = _gen_code()
        owner_code = _profile_for_token(
            conn, owner.ownerToken if owner else "", create=bool(owner and owner.ownerToken.strip())
        )
        conn.execute(
            "INSERT INTO goals(code, title, days, start, reward, color, bg, shape, root, owner_code) "
            "VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (newcode, title, days, date.today().isoformat(), "", color, bg, shape, root or code, owner_code),
        )
    base = str(request.base_url).rstrip("/")
    return {"code": newcode, "url": f"{base}/g/{newcode}"}


@app.get("/gw/{code}.png")
def goal_wallpaper(code: str):
    g, done = _goal_row(code)
    if g is None:
        raise HTTPException(404, "Нет такой цели")
    _, title, days, start, reward, color, bg, shape, _root = g
    img = render_goal(
        {"title": title, "days": days, "start": start,
         "color": color, "bg": bg, "shape": shape},
        set(done),
    )
    buf = io.BytesIO()
    img.save(buf, "PNG")
    return Response(
        buf.getvalue(),
        media_type="image/png",
        headers={"Cache-Control": "no-store"},  # каждый день/после отметки — свежая картинка
    )


# --- админка (первая сотня управляется руками) ---

ADMIN_PAGE = """<!doctype html><html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Vita — админка</title>
<style>
body {{ background:#000; color:#f2f2f2; font: 14px -apple-system, system-ui, sans-serif; padding: 16px; }}
h1 {{ font-size: 20px; margin-bottom: 14px; }}
.card {{ background:#101012; border:1px solid #232326; border-radius: 14px; padding: 14px; margin-bottom: 12px; }}
.idea {{ font-size: 15px; line-height: 1.45; margin: 6px 0 10px; }}
.review-q {{ font-size: 14px; line-height: 1.45; margin: 8px 0 4px; padding: 8px 12px;
  background:#0d1a12; border-left:2px solid #7fd4a3; border-radius:0 8px 8px 0; color:#cbe9d7; }}
.review-q::before {{ content:"отзыв · "; color:#7fd4a3; font-weight:600; }}
.meta {{ color:#8e8e8e; font-size: 12px; display:flex; gap:12px; flex-wrap:wrap; }}
.meta b {{ color:#d9d9de; }}
.row {{ display:flex; gap:8px; margin-top:10px; flex-wrap:wrap; }}
button {{ background:#232326; color:#f2f2f2; border:0; border-radius:9px; padding:7px 12px; font:inherit; cursor:pointer; }}
input {{ background:#232326; color:#f2f2f2; border:0; border-radius:9px; padding:7px 10px; font:inherit; min-width:0; }}
button:hover {{ background:#2f2f33; }}
button.copy {{ background:#12261a; color:#7fd4a3; }}
button.copy:hover {{ background:#173324; }}
button.copy.done {{ background:#1f7a4d; color:#fff; }}
button.hide {{ background:#2a1418; color:#ff6b81; }}
button.show {{ background:#12261a; color:#7fd4a3; }}
.expired {{ color:#ff6b81; }}
a {{ color:#7fd4a3; }}
</style></head><body><h1>⠿ vita — идеи ({count})</h1>
<div class="card"><b>Подписка по тегу</b>
<div class="row">
  <input id="grantTag" placeholder="@тег" size="14">
  <input id="grantDays" type="number" placeholder="дней (пусто — навсегда)" size="20">
  <button onclick="grant()">Выдать</button>
</div>
<div class="row">
  <input id="handleCode" placeholder="код профиля" size="14">
  <input id="handleValue" placeholder="новый тег" size="14">
  <button onclick="setHandle()">Назначить тег</button>
</div>
</div>
{cards}
<script>
async function ext(code, days) {{
  await fetch(`/admin/extend?token={token}&code=${{code}}&days=${{days}}`, {{ method: 'POST' }});
  location.reload();
}}
async function feedMod(code, hide) {{
  await fetch(`/admin/feed/hide?token={token}&code=${{code}}&hide=${{hide ? 1 : 0}}`, {{ method: 'POST' }});
  location.reload();
}}
async function adminPost(url, okText) {{
  const r = await fetch(url, {{ method: 'POST' }});
  let detail = '';
  try {{ detail = (await r.json()).detail || ''; }} catch (e) {{}}
  alert(r.ok ? okText : (detail || 'Ошибка'));
}}
async function grant() {{
  const tag = document.getElementById('grantTag').value.trim();
  if (!tag) return;
  const days = document.getElementById('grantDays').value.trim() || '0';
  await adminPost(`/admin/grant?token={token}&tag=${{encodeURIComponent(tag)}}&days=${{days}}`,
    days === '0' ? 'Выдано навсегда' : `Выдано на ${{days}} дн.`);
}}
async function setHandle() {{
  const code = document.getElementById('handleCode').value.trim();
  const handle = document.getElementById('handleValue').value.trim();
  if (!code || !handle) return;
  await adminPost(`/admin/handle?token={token}&code=${{encodeURIComponent(code)}}&handle=${{encodeURIComponent(handle)}}`,
    'Тег назначен');
}}
async function copyCard(btn) {{
  const text = btn.dataset.copy;
  try {{
    await navigator.clipboard.writeText(text);
  }} catch (e) {{
    // Safari/HTTP-фолбэк: скрытая textarea + execCommand
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }}
  const label = btn.textContent;
  btn.textContent = '✓ скопировано';
  btn.classList.add('done');
  setTimeout(() => {{ btn.textContent = label; btn.classList.remove('done'); }}, 1500);
}}
</script></body></html>"""


@app.get("/admin")
def admin(token: str = ""):
    if token != ADMIN_TOKEN:
        raise HTTPException(403, "Нет доступа")
    with db() as conn:
        rows = conn.execute(
            "SELECT i.created, i.idea, i.contact, l.code, l.access_until, l.fetches "
            "FROM ideas i JOIN links l ON l.code = i.code ORDER BY i.id DESC"
        ).fetchall()
        rv_rows = conn.execute(
            "SELECT code, text FROM reviews ORDER BY id"
        ).fetchall()
        fw_rows = conn.execute(
            "SELECT contact, created FROM focus_wait ORDER BY created DESC"
        ).fetchall()
        feed_rows = conn.execute(
            "SELECT g.code, g.title, cnt.peers, COALESCE(done.cnt, 0), COALESCE(g.feed_hidden, 0) "
            "FROM (SELECT COALESCE(root, code) AS rc, COUNT(*) AS peers FROM goals GROUP BY rc) cnt "
            "JOIN goals g ON g.code = cnt.rc "
            "LEFT JOIN ("
            "  SELECT COALESCE(g2.root, g2.code) AS rc, COUNT(*) AS cnt "
            "  FROM goals g2 "
            "  WHERE (SELECT COUNT(*) FROM checkins c WHERE c.code = g2.code) >= g2.days "
            "  GROUP BY rc"
            ") done ON done.rc = cnt.rc "
            "WHERE cnt.peers >= 2 "
            "ORDER BY cnt.peers DESC LIMIT 40"
        ).fetchall()
    reviews: dict[str, list[str]] = {}
    for r_code, r_text in rv_rows:
        reviews.setdefault(r_code, []).append(r_text)
    cards = []
    for created, idea, contact, code, access_until, fetches in rows:
        expired, until = _access_state(access_until)
        if until is None:
            status = "навсегда"
            status_txt = "навсегда"
        elif expired:
            status = f'<span class="expired">истёк {until.strftime("%d.%m")}</span>'
            status_txt = f"истёк {until.strftime('%d.%m')}"
        else:
            status = f"до {until.strftime('%d.%m')}"
            status_txt = status
        card_reviews = reviews.get(code, [])
        review_html = "".join(
            f'<div class="review-q">{esc(t)}</div>' for t in card_reviews
        )
        # текст для кнопки «копировать» — чтобы владелец одним тапом кидал идею мне
        copy_lines = [
            f"Vita · идея (код {code})",
            f"Идея: {idea}",
            f"Контакт: {contact}",
            f"Дата: {created} · доступ: {status_txt} · скачиваний: {fetches}",
        ]
        for t in card_reviews:
            copy_lines.append(f"Отзыв: {t}")
        copy_text = "\n".join(copy_lines)
        cards.append(
            f'<div class="card"><div class="meta"><span>{created}</span>'
            f'<span>контакт: <b>{esc(contact)}</b></span>'
            f'<span>доступ: {status}</span><span>скачиваний: {fetches}</span>'
            f'<a href="/w/{code}.png" target="_blank">{code}</a></div>'
            f'<div class="idea">{esc(idea)}</div>{review_html}'
            f'<div class="row">'
            f'<button class="copy" data-copy="{esc(copy_text)}" onclick="copyCard(this)">⧉ Копировать</button>'
            f'<button onclick="ext(\'{code}\', 7)">+7 дней</button>'
            f'<button onclick="ext(\'{code}\', 30)">+месяц</button>'
            f'<button onclick="ext(\'{code}\', 3650)">навсегда</button></div></div>'
        )
    # вейтлист беты Vita Focus — карточкой над идеями (виден только когда кто-то записался)
    focus_block = ""
    if fw_rows:
        items = "".join(
            f'<div>{esc(c)} <span style="color:#8e8e8e">· {cr}</span></div>' for c, cr in fw_rows
        )
        focus_block = (
            f'<div class="card"><div class="meta"><span>🍎 Vita Focus — ждут бету: '
            f'<b>{len(fw_rows)}</b></span></div><div class="idea">{items}</div></div>'
        )
    feed_block = ""
    if feed_rows:
        flines = []
        for fcode, ftitle, fpeers, fdone, fhidden in feed_rows:
            flag = "скрыта" if fhidden else "в ленте"
            if not _feed_title_ok(ftitle):
                flag += " · спам-фильтр"
            btn = (
                f'<button class="show" onclick="feedMod(\'{fcode}\',0)">показать</button>'
                if fhidden else
                f'<button class="hide" onclick="feedMod(\'{fcode}\',1)">скрыть</button>'
            )
            flines.append(
                f'<div style="margin:8px 0"><b>{esc(ftitle)}</b> '
                f'<span style="color:#8e8e8e">· {fpeers} делают · {fdone} закрыли · {flag}</span> '
                f'<a href="/c/{fcode}">{fcode}</a> {btn}</div>'
            )
        feed_block = (
            f'<div class="card"><div class="meta"><span>🔥 Лента — модерация ({len(feed_rows)})</span>'
            f'</div><div class="idea">{"".join(flines)}</div></div>'
        )
    html = ADMIN_PAGE.format(
        count=len(rows),
        cards=focus_block + feed_block + ("".join(cards) or "<p>Пока пусто.</p>"),
        token=ADMIN_TOKEN,
    )
    return HTMLResponse(html)


@app.post("/admin/extend")
def admin_extend(code: str, days: int, token: str = ""):
    if token != ADMIN_TOKEN:
        raise HTTPException(403, "Нет доступа")
    with db() as conn:
        row = conn.execute("SELECT access_until FROM links WHERE code = ?", (code,)).fetchone()
        if row is None:
            raise HTTPException(404, "Нет такой ссылки")
        new_until = _extend(conn, code, days, row[0])
    return {"code": code, "access_until": new_until}


@app.post("/admin/grant")
def admin_grant(tag: str, days: int = 0, token: str = ""):
    """Подписка на обои по тегу: продлевает все обои профиля; days<=0 — навсегда."""
    if token != ADMIN_TOKEN:
        raise HTTPException(403, "Нет доступа")
    handle = tag.strip().lower().removeprefix("@")
    with db() as conn:
        row = conn.execute(
            "SELECT code FROM profiles WHERE handle = ? COLLATE NOCASE", (handle,)
        ).fetchone()
        if row is None:
            raise HTTPException(404, "Нет профиля с таким тегом")
        codes = [c for (c,) in conn.execute(
            "SELECT code FROM links WHERE owner_code = ?", (row[0],)
        )]
        if not codes:
            raise HTTPException(404, "У профиля нет обоев — пусть сначала создаст их")
        if days <= 0:
            conn.execute(
                "UPDATE links SET access_until = NULL WHERE owner_code = ?", (row[0],)
            )
            until = None
        else:
            for code in codes:
                current = conn.execute(
                    "SELECT access_until FROM links WHERE code = ?", (code,)
                ).fetchone()
                until = _extend(conn, code, days, current[0])
    return {"tag": handle, "wallpapers": len(codes), "access_until": until}


@app.post("/admin/handle")
def admin_set_handle(code: str, handle: str, token: str = ""):
    """Назначить профилю тег вручную — единственный путь к зарезервированным (@vit)."""
    if token != ADMIN_TOKEN:
        raise HTTPException(403, "Нет доступа")
    normalized = _normalize_handle(handle)
    with db() as conn:
        if conn.execute("SELECT 1 FROM profiles WHERE code = ?", (code,)).fetchone() is None:
            raise HTTPException(404, "Нет такого профиля")
        occupied = conn.execute(
            "SELECT 1 FROM profiles WHERE handle = ? COLLATE NOCASE AND code != ?",
            (normalized, code),
        ).fetchone()
        if occupied:
            raise HTTPException(409, "Этот тег уже занят")
        conn.execute("UPDATE profiles SET handle = ? WHERE code = ?", (normalized, code))
    return {"code": code, "handle": normalized}


@app.post("/admin/feed/hide")
def admin_feed_hide(code: str, hide: int = 1, token: str = ""):
    """Скрыть/вернуть челлендж в ленту (вся группа по корню)."""
    if token != ADMIN_TOKEN:
        raise HTTPException(403, "Нет доступа")
    with db() as conn:
        row = conn.execute("SELECT root FROM goals WHERE code = ?", (code,)).fetchone()
        if row is None:
            raise HTTPException(404, "Нет такой цели")
        key = _challenge_root(code, row[0])
        conn.execute(
            "UPDATE goals SET feed_hidden = ? WHERE COALESCE(root, code) = ?",
            (1 if hide else 0, key),
        )
    return {"code": code, "hidden": bool(hide)}


# --- «Сетевая блокировка» Vita Focus ---

def _netblock_check(token: str) -> None:
    if not NETBLOCK_TOKEN or token != NETBLOCK_TOKEN:
        raise HTTPException(403, "Неверный токен")


def _netblock_state(conn: sqlite3.Connection) -> dict:
    rows = dict(conn.execute("SELECT app, blocked FROM netblock").fetchall())
    return {app_id: bool(rows.get(app_id, 0)) for app_id in NETBLOCK_APPS}


def _netblock_apps_payload(state: dict) -> list:
    return [
        {"id": app_id, "title": NETBLOCK_APPS[app_id]["title"], "blocked": state[app_id]}
        for app_id in NETBLOCK_APPS
    ]


def _netblock_push(state: dict) -> None:
    """Собирает user-rules из включённых тумблеров и заливает в AdGuard Home."""
    import urllib.request

    rules = [
        f"||{domain}^"
        for app_id, blocked in state.items()
        if blocked
        for domain in NETBLOCK_APPS[app_id]["domains"]
    ]
    req = urllib.request.Request(
        f"{AGH_URL}/control/filtering/set_rules",
        data=json.dumps({"rules": rules}).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=10) as resp:
        resp.read()


@app.options("/api/netblock/{_rest:path}")
def netblock_options(_rest: str):
    return Response(status_code=204, headers=NETBLOCK_CORS)


@app.get("/api/netblock/state")
def netblock_state(token: str = ""):
    _netblock_check(token)
    with db() as conn:
        state = _netblock_state(conn)
    return JSONResponse({"apps": _netblock_apps_payload(state)}, headers=NETBLOCK_CORS)


class NetblockToggleIn(BaseModel):
    token: str = ""
    app: str
    blocked: bool


@app.post("/api/netblock/toggle")
def netblock_toggle(nb: NetblockToggleIn):
    _netblock_check(nb.token)
    if nb.app not in NETBLOCK_APPS:
        raise HTTPException(404, "Неизвестное приложение")
    # Сначала применяем в DNS-фильтре, БД трогаем только после успеха —
    # иначе тумблер в UI разойдётся с реальной блокировкой.
    with db() as conn:
        state = _netblock_state(conn)
    state[nb.app] = nb.blocked
    try:
        _netblock_push(state)
    except Exception:
        raise HTTPException(502, "DNS-фильтр недоступен — тумблер не применился")
    with db() as conn:
        conn.execute(
            "INSERT INTO netblock(app, blocked) VALUES(?, ?) "
            "ON CONFLICT(app) DO UPDATE SET blocked = excluded.blocked",
            (nb.app, 1 if nb.blocked else 0),
        )
    return JSONResponse({"apps": _netblock_apps_payload(state)}, headers=NETBLOCK_CORS)


@app.get("/api/netblock/profile")
def netblock_profile(pin: str = ""):
    """DNS-профиль (.mobileconfig): DoH на наш фильтр.

    com.apple.profileRemovalPassword iOS принимает только на supervised-устройствах
    (Apple Configurator), поэтому пароль на снятие добавляем лишь по явному ?pin=.
    """
    if pin and not re.fullmatch(r"\d{4,6}", pin):
        raise HTTPException(422, "PIN — 4–6 цифр")
    import plistlib
    import uuid as uuidlib

    def stable_uuid(name: str) -> str:
        return str(uuidlib.uuid5(uuidlib.NAMESPACE_DNS, f"netblock.vitadots.ru/{name}")).upper()

    description = (
        "DNS-фильтр Vita Focus: выключает ленты выбранных приложений. "
        "Управление — тумблеры в Vita Focus."
    )
    payload_content = [
        {
            "PayloadType": "com.apple.dnsSettings.managed",
            "PayloadIdentifier": "ru.vitadots.netblock.dns",
            "PayloadUUID": stable_uuid("dns"),
            "PayloadVersion": 1,
            "PayloadDisplayName": "Vita DNS-фильтр",
            "DNSSettings": {
                "DNSProtocol": "HTTPS",
                "ServerURL": NETBLOCK_DOH_URL,
            },
        },
    ]
    if pin:
        description += " Снятие профиля — только по твоему PIN."
        payload_content.append(
            {
                "PayloadType": "com.apple.profileRemovalPassword",
                "PayloadIdentifier": "ru.vitadots.netblock.removalpin",
                "PayloadUUID": stable_uuid("removalpin"),
                "PayloadVersion": 1,
                "PayloadDisplayName": "Пароль снятия профиля",
                "RemovalPassword": pin,
            }
        )
    payload = {
        "PayloadType": "Configuration",
        "PayloadIdentifier": "ru.vitadots.netblock",
        "PayloadUUID": stable_uuid("root"),
        "PayloadVersion": 1,
        "PayloadDisplayName": "Vita Блокировка",
        "PayloadDescription": description,
        "PayloadOrganization": "Vita",
        "PayloadContent": payload_content,
    }
    return Response(
        plistlib.dumps(payload),
        media_type="application/x-apple-aspen-config",
        headers={"Content-Disposition": 'attachment; filename="vita-netblock.mobileconfig"'},
    )


app.mount("/static", StaticFiles(directory=ROOT / "static"), name="static")
