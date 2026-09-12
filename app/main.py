from fastapi import FastAPI
from . import models
from fastapi.middleware.cors import CORSMiddleware
from .database import engine
from .routers import products, submissions, pages, developers
from fastapi.staticfiles import StaticFiles
from app.routers import ai

models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="Enovox Search")
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
app.mount("/static", StaticFiles(directory="static"), name="static")


@app.get("/ping")
def ping():
    return {"status": "OK"}