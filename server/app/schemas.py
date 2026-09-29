from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, HttpUrl


Severity = Literal["high", "medium", "low", "informational"]


class FindingInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1, max_length=120)
    title: str = Field(min_length=1, max_length=240)
    category: str = Field(min_length=1, max_length=100)
    severity: Severity
    confidence: float = Field(ge=0, le=1)
    location: str = Field(default="", max_length=2048)
    evidence: list[str] = Field(default_factory=list, max_length=12)


class AnalyzeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    target: HttpUrl
    domain: str = Field(min_length=1, max_length=253)
    mode: Literal["normal", "research"]
    deterministic_score: int = Field(ge=0, le=100)
    findings: list[FindingInput] = Field(max_length=100)


class JevEvaluation(BaseModel):
    available: bool = True
    provider: Literal["typesafe-jev"] = "typesafe-jev"
    model: str
    riskScore: int = Field(ge=0, le=100)
    category: str
    evidenceQuality: str
    decisions: dict[str, float]
    answers: dict
    usage: dict | None = None


class AnalyzeResponse(BaseModel):
    evaluation: JevEvaluation