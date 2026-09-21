"""Vita — сайт-генератор обоев «жизнь в точках» + персональные ссылки для автообоев."""
import io
import hashlib
import hmac
import json
import os
import re
import secrets
import sqlite3
import threading
import time
from collections import defaultdict, deque
from contextlib import asynccontextmanager, contextmanager
from datetime import date, timedelta
from html import escape as esc
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from starlette.exceptions import HTTPException as StarletteHTTPException
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, RedirectResponse, Response
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from PIL import Image, ImageOps

from . import billing
from .render import SHAPES, place_cfg, render_goal, render_wallpaper

ROOT = Path(__file__).resolve().parent.parent
# VITA_DATA — переопределение каталога данных (dev/тесты не трогают боевую БД)
DATA = Path(os.environ.get("VITA_DATA") or (ROOT / "data"))
DATA.mkdir(parents=True, exist_ok=True)
DB_PATH = DATA / "vita.db"

CODE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"
HANDLE_RE = re.compile(r"[a-z][a-z0-9_]{1,22}[a-z0-9]")
HANDLE_RULE = ("Тег: 3–24 знака, только латиница, цифры и _. "
               "Начинается с буквы, кончается буквой или цифрой")
# Тег (бывший «ник») — уникальный @идентификатор профиля.
# Профиль с тегом владельца получает плашку «Разработчик Vita».
DEVELOPER_HANDLE = "vit"
# Зарезервированные теги выдаются только через /admin/handle.
RESERVED_HANDLES = {DEVELOPER_HANDLE, "vita", "vitadots", "admin", "support"}
# Тег выбирается один раз при регистрации, потом его можно поменять дважды.
HANDLE_CHANGE_LIMIT = 1

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

# Вход через телеграм. Токен и имя бота — из .env; пусто = кнопки входа нет,
# человек остаётся на ключе восстановления.
# VITA_DEV=1 — локальный запуск: статика отдаётся без долгого кэша
DEV_MODE = os.environ.get("VITA_DEV", "").strip() == "1"

TG_BOT_TOKEN = os.environ.get("TG_BOT_TOKEN", "").strip()
TG_BOT_NAME = os.environ.get("TG_BOT_NAME", "").strip().lstrip("@")
# Чат Vita, куда бот пересказывает отзывы со звёздами. Пусто = отзывы видны
# только в админке. Ставит его на сервере scripts/reviews-chat.sh.
TG_REVIEWS_CHAT = os.environ.get("TG_REVIEWS_CHAT", "").strip()
# адрес сайта снаружи: по нему телеграм приносит боту «Старт» (вебхук)
PUBLIC_URL = os.environ.get("PUBLIC_URL", "https://vitadots.ru").strip().rstrip("/")
TG_LOGIN_TTL = 1800  # ссылка входа через бота живёт полчаса

# Письма (код на смену забытого пароля). Ключи — в .env на сервере, пусто =
# писем нет и код уходит в телеграм, как раньше. Отправлять умеем двумя путями:
# по HTTP у RuSender (порт 443) и обычным SMTP. Хостинг режет 25/465/587,
# поэтому SMTP только на 2525, а надёжнее всего путь по HTTP.
RUSENDER_KEY = os.environ.get("RUSENDER_KEY", "").strip()
RUSENDER_SEND_KEY = os.environ.get("RUSENDER_SEND_KEY", "").strip()
RUSENDER_URL = "https://api.rusender.ru/api/v1/external-mails/send"

SMTP_HOST = os.environ.get("SMTP_HOST", "").strip()
try:
    SMTP_PORT = int(os.environ.get("SMTP_PORT", "").strip() or 2525)
except ValueError:      # опечатка в .env не должна ронять весь сайт
    SMTP_PORT = 2525
SMTP_USER = os.environ.get("SMTP_USER", "").strip()
SMTP_PASS = os.environ.get("SMTP_PASS", "")

# адрес в поле «От кого»: у сервиса он должен быть на подтверждённом домене
MAIL_FROM = os.environ.get("MAIL_FROM", "").strip() or SMTP_USER
MAIL_FROM_NAME = os.environ.get("MAIL_FROM_NAME", "Vita").strip()
MAIL_ON = bool(MAIL_FROM and (
    (RUSENDER_KEY and RUSENDER_SEND_KEY) or (SMTP_HOST and SMTP_USER and SMTP_PASS)
))

RESET_TTL = 900      # код на смену пароля живёт 15 минут
RESET_RESEND = 60    # и повторное письмо не раньше чем через минуту

# реквизиты для оферты и чеков: держим в .env, репозиторий публичный
SELLER_NAME = os.environ.get("SELLER_NAME", "")
SELLER_INN = os.environ.get("SELLER_INN", "")
SUPPORT_CONTACT = os.environ.get("SUPPORT_CONTACT", "")
# Подтверждение прав на сайт в Search Console и Вебмастере. Коды выдают сами
# панели, поэтому держим их в .env и вклеиваем в <head> главной.
GOOGLE_VERIFY = os.environ.get("GOOGLE_VERIFY", "").strip()
YANDEX_VERIFY = os.environ.get("YANDEX_VERIFY", "").strip()

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


def _init_schema(conn: sqlite3.Connection) -> None:
    """Схема и миграции. Гоняются один раз на процесс, а не на каждый запрос."""
    conn.execute("PRAGMA journal_mode = WAL")  # чтение не ждёт запись — важно под нагрузкой
    conn.execute("PRAGMA synchronous = NORMAL")
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
        # сколько раз человек менял тег и выбирал ли он его вообще
        "handle_changes INTEGER NOT NULL DEFAULT 0",
        "handle_custom INTEGER NOT NULL DEFAULT 0",
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
    # Одна строка означает выданный владельцем доступ. NULL = бессрочно;
    # отсутствие строки = обычный пробный период. Право хранится у профиля,
    # поэтому действует и на будущие обои, а не только на уже созданные ссылки.
    conn.execute(
        "CREATE TABLE IF NOT EXISTS profile_access("
        "profile_code TEXT PRIMARY KEY, access_until TEXT, "
        "updated TEXT NOT NULL DEFAULT (datetime('now')))"
    )
    # Заказы Робокассы. id = InvId счёта; оплаченный заказ навсегда открывает
    # доступ профилю. Почта нужна для чека и чтобы вернуть человеку доступ,
    # если он потеряет свой Vita ID.
    conn.execute(
        "CREATE TABLE IF NOT EXISTS orders("
        "id INTEGER PRIMARY KEY AUTOINCREMENT, profile_code TEXT NOT NULL, "
        "amount TEXT NOT NULL, email TEXT NOT NULL DEFAULT '', "
        "status TEXT NOT NULL DEFAULT 'new', "
        "created TEXT NOT NULL DEFAULT (datetime('now')), paid_at TEXT)"
    )
    conn.execute("CREATE INDEX IF NOT EXISTS orders_profile ON orders(profile_code)")
    # Вход через телеграм: один аккаунт телеграма = один профиль Vita.
    conn.execute(
        "CREATE TABLE IF NOT EXISTS profile_telegram("
        "tg_id TEXT PRIMARY KEY, profile_code TEXT NOT NULL, "
        "username TEXT NOT NULL DEFAULT '', name TEXT NOT NULL DEFAULT '', "
        "created TEXT NOT NULL DEFAULT (datetime('now')))"
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS profile_telegram_profile ON profile_telegram(profile_code)"
    )
    # Вход через бота: сайт заводит пару «старт + секрет», бот по /start
    # отмечает, какой телеграм её подтвердил, а страница забирает вход секретом.
    conn.execute(
        "CREATE TABLE IF NOT EXISTS tg_login("
        "start TEXT PRIMARY KEY, secret_hash TEXT NOT NULL, created REAL NOT NULL, "
        "tg_id TEXT NOT NULL DEFAULT '', username TEXT NOT NULL DEFAULT '', "
        "name TEXT NOT NULL DEFAULT '', confirmed REAL)"
    )
    # чаты, куда добавили бота: из них скрипт выбирает чат для отзывов
    conn.execute(
        "CREATE TABLE IF NOT EXISTS tg_chats("
        "chat_id TEXT PRIMARY KEY, kind TEXT NOT NULL DEFAULT '', "
        "title TEXT NOT NULL DEFAULT '', seen TEXT NOT NULL DEFAULT (datetime('now')))"
    )
    # Вход по почте — вторая дверь в тот же аккаунт рядом с телеграмом.
    # Сам пароль не хранится: только своя соль и scrypt-отпечаток, так что
    # даже с базой в руках его не прочитать.
    conn.execute(
        "CREATE TABLE IF NOT EXISTS profile_auth("
        "email TEXT PRIMARY KEY, profile_code TEXT NOT NULL, "
        "pass_salt TEXT NOT NULL, pass_hash TEXT NOT NULL, "
        "created TEXT NOT NULL DEFAULT (datetime('now')))"
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS profile_auth_profile ON profile_auth(profile_code)"
    )
    # одноразовые коды на смену забытого пароля
    conn.execute(
        "CREATE TABLE IF NOT EXISTS auth_reset("
        "email TEXT PRIMARY KEY, code_hash TEXT NOT NULL, "
        "expires REAL NOT NULL, tries INTEGER NOT NULL DEFAULT 0)"
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
    try:  # оценка звёздами появилась позже самих отзывов
        conn.execute("ALTER TABLE reviews ADD COLUMN stars INTEGER NOT NULL DEFAULT 0")
    except sqlite3.OperationalError:
        pass
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
    conn.commit()


_schema_lock = threading.Lock()
# помечаем по пути файла: тесты подменяют DB_PATH, и новой базе схема тоже нужна
_schema_ready: set[str] = set()


@contextmanager
def db():
    """Соединение на запрос: транзакция закрывается, файл — тоже.

    busy_timeout вместо мгновенной ошибки «database is locked»: под сотней
    человек параллельные записи неизбежны, лучше подождать 20 секунд, чем упасть.
    """
    path = str(DB_PATH)
    conn = sqlite3.connect(DB_PATH, timeout=20)
    try:
        conn.execute("PRAGMA busy_timeout = 20000")
        if path not in _schema_ready:
            with _schema_lock:
                if path not in _schema_ready:
                    _init_schema(conn)
                    _schema_ready.add(path)
        with conn:  # коммит на выходе, откат при исключении — как было раньше
            yield conn
    finally:
        conn.close()


class LinkIn(BaseModel):
    mode: str = "month"
    color: str = "#f2f2f2"
    bg: str = "black"
    bgImage: str = ""
    bgColor: str = "#101014"
    shape: str = "circle"
    glass: bool = False
    glow: bool = False     # свечение точек (стиль «Светятся», тема «Туман»)
    title: str = ""
    font: str = "system"
    # цвета текста задаёт тема; пусто — заголовок цветом точек, подписи серым
    textColor: str = ""
    textMuted: str = ""
    textStroke: str = ""
    footer: bool = True
    brand: bool = True  # лого vita на обоях; в render.py уже есть cfg.get("brand", True)
    birth: str = "2000-01-01"
    start: str = ""
    end: str = ""
    # расположение: свои координаты, размер и число точек в ряду у каждого
    # элемента обоев. Пусто — всё стоит как раньше (см. render.place_cfg)
    place: dict = {}
    idea: str = ""
    contact: str = ""
    ownerToken: str = ""


class BuyIn(BaseModel):
    ownerToken: str = ""
    email: str = ""


class ReviewIn(BaseModel):
    code: str
    text: str = ""
    stars: int = 0


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
    if HANDLE_RE.fullmatch(handle) is None or "__" in handle:
        raise HTTPException(422, HANDLE_RULE)
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
        "SELECT handle, name, bio, avatar_id, settings, created, handle_changes, "
        "handle_custom FROM profiles WHERE code = ?",
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
        "handleLocked": bool(row[7]) and (row[6] or 0) >= HANDLE_CHANGE_LIMIT,
        "handleLeft": (
            HANDLE_CHANGE_LIMIT if not row[7] else max(0, HANDLE_CHANGE_LIMIT - (row[6] or 0))
        ),
        "goals": goals,
        "wallpapers": wallpapers,
        "posts": posts,
        "created": row[5],
    }


