import httpx
from bs4 import BeautifulSoup


def fetch_page_text(url: str) -> dict:
    try:
        resp = httpx.get(url, timeout=10, follow_redirects=True, headers={"User-Agent": "Mozilla/5.0"})
        resp.raise_for_status()
    except Exception as e:
        return {"error": f"Could not fetch that page: {e}"}

    soup = BeautifulSoup(resp.text, "html.parser")

    for tag in soup(["script", "style", "noscript"]):
        tag.decompose()

    og_image = None
    og_tag = soup.find("meta", property="og:image")
    if og_tag and og_tag.get("content"):
        og_image = og_tag["content"]

    links = set()
    for a in soup.find_all("a", href=True):
        href = a["href"]
        if any(domain in href for domain in ["twitter.com", "x.com", "facebook.com", "instagram.com", "linkedin.com", "play.google.com", "apps.apple.com"]):
            links.add(href)

    text = soup.get_text(separator=" ", strip=True)
    text = " ".join(text.split())[:8000]

    return {"text": text, "og_image": og_image, "found_links": list(links)}