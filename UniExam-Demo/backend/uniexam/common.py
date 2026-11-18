import json
import re
from datetime import datetime, timezone
from decimal import Decimal
from uuid import UUID
from pydantic import BaseModel, ConfigDict


def camel(value: str) -> str:
    return re.sub(r"_([a-z])", lambda m: m[1].upper(), value)


class Schema(BaseModel):
    model_config = ConfigDict(alias_generator=camel, populate_by_name=True, extra="forbid", allow_inf_nan=False)


def now_utc():
    return datetime.now(timezone.utc)


def dto(value):
    if isinstance(value, dict):
        return {camel(str(k)): dto(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [dto(v) for v in value]
    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, Decimal):
        return float(value)
    return value


def dump_json(value):
    def encode(v):
        if isinstance(v, Decimal):
            return float(v)
        if isinstance(v, UUID):
            return str(v)
        return v.isoformat()
    return json.dumps(value, default=encode, ensure_ascii=False, allow_nan=False)


def question_dto(row):
    public = {k: v for k, v in row.items() if k not in {"owner_id", "created_at", "updated_at"}}
    if row.get("type") == "fill_blank":
        public["correct_option_ids"] = row.get("accepted_answers", [])
    return dto(public)
