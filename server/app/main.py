import hmac
import os

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app.providers.jev import evaluate_with_jev
from app.schemas import AnalyzeRequest, AnalyzeResponse


app = FastAPI(
    title="Laya Website Security Copilot — Jev Gateway",
    version="1.0.0",
    docs_url=None,
    redoc_url=None,
)

allowed_origins = [
    value.strip()
    for value in os.getenv("ALLOWED_EXTENSION_ORIGINS", "").split(",")
    if value.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_origin_regex=r"^chrome-extension://[a-p]{32}$",
    allow_credentials=False,
    allow_methods=["POST", "GET"],
    allow_headers=["Content-Type", "X-Extension-Token"],
)


def authorize(x_extension_token: str | None = Header(default=None)) -> None:
    expected = os.getenv("EXTENSION_API_TOKEN")
    if not expected:
        raise HTTPException(status_code=503, detail="Gateway authentication is not configured")
    if not x_extension_token or not hmac.compare_digest(x_extension_token, expected):
        raise HTTPException(status_code=401, detail="Invalid extension token")


@app.get("/health")
async def health() -> dict:
    return {
        "status": "ok",
        "jev_configured": bool(os.getenv("TYPESAFE_API_KEY")),
        "gateway_auth_configured": bool(os.getenv("EXTENSION_API_TOKEN")),
    }


@app.post("/v1/analyze", response_model=AnalyzeResponse)
async def analyze(
    request: AnalyzeRequest,
    _: None = Depends(authorize),
) -> AnalyzeResponse:
    try:
        evaluation = await evaluate_with_jev(request)
    except RuntimeError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
    return AnalyzeResponse(evaluation=evaluation)