@asynccontextmanager
async def _lifespan(_app):
    # при старте говорим телеграму, куда нести апдейты бота
    _tg_hook_register()
    yield


app = FastAPI(title="vita", lifespan=_lifespan)
# CSS и JS уходили на телефон несжатыми: gzip режет их примерно вчетверо
app.add_middleware(GZipMiddleware, minimum_size=700)


# Сколько раз с одного адреса можно дёргать дорогие ручки: (запросов, секунд).
# Считаем в памяти процесса — против случайного шквала и простых скриптов
# этого хватает, а серьёзный поток всё равно режется на уровне Caddy.
RATE_RULES = {
    "/api/link": (30, 3600),
    "/api/buy": (10, 3600),
    "/api/goal": (30, 3600),
    "/api/upload-bg": (25, 3600),
    "/api/upload-post-image": (25, 3600),
    "/api/profile/avatar": (25, 3600),
    "/api/feed-post": (15, 3600),
    "/api/review": (10, 3600),
    "/api/focus-wait": (10, 3600),
    # вход и пароли: подбирать перебором должно быть скучно
    "/api/auth/register": (8, 900),
    "/api/auth/login": (12, 300),
    "/api/auth/forgot": (5, 900),
    "/api/auth/reset": (10, 600),
    # вход через бота: пару заводим при показе кнопки, спрашиваем, пока человек в телеграме
    "/api/auth/tg/start": (40, 600),
    "/api/auth/tg/check": (900, 600),
}
_rate_hits: dict = defaultdict(deque)
_rate_lock = threading.Lock()


def _rate_ok(key: str, limit: int, window: int) -> bool:
    now = time.monotonic()
    with _rate_lock:
        hits = _rate_hits[key]
        while hits and now - hits[0] > window:
            hits.popleft()
        if len(hits) >= limit:
            return False
        hits.append(now)
        if len(_rate_hits) > 20000:  # страховка от роста словаря
            for stale in [k for k, v in _rate_hits.items() if not v][:5000]:
                del _rate_hits[stale]
        return True


# Заголовки безопасности: сканеры репутации их проверяют, а браузеру они
# запрещают угадывать типы файлов и утекать адрес страницы на чужие сайты.
SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Frame-Options": "SAMEORIGIN",
    "Permissions-Policy": "geolocation=(), microphone=(), camera=(), payment=()",
    "Strict-Transport-Security": "max-age=31536000",
}


@app.middleware("http")
async def rate_limit(request: Request, call_next):
    rule = RATE_RULES.get(request.url.path)
    if rule and request.method == "POST":
        ip = request.client.host if request.client else "unknown"
        if not _rate_ok(f"{request.url.path}|{ip}", *rule):
            return JSONResponse(
                {"detail": "Слишком много запросов подряд — подожди немного и повтори"},
                status_code=429,
            )
    response = await call_next(request)
    for name, value in SECURITY_HEADERS.items():
        response.headers.setdefault(name, value)
    path = request.url.path
    if path.startswith("/static/") or path.startswith("/media/"):
        response.headers.setdefault(
            "Cache-Control",
            "no-cache" if DEV_MODE else "public, max-age=31536000, immutable",
        )
    return response


@app.get("/healthz")
def healthz():
    """Живость для мониторинга: база отвечает — значит сервис на ходу."""
    with db() as conn:
        conn.execute("SELECT 1").fetchone()
    return {"ok": True}


