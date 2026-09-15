import requests

INDEXNOW_KEY = "ab18ee55ab8d4d5ba822aef73d159ea8"
HOST = "search.enovoxtech.com"

def submit_to_indexnow(url_path: str):
    try:
        requests.post(
            "https://api.indexnow.org/indexnow",
            json={
                "host": HOST,
                "key": INDEXNOW_KEY,
                "keyLocation": f"https://{HOST}/{INDEXNOW_KEY}.txt",
                "urlList": [f"https://{HOST}{url_path}"]
            },
            timeout=5
        )
    except Exception:
        pass  # never let this break the actual product creation flow