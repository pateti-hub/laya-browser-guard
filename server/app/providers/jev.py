import asyncio
import os
from typing import Any

import httpx

from app.schemas import AnalyzeRequest, JevEvaluation


TYPESAFE_ENDPOINT = os.getenv(
    "TYPESAFE_ENDPOINT",
    "https://api.typesafe.ai/v1/systemone",
)
JEV_MODEL = os.getenv("JEV_MODEL", "jev-latest")

QUESTIONS: dict[str, dict[str, Any]] = {
    "meaningful_concern": {
        "type": "noul",
        "instructions": (
            "Do the passive browser observations contain a meaningful security concern "
            "that merits developer or authorized security-review attention?"
        ),
        "criteria": {
            "true": "At least one observation deserves investigation based on its evidence and context.",
            "false": "The observations are routine, informational, or too weak to justify investigation.",
        },
    },
    "needs_manual_review": {
        "type": "noul",
        "instructions": (
            "Should a human security reviewer investigate these observations? "
            "Do not treat a missing header alone as proof of a vulnerability."
        ),
        "criteria": {
            "true": "Human review is warranted.",
            "false": "No manual security review is warranted from the supplied evidence.",
        },
    },
    "primary_category": {
        "type": "choice",
        "instructions": "Which category best describes the most important supplied observation?",
        "criteria": {
            "secret_exposure": "Potential credential or private-key material in browser-delivered code.",
            "transport_configuration": "HTTPS, mixed-content, or response security-header configuration.",
            "third_party_dependency": "External scripts, iframes, or supply-chain trust boundaries.",
            "credential_form": "Password, identity, or payment form transport and destination.",
            "client_side_code": "Risk-relevant browser-side implementation pattern.",
            "informational": "No meaningful security concern is supported.",
        },
    },
    "evidence_quality": {
        "type": "choice",
        "instructions": "How strong is the supplied evidence for the primary security observation?",
        "criteria": {
            "strong": "Direct deterministic evidence with a specific affected location.",
            "moderate": "Relevant technical evidence, but contextual verification is still required.",
            "weak": "A heuristic signal with plausible benign explanations.",
            "insufficient": "The evidence does not support a security conclusion.",
        },
    },
    "investigation_priority": {
        "type": "score",
        "instructions": (
            "Rate investigation priority from the supplied passive evidence. "
            "Do not assume exploitability and do not reward finding count alone."
        ),
        "criteria": [
            "Informational only",
            "Low priority",
            "Medium priority",
            "High priority",
            "Critical and urgent review",
        ],
    },
}


def _state(request: AnalyzeRequest) -> dict[str, Any]:
    return {
        "target": {
            "url": str(request.target),
            "domain": request.domain,
            "analysis_mode": request.mode,
        },
        "deterministic_score": request.deterministic_score,
        "observations": [
            {
                "id": item.id,
                "title": item.title,
                "category": item.category,
                "severity": item.severity,
                "confidence": item.confidence,
                "location": item.location,
                "evidence": item.evidence,
            }
            for item in request.findings
        ],
        "interpretation_rules": {
            "passive_only": True,
            "finding_does_not_prove_exploitability": True,
            "potential_secret_values_are_redacted": True,
        },
    }


def _normalize(payload: dict[str, Any]) -> JevEvaluation:
    answers = payload.get("answers") or {}
    concern = float((answers.get("meaningful_concern") or {}).get("noul", 0))
    review = float((answers.get("needs_manual_review") or {}).get("noul", 0))
    priority = min(4.0, max(0.0, float((answers.get("investigation_priority") or {}).get("score", 0))))
    quality = str((answers.get("evidence_quality") or {}).get("choice", "insufficient"))
    category = str((answers.get("primary_category") or {}).get("choice", "informational"))
    quality_weight = {
        "strong": 1.0,
        "moderate": 0.8,
        "weak": 0.5,
        "insufficient": 0.2,
    }.get(quality, 0.2)
    risk_score = round((concern * 35 + review * 20 + priority * 25 * 0.45) * quality_weight)
    return JevEvaluation(
        model=str(payload.get("model") or JEV_MODEL),
        riskScore=max(0, min(100, risk_score)),
        category=category,
        evidenceQuality=quality,
        decisions={
            "meaningfulConcern": concern,
            "needsManualReview": review,
        },
        answers=answers,
        usage=payload.get("usage"),
    )


async def evaluate_with_jev(
    request: AnalyzeRequest,
    client: httpx.AsyncClient | None = None,
) -> JevEvaluation:
    api_key = os.getenv("TYPESAFE_API_KEY")
    if not api_key:
        raise RuntimeError("TYPESAFE_API_KEY is not configured")

    owns_client = client is None
    client = client or httpx.AsyncClient(timeout=httpx.Timeout(25.0, connect=8.0))
    try:
        for attempt in range(3):
            response = await client.post(
                TYPESAFE_ENDPOINT,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "state": _state(request),
                    "model": JEV_MODEL,
                    "questions": QUESTIONS,
                },
            )
            if response.status_code not in {429, 529}:
                response.raise_for_status()
                return _normalize(response.json())
            if attempt < 2:
                await asyncio.sleep(0.4 * (2**attempt))
        raise RuntimeError("Jev remained unavailable after retries")
    finally:
        if owns_client:
            await client.aclose()