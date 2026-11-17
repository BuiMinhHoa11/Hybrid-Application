"""Deterministic scoring shared by the Python worker and its tests."""
import unicodedata
from decimal import Decimal, ROUND_HALF_UP


def normalize_answer(value: str) -> str:
    return " ".join(unicodedata.normalize("NFC", value).split()).casefold()


def _get(row: dict, snake: str, camel: str, default=None):
    return row.get(snake, row.get(camel, default))


def grade_submission(claim: dict) -> dict:
    answers = {str(_get(row, "question_id", "questionId")): row for row in claim.get("answers", [])}
    total, maximum, details = Decimal("0"), Decimal("0"), []
    for question in claim["questions"]:
        key = str(question["id"])
        answer = answers.get(key, {})
        points = Decimal(str(question["points"]))
        selected = _get(answer, "selected_option_ids", "selectedOptionIds", []) or []
        accepted = _get(question, "accepted_answers", "acceptedAnswers", []) or []
        correct_ids = _get(question, "correct_option_ids", "correctOptionIds", []) or []
        text = _get(answer, "text_answer", "textAnswer")
        if question["type"] == "fill_blank":
            # Accept legacy text-array snapshots only when no typed text answer was provided.
            if text is None and len(selected) == 1:
                text = selected[0]
            normalized = normalize_answer(text or "")
            key_answers = accepted or correct_ids
            correct = bool(normalized) and any(normalized == normalize_answer(value) for value in key_answers)
            public_selected = [text] if text else []
            key_ids = key_answers
        elif question["type"] == "multiple_choice":
            correct = bool(correct_ids) and set(selected) == set(correct_ids)
            public_selected, key_ids = selected, correct_ids
        else:
            raise ValueError(f"Chưa hỗ trợ loại câu hỏi: {question['type']}")
        earned = points if correct else Decimal("0")
        total += earned
        maximum += points
        details.append({"questionId": key, "selectedOptionIds": public_selected, "textAnswer": text,
                        "correctOptionIds": key_ids, "acceptedAnswers": accepted,
                        "correct": correct, "earned": float(earned), "max": float(points)})
    round_score = lambda value: float(value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))
    return {"score": round_score(total), "maxScore": round_score(maximum), "details": details}
