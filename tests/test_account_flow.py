import os
import sys
import tempfile
from pathlib import Path

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
    from app import main

    token = "0123456789abcdef" * 3
    profile = main.ensure_profile(main.ProfileIn(ownerToken=token))
    assert len(profile["code"]) == 10

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

    post = main.create_feed_post(main.FeedPostIn(
        ownerToken=token, kind="goal", sourceCode=goal["code"],
        title="Мой бег", description="Четыре красивых ромба",
    ))
    assert len(post["code"]) == 6

    library = main.profile_library(main.OwnerIn(ownerToken=token))
    assert library["goals"][0]["code"] == goal["code"]
    assert library["wallpapers"][0]["code"] == wallpaper["code"]
    assert library["posts"][0]["code"] == post["code"]
    assert main.feed_list()["posts"][0]["code"] == post["code"]

    second_token = "fedcba9876543210" * 3
    connected = main.connect_profile(main.ProfileConnectIn(
        ownerToken=second_token, profileCode=profile["code"],
    ))
    assert connected["goals"][0]["code"] == goal["code"]
    assert main.profile_library(main.OwnerIn(ownerToken=second_token))["code"] == profile["code"]

print("Vita account flow: passed")