@app.get("/")
def index():
    # HTML не кэшируем: статика версионируется (?v=N), а страница всегда свежая
    return _page("index.html")


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
    # В поиске нужна одна Vita — главная. Служебные страницы (лента, цели,
    # политика, отложенный Focus) только размывали выдачу: человек искал сайт,
    # а первой строкой ему попадалась «Vita — конфиденциальность».
    urls = "".join(
        f"<url><loc>https://vitadots.ru/{p}</loc></url>"
        for p in ("", "register", "login", "buy")
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
    # 7 дней пробы получают все и сразу: анкета на входе резала конверсию
    # с роликов. Идея и контакт остались добровольными — пишем, если оставили.
    idea, contact = cfg.idea.strip()[:500], cfg.contact.strip()[:64]
    if cfg.bg == "custom":
        if not cfg.bgImage or not re.fullmatch(r"[a-z0-9]{6}", cfg.bgImage):
            raise HTTPException(422, "Загрузи своё фото для фона")
        if not (DATA / "bg" / f"{cfg.bgImage}.jpg").exists():
            raise HTTPException(422, "Фото не найдено — выбери снова")
    code = "".join(secrets.choice(CODE_ALPHABET) for _ in range(6))
    trial_until = (date.today() + timedelta(days=TRIAL_DAYS)).isoformat()
    cfg.title = cfg.title[:200]  # поле в браузере можно обойти, длину режем тут
    cfg.place = place_cfg(cfg.place)  # в базу кладём только разобранное, без мусора
    for field in ("textColor", "textMuted", "textStroke"):
        if not re.fullmatch(r"#[0-9a-fA-F]{6}", getattr(cfg, field) or ""):
            setattr(cfg, field, "")
    config = json.dumps(cfg.model_dump(exclude={"idea", "contact", "ownerToken"}), ensure_ascii=False)
    with db() as conn:
        owner_code = _profile_for_token(conn, cfg.ownerToken, create=bool(cfg.ownerToken.strip()))
        until = _effective_access_until(conn, trial_until, owner_code)
        conn.execute(
            "INSERT INTO links(code, config, access_until, owner_code) VALUES(?, ?, ?, ?)",
            (code, config, until, owner_code),
        )
        if idea or contact:
            conn.execute(
                "INSERT INTO ideas(code, idea, contact) VALUES(?, ?, ?)",
                (code, idea, contact),
            )
    base = str(request.base_url).rstrip("/")
    return {"code": code, "url": f"{base}/w/{code}.png", "setup": f"{base}/s/{code}", "until": until}


@app.get("/api/link/{code}")
def link_config(code: str):
    """Настройки обоев для конструктора: по ссылке «поделиться» и по карандашу.

    Отдаём только внешний вид. Сами обои и так лежат открытой картинкой на
    /w/<code>.png, так что ничего нового тут не раскрывается.
    """
    if not re.fullmatch(r"[a-z0-9]{6}", code):
        raise HTTPException(404, "Нет такой ссылки")
    with db() as conn:
        row = conn.execute("SELECT config FROM links WHERE code = ?", (code,)).fetchone()
    if row is None:
        raise HTTPException(404, "Нет такой ссылки")
    try:
        cfg = json.loads(row[0])
    except ValueError:
        raise HTTPException(404, "Настройки потерялись")
    return {"code": code, "config": cfg}


@app.delete("/api/link/{code}")
def drop_link(code: str, ownerToken: str = ""):
    """Убрать обои из «Моих обоев». Удаляем только свои."""
    if not re.fullmatch(r"[a-z0-9]{6}", code):
        raise HTTPException(404, "Нет такой ссылки")
    with db() as conn:
        owner = _profile_for_token(conn, ownerToken, create=False)
        if not owner:
            raise HTTPException(403, "Это не твои обои")
        row = conn.execute("SELECT owner_code FROM links WHERE code = ?", (code,)).fetchone()
        if row is None:
            raise HTTPException(404, "Нет такой ссылки")
        if (row[0] or "") != owner:
            raise HTTPException(403, "Это не твои обои")
        conn.execute("DELETE FROM links WHERE code = ?", (code,))
    return {"ok": True}


@app.get("/api/tag-free")
def tag_free(tag: str = ""):
    """Свободен ли тег. Человек должен видеть это до «Сохранить», а не после."""
    handle = tag.strip().lstrip("@").lower()
    if HANDLE_RE.fullmatch(handle) is None or "__" in handle:
        return {"tag": handle, "ok": False, "free": False,
                "why": "3–24 знака: латиница, цифры и _, начинать с буквы"}
    with db() as conn:
        taken = conn.execute(
            "SELECT 1 FROM profiles WHERE handle = ? COLLATE NOCASE", (handle,)
        ).fetchone()
    return {"tag": handle, "ok": True, "free": not taken,
            "why": "" if not taken else "Этот тег уже занят"}


@app.get("/bg/{name}")
def bg_image(name: str):
    """Своё фото фона. Оно и так впечатано в открытую картинку обоев —
    конструктору оно нужно, чтобы показать чужую сборку по ссылке."""
    ident = name[:-4] if name.endswith(".jpg") else name
    if not re.fullmatch(r"[a-z0-9]{6}", ident):
        raise HTTPException(404, "Нет такого фона")
    path = DATA / "bg" / f"{ident}.jpg"
    if not path.exists():
        raise HTTPException(404, "Нет такого фона")
    return FileResponse(path, media_type="image/jpeg",
                        headers={"Cache-Control": "public, max-age=31536000, immutable"})


@app.post("/api/review")
def create_review(rv: ReviewIn):
    text = rv.text.strip()
    if len(text) < 15:
        raise HTTPException(422, "Напиши чуть подробнее — хотя бы строчку живого текста")
    with db() as conn:
        row = conn.execute(
            "SELECT access_until, review_at, owner_code FROM links WHERE code = ?", (rv.code,)
        ).fetchone()
        if row is None:
            raise HTTPException(404, "Нет такой ссылки")
        if row[1]:  # вторую неделю уже дарили
            raise HTTPException(409, "Вторая неделя уже активирована — спасибо, что остаёшься 🙏")
        effective_until = _effective_access_until(conn, row[0], row[2])
        if effective_until is None:
            raise HTTPException(409, "Бессрочный доступ уже активен")
        stars = min(5, max(0, int(rv.stars or 0)))
        conn.execute(
            "INSERT INTO reviews(code, text, stars) VALUES(?, ?, ?)", (rv.code, text, stars)
        )
        conn.execute(
            "UPDATE links SET review_at = datetime('now') WHERE code = ?", (rv.code,)
        )
        new_until = _extend(conn, rv.code, REVIEW_DAYS, effective_until)
        nick = _review_nick(conn, row[2])
    if TG_REVIEWS_CHAT:
        # в чат Vita — фоном: телеграм может думать секунды, человек ждать не должен
        _in_background(_tg_send, TG_REVIEWS_CHAT, _review_note(stars, nick, text))
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


def _profile_access_override(
    conn: sqlite3.Connection, profile_code: str | None
) -> tuple[bool, str | None]:
    """(есть профильное право, срок). @vit всегда имеет бессрочное право."""
    if not profile_code:
        return False, None
    profile = conn.execute(
        "SELECT handle FROM profiles WHERE code = ?", (profile_code,)
    ).fetchone()
    if profile is None:
        return False, None
    if (profile[0] or "").strip().lower() == DEVELOPER_HANDLE:
        return True, None
    grant = conn.execute(
        "SELECT access_until FROM profile_access WHERE profile_code = ?", (profile_code,)
    ).fetchone()
    return (False, None) if grant is None else (True, grant[0])


def _effective_access_until(
    conn: sqlite3.Connection,
    link_access_until: str | None,
    profile_code: str | None,
) -> str | None:
    """Совмещает срок ссылки с правом профиля; NULL означает бессрочно."""
    granted, profile_until = _profile_access_override(conn, profile_code)
    if not granted:
        return link_access_until
    if profile_until is None or link_access_until is None:
        return None
    _, link_date = _access_state(link_access_until)
    _, profile_date = _access_state(profile_until)
    if link_date is None or profile_date is None:
        return None
    return max(link_date, profile_date).isoformat()


def _extend(conn: sqlite3.Connection, code: str, days: int, current: str | None) -> str:
    """Продлить доступ от максимума (сегодня, текущий срок). Возвращает новую дату ISO."""
    _, until = _access_state(current)
    base = max(date.today(), until) if until else date.today()
    new_until = (base + timedelta(days=days)).isoformat()
    conn.execute("UPDATE links SET access_until = ? WHERE code = ?", (new_until, code))
    return new_until



EMAIL_RE = re.compile(r"[^@\s]+@[^@\s.]+\.[a-zA-Z]{2,}")


def _grant_forever(conn: sqlite3.Connection, profile_code: str) -> None:
    """Вечная покупка: право у профиля + все его текущие обои и цели оживают."""
    conn.execute(
        "INSERT INTO profile_access(profile_code, access_until) VALUES(?, NULL) "
        "ON CONFLICT(profile_code) DO UPDATE SET "
        "access_until = NULL, updated = datetime('now')",
        (profile_code,),
    )
    conn.execute("UPDATE links SET access_until = NULL WHERE owner_code = ?", (profile_code,))


def _profile_access_state(conn: sqlite3.Connection, profile_code: str | None) -> dict:
    """Что показывать человеку про его доступ: куплен, идёт проба или всё кончилось."""
    state = {
        "paid": False,
        "code": "",
        "telegram": "",
        "email": "",
        "tgBot": TG_BOT_NAME,
        "tgBotId": TG_BOT_TOKEN.split(":")[0] if TG_BOT_TOKEN else "",
        "until": None,
        "expired": False,
        "price": billing.PRICE,
        "payable": billing.enabled(),
    }
    if not profile_code:
        return state
    state["code"] = profile_code
    state["telegram"] = _telegram_handle(conn, profile_code)
    row = conn.execute(
        "SELECT email FROM profile_auth WHERE profile_code = ?", (profile_code,)
    ).fetchone()
    state["email"] = row[0] if row else ""
    granted, granted_until = _profile_access_override(conn, profile_code)
    if granted and granted_until is None:
        state["paid"] = True
        return state
    best: date | None = None
    rows = [granted_until] if granted else []
    rows += [
        value for (value,) in conn.execute(
            "SELECT access_until FROM links WHERE owner_code = ?", (profile_code,)
        )
    ]
    for value in rows:
        if value is None:
            state["paid"] = True
            return state
        _, until = _access_state(value)
        if until and (best is None or until > best):
            best = until
    if best is None:
        return state
    state["until"] = best.isoformat()
    state["expired"] = date.today() > best
    return state


TG_FIELDS = ("id", "first_name", "last_name", "username", "photo_url", "auth_date")


def _telegram_check(data: dict) -> dict | None:
    """Подпись телеграма: HMAC-SHA256 по полям, ключ — SHA256 токена бота.

    Возвращает данные пользователя или None. Подделать нельзя, не зная токена;
    просроченные больше суток подтверждения тоже отбрасываем.
    """
    if not TG_BOT_TOKEN:
        return None
    received = str(data.get("hash") or "")
    fields = {k: data[k] for k in TG_FIELDS if data.get(k) not in (None, "")}
    if not received or "id" not in fields or "auth_date" not in fields:
        return None
    check = "\n".join(f"{k}={fields[k]}" for k in sorted(fields))
    secret = hashlib.sha256(TG_BOT_TOKEN.encode("utf-8")).digest()
    calc = hmac.new(secret, check.encode("utf-8"), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(calc, received.lower()):
        return None
    try:
        if abs(time.time() - int(fields["auth_date"])) > 86400:
            return None
    except (TypeError, ValueError):
        return None
    return fields


def _telegram_handle(conn: sqlite3.Connection, profile_code: str | None) -> str:
    if not profile_code:
        return ""
    row = conn.execute(
        "SELECT username, name FROM profile_telegram WHERE profile_code = ?", (profile_code,)
    ).fetchone()
    if row is None:
        return ""
    return ("@" + row[0]) if row[0] else (row[1] or "телеграм")


@app.post("/api/auth/telegram")
async def auth_telegram(request: Request):
    """Вход через телеграм. Первый раз — привязывает профиль этого браузера,
    дальше — возвращает человека в его же аккаунт на любом устройстве."""
    if not TG_BOT_TOKEN:
        raise HTTPException(503, "Вход через телеграм ещё не подключён")
    try:
        payload = await request.json()
    except ValueError:
        raise HTTPException(422, "Не разобрали ответ телеграма")
    if not isinstance(payload, dict):
        raise HTTPException(422, "Не разобрали ответ телеграма")
    data = _telegram_check(payload)
    if data is None:
        raise HTTPException(403, "Телеграм не подтвердил вход — попробуй ещё раз")
    tg_id = str(data["id"])
    username = str(data.get("username") or "")[:64]
    name = " ".join(
        str(data.get(k) or "") for k in ("first_name", "last_name")
    ).strip()[:80]
    owner_token = str(payload.get("ownerToken") or "")
    with db() as conn:
        body, token = _telegram_enter(conn, tg_id, username, name, owner_token)
    return _with_session(body, token)


def _telegram_enter(
    conn: sqlite3.Connection, tg_id: str, username: str, name: str, owner_token: str
) -> tuple[dict, str]:
    """Вход подтверждённым телеграмом — общий для виджета и для бота."""
    row = conn.execute(
        "SELECT profile_code FROM profile_telegram WHERE tg_id = ?", (tg_id,)
    ).fetchone()
    if row:
        # уже входил — возвращаем в его аккаунт, даже если браузер чужой
        profile_code = row[0]
        conn.execute(
            "UPDATE profile_telegram SET username = ?, name = ? WHERE tg_id = ?",
            (username, name, tg_id),
        )
        linked = False
    else:
        # первый вход: закрепляем за телеграмом тот профиль, что уже есть в браузере
        profile_code = _profile_for_token(conn, owner_token, create=True)
        conn.execute(
            "INSERT INTO profile_telegram(tg_id, profile_code, username, name) "
            "VALUES(?, ?, ?, ?)",
            (tg_id, profile_code, username, name),
        )
        linked = True
    # новый ключ устройства: старый остаётся жить, если это то же самое устройство
    token = _issue_device(conn, profile_code)
    return {
        "token": token,
        "linked": linked,
        "telegram": ("@" + username) if username else (name or "телеграм"),
        "profile": _profile_payload(conn, profile_code),
        "access": _profile_access_state(conn, profile_code),
    }, token


# ---------- вход через бота ----------
# Кнопка на сайте — ссылка t.me/бот?start=<старт>. Человек жмёт «Старт»,
# телеграм приносит /start <старт> на вебхук, мы отмечаем, чей это телеграм.
# Страница всё это время спрашивает сервер секретом, который знает только она,
# и, как только старт подтверждён, получает ключ устройства и куку.

class TgCheckIn(BaseModel):
    start: str = ""
    secret: str = ""
    ownerToken: str = ""


TG_START_RE = re.compile(r"/start(?:@\w+)?(?:\s+([A-Za-z0-9_-]{8,64}))?\s*")
TG_COMMAND_RE = re.compile(r"/(\w+)(?:@\w+)?(?:\s+(\w+))?\s*")
TG_SCREENS = ("menu", "products", "about")
TG_GONE = "Ссылка устарела — нажми кнопку ещё раз"


def _tg_hook_secret() -> str:
    """Пароль вебхука: телеграм кладёт его в заголовок каждого апдейта.
    Выводим из токена бота — отдельный ключ в .env не нужен."""
    if not TG_BOT_TOKEN:
        return ""
    return hmac.new(TG_BOT_TOKEN.encode("utf-8"), b"vita-webhook", hashlib.sha256).hexdigest()


@app.post("/api/auth/tg/start")
def auth_tg_start():
    """Пара для кнопки: старт уходит в ссылку t.me и виден телеграму, секрет
    остаётся в браузере — без него вход не забрать, даже зная ссылку."""
    if not (TG_BOT_TOKEN and TG_BOT_NAME):
        raise HTTPException(503, "Вход через телеграм ещё не подключён")
    start = secrets.token_urlsafe(18)
    secret = secrets.token_urlsafe(24)
    now = time.time()
    with db() as conn:
        conn.execute("DELETE FROM tg_login WHERE created < ?", (now - 2 * TG_LOGIN_TTL,))
        conn.execute(
            "INSERT INTO tg_login(start, secret_hash, created) VALUES(?, ?, ?)",
            (start, _token_hash(secret), now),
        )
    return {
        "start": start,
        "secret": secret,
        "link": f"https://t.me/{TG_BOT_NAME}?start={start}",
        "ttl": TG_LOGIN_TTL,
    }


@app.post("/api/auth/tg/check")
def auth_tg_check(data: TgCheckIn):
    """Страница спрашивает, нажал ли человек «Старт». Нажал — входит."""
    start = data.start.strip()[:64]
    with db() as conn:
        row = conn.execute(
            "SELECT secret_hash, created, tg_id, username, name, confirmed "
            "FROM tg_login WHERE start = ?", (start,),
        ).fetchone()
        if row is None or not hmac.compare_digest(row[0], _token_hash(data.secret.strip())):
            raise HTTPException(410, TG_GONE)
        if not row[5]:
            if time.time() - row[1] > TG_LOGIN_TTL:
                raise HTTPException(410, TG_GONE)
            return {"wait": True}
        # пара одноразовая: второй запрос с тем же секретом войти уже не сможет
        if conn.execute("DELETE FROM tg_login WHERE start = ?", (start,)).rowcount != 1:
            raise HTTPException(410, TG_GONE)
        body, token = _telegram_enter(conn, row[2], row[3], row[4], data.ownerToken)
    return _with_session(body, token)


@app.post("/tg/hook")
async def tg_hook(request: Request):
    """Апдейты бота. Без пароля из setWebhook сюда не достучаться."""
    secret = _tg_hook_secret()
    got = request.headers.get("x-telegram-bot-api-secret-token", "")
    if not secret or not hmac.compare_digest(got, secret):
        raise HTTPException(403, "forbidden")
    try:
        update = await request.json()
    except ValueError:
        return {"ok": True}
    # ответ сразу в теле вебхука: сообщение отправит сам телеграм
    return (_tg_update(update) if isinstance(update, dict) else None) or {"ok": True}


def _tg_reply(chat_id, text: str) -> dict:
    return {"method": "sendMessage", "chat_id": chat_id, "text": text, "parse_mode": "HTML"}


def _tg_screen(name: str) -> dict:
    """Экран бота: меню, «Продукты» или «О нас» — текст и кнопки под ним.
    Между экранами ходим правкой одного сообщения, чат не засоряется."""
    site = PUBLIC_URL
    price = esc(str(billing.PRICE))
    make = {"text": "Сделать обои", "url": site}
    back = {"text": "← Назад", "callback_data": "menu"}
    if name == "products":
        text = (
            "<b>Продукты</b>\n\n"
            "<b>Живые обои</b>\n"
            "Ночью сервер закрашивает новую точку, а ярлык на айфоне сам ставит свежие обои.\n"
            "<blockquote><b>Месяц</b> — дни этого месяца\n"
            "<b>Год</b> — все дни года\n"
            "<b>Жизнь</b> — 90 лет в неделях\n"
            "<b>Цель</b> — дни до важной даты</blockquote>\n\n"
            f"<b>prime · {price} ₽ навсегда</b>\n"
            "Один платёж, без подписок. Точки не замирают после пробной недели, "
            "логотип можно убрать, всё новое — без доплат."
        )
        rows = [[make], [{"text": f"prime — {price} ₽", "url": site + "/buy"}], [back]]
    elif name == "about":
        contact = f"Связь: {esc(SUPPORT_CONTACT)}\n" if SUPPORT_CONTACT else ""
        text = (
            "<b>О нас</b>\n\n"
            "Vita делает время видимым. Не таймер и не напоминалка — просто точки "
            "на экране, который ты видишь чаще всего.\n\n"
            "Без подписок и автосписаний. Оплата картой или через СБП, платёж проводит "
            "Робокасса — данные карты к нам не попадают.\n\n"
            f"{contact}"
            f'<a href="{esc(site)}/offer">Оферта</a> · '
            f'<a href="{esc(site)}/privacy">Конфиденциальность</a>'
        )
        rows = [[{"text": site.split("//", 1)[-1], "url": site}], [back]]
    else:
        text = (
            "<b>⠿ vita</b>\n\n"
            "Живые обои-календарь для айфона. Каждую ночь на экране блокировки "
            "закрашивается новая точка — время всегда перед глазами.\n\n"
            "<i>Обои за 30 секунд · 7 дней бесплатно</i>"
        )
        rows = [[make], [{"text": "Продукты", "callback_data": "products"},
                         {"text": "О нас", "callback_data": "about"}]]
    return {
        "text": text,
        "parse_mode": "HTML",
        "link_preview_options": {"is_disabled": True},
        "reply_markup": {"inline_keyboard": rows},
    }


def _tg_screen_name(text: str) -> str | None:
    """Команда из меню (/products) или ссылка t.me/vitadots_bot?start=about."""
    m = TG_COMMAND_RE.fullmatch(text)
    if not m:
        return None
    cmd, arg = m.group(1).lower(), (m.group(2) or "").lower()
    name = arg if cmd == "start" else cmd
    return name if name in TG_SCREENS else None


def _tg_callback(callback: dict) -> dict | None:
    """Нажатие «Продукты», «О нас» или «Назад» перерисовывает то же сообщение."""
    if callback.get("id"):
        # часики на кнопке гаснут, только когда на нажатие ответили
        _in_background(_tg_api, "answerCallbackQuery", {"callback_query_id": str(callback["id"])})
    msg = callback.get("message") or {}
    chat = msg.get("chat") or {}
    screen = str(callback.get("data") or "")
    if screen not in TG_SCREENS or chat.get("type") != "private" or not msg.get("message_id"):
        return None
    return {"method": "editMessageText", "chat_id": chat["id"],
            "message_id": msg["message_id"], **_tg_screen(screen)}


def _tg_remember_chat(conn: sqlite3.Connection, chat: dict) -> None:
    conn.execute(
        "INSERT INTO tg_chats(chat_id, kind, title) VALUES(?, ?, ?) "
        "ON CONFLICT(chat_id) DO UPDATE SET kind = excluded.kind, "
        "title = excluded.title, seen = datetime('now')",
        (str(chat.get("id")), str(chat.get("type") or ""), str(chat.get("title") or "")[:120]),
    )


# Образцы для тем обоев: владелец шлёт боту картинки (скрины с Пинтереста),
# они ложатся в data/refs — наружу эта папка не отдаётся. Принимаем только от
# админов чата Vita (TG_REVIEWS_CHAT), остальным бот на фото молчит, как раньше.
REFS = DATA / "refs"
TG_REF_OWNERS: dict[str, bool] = {}  # «админ ли чата Vita» — на время процесса
TG_ALBUM_WAIT = 6  # снимки альбома приходят отдельными апдейтами — ждём остальные


def _tg_ref_file(msg: dict) -> tuple[str, str] | None:
    """Картинка из сообщения — (file_id, расширение): фото или файл-картинка."""
    photos = msg.get("photo")
    if isinstance(photos, list) and photos and isinstance(photos[-1], dict):
        # размеры лежат по возрастанию — последний самый крупный
        if photos[-1].get("file_id"):
            return str(photos[-1]["file_id"]), "jpg"
    doc = msg.get("document")
    if isinstance(doc, dict) and doc.get("file_id"):
        kind = str(doc.get("mime_type") or "")
        if kind.startswith("image/"):
            ext = {"image/png": "png", "image/webp": "webp", "image/heic": "heic"}.get(kind, "jpg")
            return str(doc["file_id"]), ext
    return None


def _tg_ref_owner(user_id) -> bool:
    key = str(user_id)
    if key not in TG_REF_OWNERS:
        if not TG_REVIEWS_CHAT:
            return False
        res = _tg_api("getChatMember", {"chat_id": TG_REVIEWS_CHAT, "user_id": user_id})
        if not res.get("ok"):
            return False  # сбой не запоминаем — спросим на следующей картинке
        status = (res.get("result") or {}).get("status")
        TG_REF_OWNERS[key] = status in ("creator", "administrator")
    return TG_REF_OWNERS[key]


def _tg_download(file_path: str, limit: int = 20 << 20) -> bytes | None:
    """Файл с серверов телеграма по file_path из getFile. Сбой — None."""
    import urllib.request

    try:
        url = f"https://api.telegram.org/file/bot{TG_BOT_TOKEN}/{file_path}"
        with urllib.request.urlopen(url, timeout=30) as resp:
            data = resp.read(limit + 1)
    except Exception:
        return None
    return data if 0 < len(data) <= limit else None


def _tg_keep_ref(msg: dict) -> None:
    """Фоном: забрать картинку владельца в data/refs и коротко ответить.
    На альбом отвечаем один раз: его снимки ловят два воркера, поэтому
    отвечает тот, кто первым создал метку альбома (O_EXCL)."""
    chat_id = (msg.get("chat") or {}).get("id")
    user_id = (msg.get("from") or {}).get("id")
    got = _tg_ref_file(msg)
    if chat_id is None or user_id is None or not got or not _tg_ref_owner(user_id):
        return
    file_id, ext = got
    info = _tg_api("getFile", {"file_id": file_id})
    path = (info.get("result") or {}).get("file_path") if info.get("ok") else None
    data = _tg_download(str(path)) if path else None
    if not data:
        _tg_send(str(chat_id), "Не смог забрать картинку, пришли её ещё раз")
        return
    REFS.mkdir(parents=True, exist_ok=True)
    group = re.sub(r"\W", "", str(msg.get("media_group_id") or "")) or "solo"
    name = f"{time.strftime('%Y%m%d-%H%M%S')}-{group}-{msg.get('message_id', 0)}.{ext}"
    (REFS / name).write_bytes(data)
    if group == "solo":
        _tg_send(str(chat_id), "Принял фото для тем")
        return
    try:
        os.close(os.open(REFS / f".album-{group}", os.O_CREAT | os.O_EXCL | os.O_WRONLY))
    except FileExistsError:
        return
    time.sleep(TG_ALBUM_WAIT)
    count = sum(1 for p in REFS.iterdir() if f"-{group}-" in p.name)
    _tg_send(str(chat_id), f"Принял {count} фото для тем")


def _tg_update(update: dict) -> dict | None:
    """Разбирает апдейт. Возвращает ответ бота или None, если молчим."""
    member = update.get("my_chat_member")
    if isinstance(member, dict):
        chat = member.get("chat") or {}
        status = (member.get("new_chat_member") or {}).get("status", "")
        if chat.get("id") is not None and chat.get("type") != "private":
            with db() as conn:
                if status in ("member", "administrator"):
                    _tg_remember_chat(conn, chat)
                elif status in ("left", "kicked"):
                    conn.execute("DELETE FROM tg_chats WHERE chat_id = ?", (str(chat["id"]),))
        return None
    callback = update.get("callback_query")
    if isinstance(callback, dict):
        return _tg_callback(callback)
    msg = update.get("message")
    if not isinstance(msg, dict):
        return None
    chat = msg.get("chat") or {}
    if chat.get("id") is None:
        return None
    if chat.get("type") != "private":
        # в группах бот молчит и только запоминает чат — для отзывов
        with db() as conn:
            _tg_remember_chat(conn, chat)
        return None
    user = msg.get("from") or {}
    text = str(msg.get("text") or "").strip()
    if not text:
        # фото, стикеры, голосовые — молчим: иначе на альбом из десяти снимков
        # пришло бы десять одинаковых ответов. Картинки владельца — образцы
        # для тем: их забираем фоном, ответ один на альбом.
        if _tg_ref_file(msg):
            _in_background(_tg_keep_ref, msg)
        return None
    screen = _tg_screen_name(text)
    match = TG_START_RE.fullmatch(text)
    if screen or not match or not match.group(1) or user.get("id") is None:
        return {"method": "sendMessage", "chat_id": chat["id"], **_tg_screen(screen or "menu")}
    start, tg_id = match.group(1), str(user["id"])
    username = str(user.get("username") or "")[:64]
    name = " ".join(str(user.get(k) or "") for k in ("first_name", "last_name")).strip()[:80]
    now = time.time()
    with db() as conn:
        row = conn.execute(
            "SELECT created, tg_id, confirmed FROM tg_login WHERE start = ?", (start,)
        ).fetchone()
        fresh = row is not None and now - row[0] <= TG_LOGIN_TTL
        if fresh and not row[2]:
            conn.execute(
                "UPDATE tg_login SET tg_id = ?, username = ?, name = ?, confirmed = ? "
                "WHERE start = ?", (tg_id, username, name, now, start),
            )
        ok = fresh and (not row[2] or row[1] == tg_id)
    if not ok:
        return _tg_reply(chat["id"], "<b>Эта ссылка для входа уже не действует</b>\n"
                         "Вернись на сайт и нажми «Войти через Telegram» ещё раз.")
    return _tg_reply(chat["id"], "<b>Готово, вход подтверждён</b>\n"
                     "Возвращайся в браузер — ты уже внутри Vita.")


class AuthIn(BaseModel):
    email: str = ""
    password: str = ""
    ownerToken: str = ""


class ResetIn(BaseModel):
    email: str = ""
    code: str = ""
    password: str = ""


def _pass_hash(password: str, salt: str) -> str:
    """scrypt: подбор пароля по базе становится дорогим даже на хорошей машине."""
    return hashlib.scrypt(
        password.encode("utf-8"), salt=bytes.fromhex(salt),
        n=16384, r=8, p=1, dklen=32,
    ).hex()


def _clean_email(raw: str) -> str:
    email = str(raw or "").strip().lower()[:120]
    if not EMAIL_RE.fullmatch(email):
        raise HTTPException(422, "Проверь почту — кажется, в ней опечатка")
    return email


def _clean_password(raw: str) -> str:
    password = str(raw or "")
    if len(password) < 6:
        raise HTTPException(422, "Пароль короче шести знаков — его легко подобрать")
    if len(password) > 200:
        raise HTTPException(422, "Пароль слишком длинный")
    return password


def _issue_device(conn: sqlite3.Connection, profile_code: str) -> str:
    """Новый ключ устройства: прежние остаются жить, вход с телефона не выбивает с ноутбука."""
    token = secrets.token_hex(24)
    conn.execute(
        "INSERT OR IGNORE INTO profile_devices(profile_code, token_hash) VALUES(?, ?)",
        (profile_code, _token_hash(token)),
    )
    return token


def _auth_payload(conn: sqlite3.Connection, profile_code: str, token: str) -> dict:
    return {
        "token": token,
        "profile": _profile_payload(conn, profile_code),
        "access": _profile_access_state(conn, profile_code),
    }


# Safari стирает localStorage сайта через семь дней без захода — человек
# вылетал бы из аккаунта на ровном месте. Кука живёт дольше и переживает
# чистку хранилища, поэтому ключ устройства кладём в оба места.
SESSION_COOKIE = "vita_device"
SESSION_MAX_AGE = 400 * 24 * 3600


def _with_session(payload: dict, token: str) -> JSONResponse:
    response = JSONResponse(payload)
    response.set_cookie(
        SESSION_COOKIE, token,
        max_age=SESSION_MAX_AGE, httponly=True, samesite="lax",
        secure=not DEV_MODE, path="/",
    )
    return response


@app.post("/api/auth/register")
def auth_register(data: AuthIn):
    """Почта и пароль закрепляют за человеком тот профиль, что уже есть в браузере."""
    email = _clean_email(data.email)
    password = _clean_password(data.password)
    with db() as conn:
        busy = conn.execute(
            "SELECT profile_code FROM profile_auth WHERE email = ?", (email,)
        ).fetchone()
        if busy:
            raise HTTPException(409, "На эту почту уже есть аккаунт — войди вместо регистрации")
        profile_code = _profile_for_token(conn, data.ownerToken, create=True)
        already = conn.execute(
            "SELECT email FROM profile_auth WHERE profile_code = ?", (profile_code,)
        ).fetchone()
        if already:
            raise HTTPException(409, "К этому аккаунту уже привязана почта " + already[0])
        salt = secrets.token_hex(16)
        conn.execute(
            "INSERT INTO profile_auth(email, profile_code, pass_salt, pass_hash) "
            "VALUES(?, ?, ?, ?)",
            (email, profile_code, salt, _pass_hash(password, salt)),
        )
        token = _issue_device(conn, profile_code)
        return _with_session(_auth_payload(conn, profile_code, token), token)


@app.post("/api/auth/login")
def auth_login(data: AuthIn):
    """Вход с любого устройства: возвращает человека в его же аккаунт."""
    email = _clean_email(data.email)
    password = str(data.password or "")
    with db() as conn:
        row = conn.execute(
            "SELECT profile_code, pass_salt, pass_hash FROM profile_auth WHERE email = ?",
            (email,),
        ).fetchone()
        # один и тот же ответ на «нет такой почты» и «неверный пароль»:
        # иначе по форме входа можно перебрать, кто у нас зарегистрирован
        if not row or not hmac.compare_digest(_pass_hash(password, row[1]), row[2]):
            raise HTTPException(403, "Почта или пароль не подошли")
        profile_code = row[0]
        token = _issue_device(conn, profile_code)
        return _with_session(_auth_payload(conn, profile_code, token), token)


def _tg_api(method: str, payload: dict, timeout: int = 8) -> dict:
    """Вызов Bot API. Ничего не бросает: сбой телеграма не должен ронять сайт."""
    if not TG_BOT_TOKEN:
        return {"ok": False, "description": "нет токена бота"}
    import urllib.error
    import urllib.request

    try:
        req = urllib.request.Request(
            f"https://api.telegram.org/bot{TG_BOT_TOKEN}/{method}",
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read() or b"{}")
    except urllib.error.HTTPError as exc:
        try:
            return json.loads(exc.read() or b"{}")
        except ValueError:
            return {"ok": False, "description": f"HTTP {exc.code}"}
    except Exception as exc:  # в текст ошибки не попадает адрес с токеном
        return {"ok": False, "description": type(exc).__name__}


def _tg_send(chat_id: str, text: str) -> bool:
    """Короткое сообщение от бота. Ошибка телеграма не должна ронять запрос."""
    return bool(_tg_api("sendMessage", {"chat_id": chat_id, "text": text}).get("ok"))


def _in_background(fn, *args) -> None:
    """Необязательное и медленное (сообщение в телеграм) — отдельным потоком."""
    threading.Thread(target=fn, args=args, daemon=True).start()


def _tg_hook_register() -> None:
    """Вебхук бота ставится при каждом старте: так он не потеряется при переезде."""
    if not TG_BOT_TOKEN or DEV_MODE or os.environ.get("TG_WEBHOOK", "1") == "0":
        return

    def run():
        res = _tg_api("setWebhook", {
            "url": PUBLIC_URL + "/tg/hook",
            "secret_token": _tg_hook_secret(),
            "allowed_updates": ["message", "callback_query", "my_chat_member"],
        }, timeout=15)
        print("[tg] webhook:", "ok" if res.get("ok") else res.get("description"), flush=True)

    _in_background(run)


def _plural(n: int, one: str, few: str, many: str) -> str:
    if n % 10 == 1 and n % 100 != 11:
        return one
    if 2 <= n % 10 <= 4 and not 12 <= n % 100 <= 14:
        return few
    return many


def _review_nick(conn: sqlite3.Connection, profile_code: str | None) -> str:
    """Кто написал отзыв: телеграм, если привязан, иначе тег профиля."""
    handle = _telegram_handle(conn, profile_code)
    if handle and handle != "телеграм":
        return handle
    row = conn.execute(
        "SELECT handle FROM profiles WHERE code = ?", (profile_code or "",)
    ).fetchone()
    return ("@" + row[0]) if row and row[0] else (handle or "без профиля")


def _review_note(stars: int, nick: str, text: str) -> str:
    """Строка для чата Vita: «5 звёзд · @ник пишет: текст»."""
    score = f"{stars} {_plural(stars, 'звезда', 'звезды', 'звёзд')}" if stars else "без оценки"
    return f"{score} · {nick} пишет: {text[:3500]}"


def _mail_send(to: str, subject: str, text: str) -> bool:
    """Письмо простым текстом. Почта может лежать — запрос из-за этого не роняем."""
    if not MAIL_ON:
        return False
    if RUSENDER_KEY and RUSENDER_SEND_KEY:
        return _mail_send_api(to, subject, text)
    return _mail_send_smtp(to, subject, text)


def _mail_send_api(to: str, subject: str, text: str) -> bool:
    """RuSender по HTTP: единственный путь наружу, который хостинг не режет."""
    import urllib.request

    body = json.dumps({
        # ключ одноразовости: если сеть моргнула и мы повторили запрос,
        # человек не получит два письма с разными кодами
        "idempotencyKey": secrets.token_hex(8),
        "mail": {
            "to": {"email": to},
            "from": {"email": MAIL_FROM, "name": MAIL_FROM_NAME},
            "subject": subject,
            "text": text,
        },
    }).encode("utf-8")
    try:
        req = urllib.request.Request(
            f"{RUSENDER_URL}/{RUSENDER_SEND_KEY}",
            data=body,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {RUSENDER_KEY}",
            },
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=15) as resp:
            resp.read()
        return True
    except Exception as error:
        # молча терять письма нельзя: без этой строки неверный ключ в .env
        # выглядит как «код просто не пришёл». Сам адрес в лог не пишем.
        print(f"[mail] RuSender не принял письмо: {error}", flush=True)
        return False


def _mail_send_smtp(to: str, subject: str, text: str) -> bool:
    """Запасной путь: обычный SMTP, если когда-нибудь заведём ящик."""
    import smtplib
    import ssl
    from email.message import EmailMessage
    from email.utils import formataddr, formatdate, make_msgid

    msg = EmailMessage()
    msg["From"] = formataddr((MAIL_FROM_NAME, MAIL_FROM))
    msg["To"] = to
    msg["Subject"] = subject
    msg["Date"] = formatdate(localtime=True)
    msg["Message-ID"] = make_msgid(domain=MAIL_FROM.rpartition("@")[2] or None)
    # служебное письмо: почтовики не считают его рассылкой и не ждут «отписаться»
    msg["Auto-Submitted"] = "auto-generated"
    msg.set_content(text)
    try:
        if SMTP_PORT == 465:
            client = smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT, timeout=15)
        else:
            client = smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=15)
        with client:
            if SMTP_PORT != 465:
                client.starttls(context=ssl.create_default_context())
            client.login(SMTP_USER, SMTP_PASS)
            client.send_message(msg)
        return True
    except Exception as error:
        # молча терять письма нельзя: без этой строки неверный пароль в .env
        # выглядит как «код просто не пришёл». Сам адрес в лог не пишем.
        print(f"[mail] не отправилось через {SMTP_HOST}:{SMTP_PORT}: {error}", flush=True)
        return False


