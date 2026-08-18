import base64
import json
import os
import sys
from pathlib import Path

from ytmusicapi import YTMusic
from ytmusicapi.auth.oauth import OAuthCredentials


def emit(value):
    print(json.dumps(value, separators=(",", ":")))


def get_payload():
    return json.loads(base64.b64decode(sys.argv[2]).decode("utf-8"))


def credentials(payload):
    return OAuthCredentials(os.environ["YTMUSIC_CLIENT_ID"], os.environ["YTMUSIC_CLIENT_SECRET"])


def start(payload):
    return credentials(payload).get_code()


def complete(payload):
    token = credentials(payload).token_from_code(payload["deviceCode"])
    if token.get("error"):
        return {"state": token["error"]}

    token_path = Path(payload["tokenPath"])
    token_path.parent.mkdir(parents=True, exist_ok=True)
    token_path.write_text(json.dumps(token), encoding="utf-8")
    return {"state": "connected"}


def history(payload):
    client = credentials(payload)
    music = YTMusic(payload["tokenPath"], oauth_credentials=client)
    tracks = []
    for item in music.get_history()[: payload.get("limit", 10)]:
        artists = ", ".join(artist.get("name", "") for artist in item.get("artists", []) if artist.get("name"))
        album = item.get("album") or {}
        thumbnails = item.get("thumbnails") or []
        artwork = next((image.get("url") for image in reversed(thumbnails) if image.get("url")), None)
        tracks.append(
            {
                "youtubeId": item.get("videoId"),
                "title": item.get("title") or "YouTube Music track",
                "artist": artists or "Unknown artist",
                "album": album.get("name") if isinstance(album, dict) else str(album or "YouTube Music"),
                "artwork": artwork,
                "playedAt": item.get("played"),
                "youtubeUrl": f"https://music.youtube.com/watch?v={item['videoId']}" if item.get("videoId") else None,
            }
        )
    return {"tracks": tracks}


def main():
    action = sys.argv[1]
    payload = get_payload()
    actions = {"start": start, "complete": complete, "history": history}
    emit(actions[action](payload))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        emit({"error": str(error)})
        sys.exit(1)

