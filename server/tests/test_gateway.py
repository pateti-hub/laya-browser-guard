import os

import httpx
import pytest
from fastapi.testclient import TestClient

os.environ["EXTENSION_API_TOKEN"] = "test-extension-token"
os.environ["TYPESAFE_API_KEY"] = "test-jev-key"

from app.main import app  # noqa: E402
from app.providers.jev import evaluate_with_jev  # noqa: E402
from app.schemas import AnalyzeRequest  # noqa: E402


SAMPLE = {
    "target": "https://example.com/login",
    "domain": "example.com",
    "mode": "normal",
    "deterministic_score": 40,
    "findings": [
        {
            "id": "password-get-0",
            "title": "Password form uses GET",
            "category": "credential_form",
            "severity": "high",
            "confidence": 0.99,
            "location": "https://example.com/login",
            "evidence": ["A password field is submitted with GET."],
        }
    ],
}


def test_health_does_not_reveal_secrets():
    response = TestClient(app).get("/health")
    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "jev_configured": True,
        "gateway_auth_configured": True,
    }


def test_gateway_requires_extension_token():
    response = TestClient(app).post("/v1/analyze", json=SAMPLE)
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_official_jev_request_and_normalization():
    async def handler(request: httpx.Request) -> httpx.Response:
        assert request.url == "https://api.typesafe.ai/v1/systemone"
        assert request.headers["authorization"] == "Bearer test-jev-key"
        payload = __import__("json").loads(request.content)
        assert payload["model"] == "jev-latest"
        assert set(payload["questions"]) == {
            "meaningful_concern",
            "needs_manual_review",
            "primary_category",
            "evidence_quality",
            "investigation_priority",
        }
        return httpx.Response(
            200,
            json={
                "model": "jev-test",
                "answers": {
                    "meaningful_concern": {"type": "noul", "noul": 0.92},
                    "needs_manual_review": {"type": "noul", "noul": 0.88},
                    "primary_category": {"type": "choice", "choice": "credential_form"},
                    "evidence_quality": {"type": "choice", "choice": "strong"},
                    "investigation_priority": {"type": "score", "score": 3.4},
                },
                "usage": {"input_tokens": 100, "output_tokens": 20},
            },
        )

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        result = await evaluate_with_jev(AnalyzeRequest.model_validate(SAMPLE), client)
    assert result.provider == "typesafe-jev"
    assert result.category == "credential_form"
    assert result.riskScore >= 70