@app.post("/api/auth/forgot")
def auth_forgot(data: AuthIn):
    """Код на смену пароля уходит письмом на ту же почту, которой человек входит.
    Телеграм остаётся запасным путём — на случай, если почта ещё не настроена.

    Когда письма включены, ответ один и тот же, есть такая почта у нас или нет:
    иначе форма превращается в способ узнать, кто у нас зарегистрирован."""
    email = _clean_email(data.email)
    with db() as conn:
        row = conn.execute(
            "SELECT profile_code FROM profile_auth WHERE email = ?", (email,)
        ).fetchone()
        sent = False
        if row:
            fresh = conn.execute(
                "SELECT expires FROM auth_reset WHERE email = ?", (email,)
            ).fetchone()
            if fresh and fresh[0] > time.time() + RESET_TTL - RESET_RESEND:
                # код выслали меньше минуты назад: второе письмо не шлём, чтобы
                # с чужой формы нельзя было завалить человеку ящик
                sent = True
            else:
                code = f"{secrets.randbelow(10000):04d}"
                conn.execute(
                    "INSERT INTO auth_reset(email, code_hash, expires, tries) "
                    "VALUES(?, ?, ?, 0) ON CONFLICT(email) DO UPDATE SET "
                    "code_hash = excluded.code_hash, expires = excluded.expires, tries = 0",
                    (email, _token_hash(code), time.time() + RESET_TTL),
                )
                text = (
                    f"Код для смены пароля в Vita: {code}\n\n"
                    "Он живёт 15 минут — впиши его на vitadots.ru.\n"
                    "Если пароль менял не ты — просто не вводи код, "
                    "с аккаунтом ничего не случится."
                )
                sent = _mail_send(email, f"{code} — код для смены пароля в Vita", text)
                if not sent:
                    tg = conn.execute(
                        "SELECT tg_id FROM profile_telegram WHERE profile_code = ?", (row[0],)
                    ).fetchone()
                    sent = bool(tg) and _tg_send(tg[0], text)
        if MAIL_ON:
            return {
                "ok": True,
                "sent": True,
                "hint": "Если такая почта у нас есть, код уже летит на неё. "
                        "Загляни во «Входящие» и в «Спам» — код живёт 15 минут.",
            }
        # писем ещё нет: честно говорим, что код ушёл только в телеграм
        return {
            "ok": True,
            "sent": sent,
            "hint": (
                "Код отправлен тебе в телеграм — он живёт 15 минут."
                if sent else
                "Код уходит в телеграм, а он к этой почте не привязан. "
                "Напиши нам " + SUPPORT_CONTACT + " — вернём доступ руками."
            ),
        }


