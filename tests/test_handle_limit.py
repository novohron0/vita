"""Тег: выбирается один раз при регистрации, потом меняется дважды."""
import os
import sys
import tempfile
from pathlib import Path

from fastapi import HTTPException

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

with tempfile.TemporaryDirectory(prefix="vita-handle-") as data_dir:
    os.environ["VITA_DATA"] = data_dir
    from app import main

    token = "handle-token-" + "5" * 24
    profile = main.ensure_profile(main.ProfileIn(ownerToken=token))
    assert profile["handle"].startswith("vita_"), "новичку выдаётся служебный тег"
    assert profile["handleLeft"] == 2 and profile["handleLocked"] is False

    def rename(handle):
        return main.update_profile(main.ProfileUpdateIn(ownerToken=token, handle=handle))

    # выбор своего тега при регистрации в лимит не идёт
    first = rename("kamil")
    assert first["handle"] == "kamil"
    assert first["handleLeft"] == 2, "выбор тега — это ещё не замена"

    second = rename("kamil_vita")
    assert second["handle"] == "kamil_vita" and second["handleLeft"] == 1

    third = rename("kamil_dots")
    assert third["handle"] == "kamil_dots" and third["handleLeft"] == 0
    assert third["handleLocked"] is True

    try:
        rename("kamil_third")
        raise AssertionError("третья замена должна отбиваться")
    except HTTPException as exc:
        assert exc.status_code == 409 and "только 2 раза" in exc.detail

    # тот же тег заново — не замена, отказа быть не должно
    same = rename("kamil_dots")
    assert same["handle"] == "kamil_dots"

    # имя меняется свободно и после блокировки тега
    named = main.update_profile(main.ProfileUpdateIn(ownerToken=token, name="Камиль"))
    assert named["name"] == "Камиль" and named["handleLocked"] is True

print("Vita handle limit: passed")
