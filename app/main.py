from fastapi import FastAPI
from . import models
from fastapi.middleware.cors import CORSMiddleware
from .database import engine
from .routers import products, submissions, pages, developers
from fastapi.staticfiles import StaticFiles
from app.routers import ai
from app.routers import users
from app.routers import verification
from app.routers import google_auth
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import RedirectResponse

models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="Enovox Search")
OLD_HOST = "enovox-search.onrender.com"  
NEW_DOMAIN = "https://search.enovoxtech.com"

class RedirectOldDomainMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        host = request.headers.get("host", "")
        if host == OLD_HOST:
            new_url = f"{NEW_DOMAIN}{request.url.path}"
            if request.url.query:
                new_url += f"?{request.url.query}"
            return RedirectResponse(url=new_url, status_code=301)
        return await call_next(request)

app.add_middleware(RedirectOldDomainMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(products.router)
app.include_router(submissions.router)
app.include_router(pages.router)
app.include_router(developers.router)
app.include_router(ai.router)
app.include_router(users.router)
app.include_router(verification.router)
app.include_router(google_auth.router)
app.mount("/static", StaticFiles(directory="static"), name="static")


@app.get("/ping")
def ping():
    return {"status": "OK"}