@app.post("/api/auth/reset")
def auth_reset(data: ResetIn):
    """Смена пароля по коду из письма (или из телеграма, если писем нет)."""
    email = _clean_email(data.email)
    password = _clean_password(data.password)
    code = str(data.code or "").strip()
    with db() as conn:
        row = conn.execute(
            "SELECT code_hash, expires, tries FROM auth_reset WHERE email = ?", (email,)
        ).fetchone()
        if not row or row[1] < time.time():
            raise HTTPException(403, "Код устарел — запроси новый")
        if row[2] >= 5:
            raise HTTPException(429, "Слишком много попыток — запроси новый код")
        if not hmac.compare_digest(_token_hash(code), row[0]):
            conn.execute("UPDATE auth_reset SET tries = tries + 1 WHERE email = ?", (email,))
            raise HTTPException(403, "Код не подошёл")
        prof = conn.execute(
            "SELECT profile_code FROM profile_auth WHERE email = ?", (email,)
        ).fetchone()
        if not prof:
            raise HTTPException(403, "Код устарел — запроси новый")
        salt = secrets.token_hex(16)
        conn.execute(
            "UPDATE profile_auth SET pass_salt = ?, pass_hash = ? WHERE email = ?",
            (salt, _pass_hash(password, salt), email),
        )
        conn.execute("DELETE FROM auth_reset WHERE email = ?", (email,))
        token = _issue_device(conn, prof[0])
        return _with_session(_auth_payload(conn, prof[0], token), token)


