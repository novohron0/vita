import asyncio
import hashlib
import io
import os
import sqlite3
import sys
import tempfile
from pathlib import Path

from fastapi import HTTPException
from PIL import Image
from starlette.datastructures import Headers, UploadFile
from starlette.requests import Request

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


def request(path: str = "/", token: str = "") -> Request:
    headers = [(b"host", b"testserver")]
    if token:
        headers.append((b"x-vita-token", token.encode()))
    return Request({
        "type": "http", "http_version": "1.1", "method": "GET",
        "scheme": "https", "path": path, "raw_path": path.encode(),
        "query_string": b"", "headers": headers,
        "server": ("testserver", 443), "client": ("127.0.0.1", 1),
        "root_path": "",
    })


with tempfile.TemporaryDirectory(prefix="vita-account-") as data_dir:
    os.environ["VITA_DATA"] = data_dir

    # Production already has rows in the original profile schema. Verify that
    # opening the account performs a non-destructive handle/tag backfill.
    token = "0123456789abcdef" * 3
    legacy_code = "abcdefgh23"
    legacy_db = sqlite3.connect(Path(data_dir) / "vita.db")
    legacy_db.execute(
        "CREATE TABLE profiles("
        "code TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE, "
        "name TEXT NOT NULL DEFAULT '', settings TEXT NOT NULL DEFAULT '{}', "
        "created TEXT NOT NULL DEFAULT (datetime('now')))"
    )
    legacy_db.execute(
        "INSERT INTO profiles(code, token_hash) VALUES(?, ?)",
        (legacy_code, hashlib.sha256(token.encode()).hexdigest()),
    )
    legacy_db.commit()
    legacy_db.close()

    from app import main

    profile = main.ensure_profile(main.ProfileIn(ownerToken=token))
    assert profile["code"] == legacy_code
    assert profile["handle"].startswith("vita_") and len(profile["handle"]) == 11
    assert profile["name"] == profile["handle"]
    assert profile["bio"] == ""
    assert profile["avatar"] == ""
    assert len(profile["tags"]) == 1
    assert set(profile["tags"][0]) == {
        "id", "name", "description", "icon", "rarity", "earnedAt",
    }
    assert profile["tags"][0]["rarity"] in {"common", "rare", "epic", "legendary"}

    updated = main.update_profile(main.ProfileUpdateIn(
        ownerToken=token,
        name="Камиль",
        handle="Kamil_Vita",
        bio="Делаю маленький шаг каждый день.",
    ))
    assert updated["handle"] == "kamil_vita"
    assert updated["name"] == "Камиль"
    assert updated["bio"] == "Делаю маленький шаг каждый день."
    assert updated["tags"] == profile["tags"]

    # Registration and later edits share the same public-name validation.
    invalid_name_token = "bad-name-token-0123456789abcdef"
    for invalid_name in ("Я", "https://spam.example"):
        try:
            main.ensure_profile(main.ProfileIn(
                ownerToken=invalid_name_token,
                name=invalid_name,
            ))
            raise AssertionError("invalid registration name must fail")
        except HTTPException as error:
            assert error.status_code == 422
    valid_after_rejection = main.ensure_profile(main.ProfileIn(
        ownerToken=invalid_name_token,
        name="Новый человек",
    ))
    assert valid_after_rejection["name"] == "Новый человек"

    # Tags are not accepted by the profile mutation model and cannot be
    # self-awarded through PATCH.
    model_fields = getattr(main.ProfileUpdateIn, "model_fields", None)
    if model_fields is None:
        model_fields = main.ProfileUpdateIn.__fields__
    assert "tags" not in model_fields
    attempted_award = main.ProfileUpdateIn(
        ownerToken=token,
        bio="Теги выдаёт только Vita",
        tags=[{"id": "fake_legend", "rarity": "legendary"}],
    )
    after_attempt = main.update_profile(attempted_award)
    assert after_attempt["tags"] == profile["tags"]

    other_token = "fedcba9876543210" * 3
    other = main.ensure_profile(main.ProfileIn(ownerToken=other_token, name="Другой человек"))
    assert other["code"] != profile["code"]
    assert other["handle"] != updated["handle"]
    assert len(other["tags"]) == 1
    try:
        main.update_profile(main.ProfileUpdateIn(
            ownerToken=other_token, handle="KAMIL_vita",
        ))
        raise AssertionError("duplicate handle must fail")
    except HTTPException as error:
        assert error.status_code == 409

    goal = main.create_goal(
        main.GoalIn(title="Бегать каждый день", days=30, ownerToken=token),
        request("/api/goal"),
    )
    state = main.goal_state(goal["code"], request(token=token))
    assert state["editable"] is True

    edited = main.goal_edit(goal["code"], main.GoalEditIn(
        ownerToken=token, title="Бег 4 дня", days=4,
        reward="Кофе", color="#a855f7", shape="diamond",
    ))
    assert edited["ok"] is True

    wallpaper = main.create_link(main.LinkIn(
        ownerToken=token, idea="Хочу видеть свой прогресс каждый день", contact="@vita",
    ), request("/api/link"))

    avatar_bytes = io.BytesIO()
    Image.new("RGB", (900, 400), "#a855f7").save(avatar_bytes, "PNG")
    avatar_bytes.seek(0)
    upload = UploadFile(
        avatar_bytes,
        filename="avatar.png",
        headers=Headers({"content-type": "image/png"}),
    )
    with_avatar = asyncio.run(main.upload_profile_avatar(ownerToken=token, file=upload))
    assert with_avatar["avatar"].startswith("/media/avatar/")
    avatar_id = with_avatar["avatar"].removeprefix("/media/avatar/").removesuffix(".jpg")
    avatar_path = Path(data_dir) / "avatars" / f"{avatar_id}.jpg"
    assert avatar_path.exists()
    with Image.open(avatar_path) as stored_avatar:
        assert stored_avatar.size == (512, 512)

    post = main.create_feed_post(main.FeedPostIn(
        ownerToken=token, kind="goal", sourceCode=goal["code"],
        title="Мой бег", description="Четыре красивых ромба",
    ))
    assert len(post["code"]) == 6

    library = main.profile_library(main.OwnerIn(ownerToken=token))
    assert library["goals"][0]["code"] == goal["code"]
    assert library["wallpapers"][0]["code"] == wallpaper["code"]
    assert library["posts"][0]["code"] == post["code"]
    assert library["avatar"] == with_avatar["avatar"]

    public = main.public_profile("KAMIL_VITA")
    assert set(public) == {"handle", "name", "bio", "avatar", "tags"}
    assert public["handle"] == "kamil_vita"
    assert public["avatar"] == with_avatar["avatar"]
    assert "code" not in public and "settings" not in public
    assert profile["code"] not in repr(public)

    bundle = main.profile_bundle(profile["code"])
    assert bundle["handle"] == public["handle"]
    assert bundle["name"] == public["name"]
    assert bundle["bio"] == public["bio"]
    assert bundle["avatar"] == public["avatar"]
    assert bundle["tags"] == public["tags"]
    assert "settings" in bundle and "goals" in bundle

    feed_post = main.feed_list()["posts"][0]
    assert feed_post["code"] == post["code"]
    assert feed_post["author"] == public
    assert "code" not in feed_post["author"]

    connected_token = "a1b2c3d4e5f60718" * 3
    connected = main.connect_profile(main.ProfileConnectIn(
        ownerToken=connected_token, profileCode=profile["code"],
    ))
    assert connected["goals"][0]["code"] == goal["code"]
    assert connected["handle"] == "kamil_vita"
    assert main.profile_library(main.OwnerIn(ownerToken=connected_token))["code"] == profile["code"]

    # A partially applied migration may contain case-insensitive duplicate
    # handles but no unique index. Keep one and repair the rest deterministically.
    primary_db_path = main.DB_PATH
    partial_db_path = Path(data_dir) / "partial-migration.db"
    partial_db = sqlite3.connect(partial_db_path)
    partial_db.execute(
        "CREATE TABLE profiles("
        "code TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE, "
        "handle TEXT, name TEXT, settings TEXT NOT NULL DEFAULT '{}', "
        "created TEXT NOT NULL DEFAULT (datetime('now')))"
    )
    partial_db.executemany(
        "INSERT INTO profiles(code, token_hash, handle, name) VALUES(?, ?, ?, ?)",
        (
            ("abcdefgh24", "hash-one", "Same_Handle", "Первый"),
            ("abcdefgh25", "hash-two", "same_handle", ""),
        ),
    )
    partial_db.commit()
    partial_db.close()
    main.DB_PATH = partial_db_path
    try:
        with main.db() as partial_db:
            migrated = partial_db.execute(
                "SELECT code, handle, name FROM profiles ORDER BY code"
            ).fetchall()
            assert migrated[0][1] == "same_handle"
            assert migrated[1][1].startswith("vita_")
            assert migrated[1][2] == migrated[1][1]
            assert len({row[1].lower() for row in migrated}) == 2
            assert partial_db.execute("SELECT COUNT(*) FROM profile_tags").fetchone()[0] == 2
        with main.db() as partial_db:
            assert partial_db.execute(
                "SELECT code, handle, name FROM profiles ORDER BY code"
            ).fetchall() == migrated
    finally:
        main.DB_PATH = primary_db_path

print("Vita account flow: passed")