@app.get("/api/auth/session")
def auth_session(request: Request):
    """Если хранилище браузера почистили, ключ ещё жив в куке — вернём его."""
    token = request.cookies.get(SESSION_COOKIE, "")
    if not token:
        return {"token": ""}
    with db() as conn:
        profile_code = _profile_for_token(conn, token)
        if not profile_code:
            return {"token": ""}
        # заодно продлеваем куку: человек заходит — ключ не должен истечь
        return _with_session(
            {"token": token, "access": _profile_access_state(conn, profile_code)}, token
        )


@app.post("/api/auth/logout")
def auth_logout():
    """Выход гасит и куку — иначе следующий заход молча вернул бы в аккаунт."""
    response = JSONResponse({"ok": True})
    response.delete_cookie(SESSION_COOKIE, path="/")
    return response


@app.post("/api/access")
def access_state(owner: OwnerIn):
    """Статус доступа по приватному Vita ID — для кабинета и кнопки покупки."""
    with db() as conn:
        profile_code = _profile_for_token(conn, owner.ownerToken)
        return _profile_access_state(conn, profile_code)


# Робокасса пускает к оплате только активированный магазин. Пока его проверяют,
# их страница встречает покупателя «Код ошибки 25: оплата счетов недоступна» —
# человек нажал «Оплатить» и упёрся в чужую ошибку. Поэтому сами открываем ту же
# страницу оплаты (счёт №0, деньги это не трогает) и смотрим код в её данных.
# Закрыт — переспрашиваем раз в пару минут; открылся — больше не спрашиваем,
# и кнопка оживает сама, без команд на сервере.
ROBOKASSA_CLOSED = 25
PAY_WAIT_TTL = 120
PAY_WAIT_TEXT = ("Оплата откроется на днях — платёжный сервис ещё проверяет наш магазин. "
                 "Бесплатные дни от этого не сгорают.")
_pay_probe = {"open": None, "at": 0.0}


def _robokassa_open() -> bool:
    if billing.IS_TEST or DEV_MODE or not billing.enabled() or _pay_probe["open"]:
        return True
    if _pay_probe["open"] is False and time.monotonic() - _pay_probe["at"] < PAY_WAIT_TTL:
        return False
    import urllib.request

    try:
        req = urllib.request.Request(
            billing.payment_link(0, ""),
            headers={"User-Agent": "Mozilla/5.0 (compatible; vitadots.ru)"},
        )
        with urllib.request.urlopen(req, timeout=4) as resp:
            page = resp.read(200_000).decode("utf-8", "replace")
    except Exception as exc:
        # не дозвались — платить не мешаем, спросим снова при следующем счёте
        print("[pay] robokassa check:", exc, flush=True)
        return True
    found = re.search(r'"error"\s*:\s*\{[^{}]*"code"\s*:\s*(\d+)', page)
    is_open = not (found and int(found.group(1)) == ROBOKASSA_CLOSED)
    _pay_probe.update(open=is_open, at=time.monotonic())
    return is_open


@app.post("/api/buy")
def buy(order: BuyIn):
    """Создаёт счёт Робокассы на вечный доступ и отдаёт фронту поля формы."""
    if not billing.enabled():
        raise HTTPException(503, "Оплата ещё не подключена — напиши нам, откроем доступ вручную")
    email = order.email.strip().lower()[:120]
    if not EMAIL_RE.fullmatch(email):
        raise HTTPException(422, "Проверь почту — на неё придёт чек и запасной ключ доступа")
    if not _robokassa_open():
        raise HTTPException(503, PAY_WAIT_TEXT)
    with db() as conn:
        profile_code = _profile_for_token(conn, order.ownerToken, create=True)
        state = _profile_access_state(conn, profile_code)
        if state["paid"]:
            raise HTTPException(409, "Доступ уже открыт навсегда")
        cur = conn.execute(
            "INSERT INTO orders(profile_code, amount, email) VALUES(?, ?, ?)",
            (profile_code, billing.amount(), email),
        )
        inv_id = int(cur.lastrowid)
    form = billing.payment_form(inv_id, email)
    return {"invId": inv_id, "action": form["action"], "fields": form["fields"]}


def _pay_result(params: dict) -> str:
    checked = billing.check_result(params)
    if checked is None:
        raise HTTPException(403, "bad signature")
    inv_id, out_sum = checked
    with db() as conn:
        row = conn.execute(
            "SELECT profile_code, amount, status FROM orders WHERE id = ?", (inv_id,)
        ).fetchone()
        if row is None:
            raise HTTPException(404, "no such order")
        profile_code, amount_due, status = row
        # деньги пришли меньше цены — доступ не открываем, разбираемся руками
        if float(out_sum) + 0.01 < float(amount_due):
            raise HTTPException(400, "amount mismatch")
        if status != "paid":  # повторное уведомление ничего не ломает
            conn.execute(
                "UPDATE orders SET status = 'paid', paid_at = datetime('now') WHERE id = ?",
                (inv_id,),
            )
            _grant_forever(conn, profile_code)
    return f"OK{inv_id}"


@app.get("/pay/result")
def pay_result_get(request: Request):
    return Response(_pay_result(dict(request.query_params)), media_type="text/plain")


@app.post("/pay/result")
async def pay_result_post(request: Request):
    form = dict(await request.form())
    if not form:
        form = dict(request.query_params)
    return Response(_pay_result(form), media_type="text/plain")


@app.get("/pay/success")
def pay_success(request: Request):
    """Возврат покупателя. Доступ выдаёт /pay/result, тут только показываем итог."""
    inv_id = billing.check_success(dict(request.query_params))
    paid = False
    if inv_id is not None:
        with db() as conn:
            row = conn.execute("SELECT status FROM orders WHERE id = ?", (inv_id,)).fetchone()
            paid = bool(row and row[0] == "paid")
    return _page("paid.html", {"{{STATE}}": "paid" if paid else "pending"})


@app.get("/pay/fail")
def pay_fail():
    return _page("paid.html", {"{{STATE}}": "fail"})


def _page(name: str, extra: dict | None = None) -> HTMLResponse:
    """HTML с подстановкой цены и реквизитов — они живут в .env, а не в статике."""
    html = (ROOT / "static" / name).read_text(encoding="utf-8")
    values = {
        "{{PRICE}}": billing.PRICE,
        "{{SELLER}}": SELLER_NAME or "Исполнитель (реквизиты уточняются)",
        "{{INN}}": SELLER_INN or "—",
        "{{SUPPORT}}": SUPPORT_CONTACT or "на почту поддержки",
        "{{UPDATED}}": "10.09.2026",
        "{{VERIFY}}": (
            (f'<meta name="google-site-verification" content="{esc(GOOGLE_VERIFY)}">'
             if GOOGLE_VERIFY else "")
            + (f'<meta name="yandex-verification" content="{esc(YANDEX_VERIFY)}">'
               if YANDEX_VERIFY else "")
        ),
    }
    values.update(extra or {})
    for key, value in values.items():
        html = html.replace(key, value)
    return HTMLResponse(html, headers={"Cache-Control": "no-cache"})


# Битая ссылка человеку показывает страницу сайта, а не строку {"detail":...}.
# Машинным адресам (ручки API, картинки обоев, вебхук) JSON нужнее — им и оставляем.
_JSON_404 = ("/api/", "/tg/", "/pay/", "/media/", "/admin")


@app.exception_handler(StarletteHTTPException)
def not_found(request: Request, exc: StarletteHTTPException):
    path = request.url.path
    human = (exc.status_code == 404
             and request.method == "GET"
             and not path.startswith(_JSON_404)
             and not path.endswith((".png", ".jpg", ".json", ".txt", ".xml", ".css", ".js")))
    if human:
        page = _page("404.html")
        return HTMLResponse(page.body, status_code=404, headers=dict(page.headers))
    return JSONResponse({"detail": exc.detail}, status_code=exc.status_code,
                        headers=getattr(exc, "headers", None))


@app.get("/buy")
def buy_page():
    # страница заранее знает, открыта ли оплата, и не зовёт к форме впустую
    return _page("buy.html", {"{{PAY_OPEN}}": "1" if _robokassa_open() else "0"})


@app.get("/offer")
def offer_page():
    return _page("offer.html")


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
            "SELECT access_until, fetches, review_at, owner_code "
            "FROM links WHERE code = ?", (code,)
        ).fetchone()
        effective_until = (
            _effective_access_until(conn, row[0], row[3]) if row is not None else None
        )
    if row is None:
        raise HTTPException(404, "Нет такой ссылки")
    _, fetches, review_at, _ = row
    url = str(request.base_url).rstrip("/") + f"/w/{code}.png"
    if SHORTCUT_ICLOUD_URL:
        btn = (f'<a class="btn primary" id="shortcutBtn" href="{SHORTCUT_ICLOUD_URL}">'
               'Добавить ярлык</a>')
    else:
        btn = '<span class="btn primary disabled">Ярлык готовится — скоро здесь</span>'
    expired, until = _access_state(effective_until)
    buy = ""
    if until is None:
        access = "Доступ навсегда — точки не остановятся."
    elif expired:
        access = f"Точки замерли {until.strftime('%d.%m')} — пробные дни кончились."
        buy = (f'<a class="btn primary" href="/buy">Оживить обои — {billing.PRICE} ₽ навсегда</a>'
               '<p class="hint">Один платёж, без подписки. Обои начнут обновляться этой же ночью.</p>')
    else:
        access = f"Бесплатно до {until.strftime('%d.%m')}."
        buy = ('<p class="hint">7 дней бесплатно, дальше нужен '
               '<a href="/buy" style="color:var(--text-2)">prime</a>.</p>')
    # блок отзыва: только тем, кто уже пользовался (обои реально тянулись) или у кого доступ истёк,
    # и только если вторую неделю ещё не дарили — иначе пусто/благодарность
    if until is None:
        review = ""
    elif review_at:
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
        .replace("{{BUY}}", buy)
        .replace("{{REVIEW}}", review)
        .replace("{{CAN_REVIEW}}", "1" if (until is not None and not review_at) else "")
        .replace("{{CODE}}", code),
        headers={"Cache-Control": "no-cache"},
    )


WP_CACHE = DATA / "wpcache"


def _wallpaper_png(config: str, expired: bool, until: date | None) -> bytes:
    """PNG обоев с дневным кэшем: за сутки одна картинка рисуется один раз.

    Ключ включает дату — в полночь кэш протухает сам, лишней инвалидации не надо.
    """
    today = date.today().isoformat()
    digest = hashlib.sha256(
        f"{config}|{expired}|{until.isoformat() if until else ''}".encode("utf-8")
    ).hexdigest()[:20]
    path = WP_CACHE / f"{today}-{digest}.png"
    try:
        return path.read_bytes()
    except OSError:
        pass
    img = render_wallpaper(
        json.loads(config),
        today=until if expired else None,  # прогресс заморожен на дате окончания
        expired=expired,
    )
    buf = io.BytesIO()
    img.save(buf, "PNG")
    data = buf.getvalue()
    try:
        WP_CACHE.mkdir(parents=True, exist_ok=True)
        for stale in WP_CACHE.glob("*.png"):  # вчерашние картинки больше не нужны
            if not stale.name.startswith(today):
                stale.unlink(missing_ok=True)
        tmp = WP_CACHE / f".{digest}.tmp"
        tmp.write_bytes(data)
        tmp.replace(path)
    except OSError:
        pass  # нет места или прав — отдаём картинку без кэша
    return data


@app.get("/w/{code}.png")
def wallpaper(code: str):
    with db() as conn:
        row = conn.execute(
            "SELECT config, access_until, owner_code FROM links WHERE code = ?", (code,)
        ).fetchone()
        effective_until = (
            _effective_access_until(conn, row[1], row[2]) if row is not None else None
        )
        if row is not None:
            conn.execute(
                "UPDATE links SET fetches = fetches + 1, last_fetch = datetime('now') WHERE code = ?",
                (code,),
            )
    if row is None:
        raise HTTPException(404, "Нет такой ссылки")
    expired, until = _access_state(effective_until)
    return Response(
        _wallpaper_png(row[0], expired, until),
        media_type="image/png",
        headers={"Cache-Control": "no-store"},  # Ярлыки должны тянуть свежую картинку каждый день
    )


# --- трекер целей «тыкалка» (клон Ripples, чисто веб) ---


@app.get("/goals")
def goals_new():
    # Ветка отложена: сайт сейчас — одна страница про обои. Адрес остаётся
    # живым только чтобы гости из поиска попадали на главную, а не внутрь
    # продукта, которого для них ещё нет.
    return RedirectResponse("/", status_code=302,
                            headers={"X-Robots-Tag": "noindex", "Cache-Control": "no-cache"})


@app.get("/focus")
def focus_page():
    # Vita Focus отложен, а Гугль успел проиндексировать его страницу и водит
    # людей туда вместо главной. Пока продукта нет — уводим на главную.
    return RedirectResponse("/", status_code=302,
                            headers={"X-Robots-Tag": "noindex", "Cache-Control": "no-cache"})


@app.get("/privacy")
def privacy_page():
    return _page("privacy.html")


# Дверь отдаётся по двум адресам с разными заголовками: так у сайта в поиске
# есть ровно два понятных пункта — «Вход» и «Регистрация», а не безымянная
# страница. Внутри это одна и та же страница, выбрана нужная половина капсулы.
DOOR = {
    "/login": (
        "Вход в Vita",
        "Вход в Vita по почте или через телеграм: живые обои-календарь, где каждый день закрашивается точка.",
    ),
    "/register": (
        "Регистрация в Vita",
        "Регистрация в Vita: почта и пароль или вход через телеграм. Обои-календарь остаются за твоим аккаунтом.",
    ),
}


def _door(path: str) -> HTMLResponse:
    title, desc = DOOR[path]
    return _page("login.html", {
        "{{DOOR_TITLE}}": title,
        "{{DOOR_DESC}}": desc,
        "{{DOOR_PATH}}": path,
    })


@app.get("/login")
def login_page():
    return _door("/login")


@app.get("/register")
def register_page():
    return _door("/register")


@app.get("/me")
def cabinet_page():
    return FileResponse(ROOT / "static" / "me.html", headers={"Cache-Control": "no-cache", "X-Robots-Tag": "noindex, follow"})


@app.get("/u/{handle}")
def member_page(handle: str):
    # Ветка отложена: сайт сейчас — одна страница про обои. Адрес остаётся
    # живым только чтобы гости из поиска попадали на главную, а не внутрь
    # продукта, которого для них ещё нет.
    return RedirectResponse("/", status_code=302,
                            headers={"X-Robots-Tag": "noindex", "Cache-Control": "no-cache"})


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
        # имени в профиле больше нет: пустую строку считаем «не присылали»,
        # иначе сохранение одного тега падало с «Имя должно быть от 2 до 40»
        if profile.name:
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
            row = conn.execute(
                "SELECT handle, handle_changes, handle_custom FROM profiles WHERE code = ?",
                (code,),
            ).fetchone()
            current_handle = (row[0] or "") if row else ""
            changes, chosen = (row[1] or 0, row[2] or 0) if row else (0, 0)
            if current_handle.lower() != handle:
                if not chosen:
                    # служебный тег человек не выбирал: эта установка и есть
                    # выбор при регистрации, в лимит замен она не идёт
                    fields["handle_custom"] = 1
                elif changes >= HANDLE_CHANGE_LIMIT:
                    raise HTTPException(
                        409,
                        "Тег меняют один раз — этот остаётся за тобой навсегда",
                    )
                else:
                    fields["handle_changes"] = changes + 1
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
        # кука должна знать новый ключ: иначе следующий заход вернёт старый
        return _with_session(_profile_payload(conn, code), token)


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
    # Ветка отложена: сайт сейчас — одна страница про обои. Адрес остаётся
    # живым только чтобы гости из поиска попадали на главную, а не внутрь
    # продукта, которого для них ещё нет.
    return RedirectResponse("/", status_code=302,
                            headers={"X-Robots-Tag": "noindex", "Cache-Control": "no-cache"})


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
        headers={"Cache-Control": "no-cache", "X-Robots-Tag": "noindex"},
    )


@app.get("/c/{code}")
def challenge_page(code: str):
    g, _ = _goal_row(code)
    if g is None:
        raise HTTPException(404, "Нет такой цели")
    html = (ROOT / "static" / "challenge.html").read_text(encoding="utf-8")
    return HTMLResponse(html.replace("{{CODE}}", code),
                        headers={"Cache-Control": "no-cache", "X-Robots-Tag": "noindex"})


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
async function grantOrder(inv) {{
  if (!confirm('Открыть доступ по счёту №' + inv + ' навсегда?')) return;
  await fetch(`/admin/order/grant?token={token}&inv=${{inv}}`, {{ method: 'POST' }});
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
        raw_rows = conn.execute(
            "SELECT i.created, i.idea, i.contact, l.code, l.access_until, l.fetches, "
            "l.owner_code "
            "FROM ideas i JOIN links l ON l.code = i.code ORDER BY i.id DESC"
        ).fetchall()
        rows = [
            (created, idea, contact, code,
             _effective_access_until(conn, access_until, owner_code), fetches)
            for created, idea, contact, code, access_until, fetches, owner_code in raw_rows
        ]
        rv_rows = conn.execute(
            "SELECT code, text, stars FROM reviews ORDER BY id"
        ).fetchall()
        fw_rows = conn.execute(
            "SELECT contact, created FROM focus_wait ORDER BY created DESC"
        ).fetchall()
        money = {
            "links": conn.execute("SELECT COUNT(*) FROM links").fetchone()[0],
            "links_week": conn.execute(
                "SELECT COUNT(*) FROM links WHERE created >= date('now', '-7 day')"
            ).fetchone()[0],
            "forever": conn.execute(
                "SELECT COUNT(*) FROM profile_access WHERE access_until IS NULL"
            ).fetchone()[0],
        }
        paid_row = conn.execute(
            "SELECT COUNT(*), COALESCE(SUM(CAST(amount AS REAL)), 0) FROM orders WHERE status = 'paid'"
        ).fetchone()
        money["paid"], money["sum"] = paid_row[0], paid_row[1]
        money["pending"] = conn.execute(
            "SELECT COUNT(*) FROM orders WHERE status != 'paid'"
        ).fetchone()[0]
        order_rows = conn.execute(
            "SELECT o.id, o.created, o.paid_at, o.amount, o.email, o.status, "
            "COALESCE(p.handle, '') "
            "FROM orders o LEFT JOIN profiles p ON p.code = o.profile_code "
            "ORDER BY o.id DESC LIMIT 30"
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
    for r_code, r_text, r_stars in rv_rows:
        mark = ("★" * r_stars + " ") if r_stars else ""
        reviews.setdefault(r_code, []).append(mark + r_text)
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
            f'<button onclick="ext(\'{code}\', 0)">навсегда</button></div></div>'
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
    # деньги и воронка: сколько обоев сделали, сколько купили, кто заплатил
    conv = (money["paid"] / money["links"] * 100) if money["links"] else 0
    olines = []
    for oid, ocreated, opaid, oamount, oemail, ostatus, ohandle in order_rows:
        who = f"@{esc(ohandle)}" if ohandle else "—"
        if ostatus == "paid":
            mark = f'<span style="color:#34c759">оплачен {opaid or ""}</span>'
            btn = ""
        else:
            mark = '<span class="expired">не оплачен</span>'
            btn = f'<button onclick="grantOrder({oid})">выдать вручную</button>'
        olines.append(
            f'<div style="margin:8px 0">№{oid} · {ocreated} · <b>{esc(oemail)}</b> · '
            f'{oamount} ₽ · {who} · {mark} {btn}</div>'
        )
    money_block = (
        f'<div class="card"><div class="meta">'
        f'<span>💰 Куплено навсегда: <b>{money["paid"]}</b></span>'
        f'<span>выручка: <b>{money["sum"]:.0f} ₽</b></span>'
        f'<span>доступов навсегда: <b>{money["forever"]}</b></span>'
        f'<span>обоев всего: <b>{money["links"]}</b> (за неделю {money["links_week"]})</span>'
        f'<span>конверсия: <b>{conv:.1f}%</b></span>'
        f'<span>счетов без оплаты: {money["pending"]}</span></div>'
        f'<div class="idea">{"".join(olines) or "Заказов пока нет."}</div></div>'
    )
    html = ADMIN_PAGE.format(
        count=len(rows),
        cards=money_block + focus_block + feed_block + ("".join(cards) or "<p>Пока пусто.</p>"),
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
        if days <= 0 or row[0] is None:
            conn.execute("UPDATE links SET access_until = NULL WHERE code = ?", (code,))
            new_until = None
        else:
            new_until = _extend(conn, code, days, row[0])
    return {"code": code, "access_until": new_until}


@app.post("/admin/order/grant")
def admin_order_grant(inv: int, token: str = ""):
    """Открыть доступ по номеру счёта руками: деньги пришли, уведомление — нет."""
    if token != ADMIN_TOKEN:
        raise HTTPException(403, "Нет доступа")
    with db() as conn:
        row = conn.execute(
            "SELECT profile_code, status FROM orders WHERE id = ?", (inv,)
        ).fetchone()
        if row is None:
            raise HTTPException(404, "Нет такого счёта")
        conn.execute(
            "UPDATE orders SET status = 'paid', paid_at = datetime('now') WHERE id = ?", (inv,)
        )
        _grant_forever(conn, row[0])
    return {"invId": inv, "paid": True}


@app.post("/admin/grant")
def admin_grant(tag: str, days: int = 0, token: str = ""):
    """Доступ по тегу для текущих и будущих обоев; days<=0 — навсегда."""
    if token != ADMIN_TOKEN:
        raise HTTPException(403, "Нет доступа")
    handle = _normalize_handle(tag)
    with db() as conn:
        row = conn.execute(
            "SELECT code FROM profiles WHERE handle = ? COLLATE NOCASE", (handle,)
        ).fetchone()
        if row is None:
            raise HTTPException(404, "Нет профиля с таким тегом")
        codes = [c for (c,) in conn.execute(
            "SELECT code FROM links WHERE owner_code = ?", (row[0],)
        )]
        if days <= 0:
            conn.execute(
                "INSERT INTO profile_access(profile_code, access_until) VALUES(?, NULL) "
                "ON CONFLICT(profile_code) DO UPDATE SET "
                "access_until = NULL, updated = datetime('now')",
                (row[0],),
            )
            conn.execute(
                "UPDATE links SET access_until = NULL WHERE owner_code = ?", (row[0],)
            )
            until = None
        else:
            current_grant = conn.execute(
                "SELECT access_until FROM profile_access WHERE profile_code = ?", (row[0],)
            ).fetchone()
            if current_grant is not None and current_grant[0] is None:
                until = None
            else:
                _, current_until = _access_state(current_grant[0] if current_grant else None)
                base = max(date.today(), current_until) if current_until else date.today()
                until = (base + timedelta(days=days)).isoformat()
                conn.execute(
                    "INSERT INTO profile_access(profile_code, access_until) VALUES(?, ?) "
                    "ON CONFLICT(profile_code) DO UPDATE SET "
                    "access_until = excluded.access_until, updated = datetime('now')",
                    (row[0], until),
                )
            for code in codes:
                current = conn.execute(
                    "SELECT access_until FROM links WHERE code = ?", (code,)
                ).fetchone()
                if current[0] is not None and until is not None:
                    _extend(conn, code, days, current[0])
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
