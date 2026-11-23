"""Bounded, validated image attachments carried by existing authorized question APIs."""
import base64
from binascii import Error as Base64Error
from io import BytesIO
import warnings

try:  # Pillow có trong image mới; image cũ trên VM private chưa có thì dùng kiểm tra cơ bản bên dưới.
    from PIL import Image, UnidentifiedImageError
except ImportError:  # pragma: no cover
    Image = None

MAX_IMAGE_BYTES = 2 * 1024 * 1024
MAX_IMAGE_DATA_URL_LENGTH = 4 * ((MAX_IMAGE_BYTES + 2) // 3) + 32
MAX_IMAGE_PIXELS = 12_000_000
IMAGE_FORMATS = {
    "data:image/png;base64": "PNG",
    "data:image/jpeg;base64": "JPEG",
    "data:image/webp;base64": "WEBP",
}


def validate_question_image(value: str | None) -> str | None:
    if value is None:
        return None
    if len(value) > MAX_IMAGE_DATA_URL_LENGTH:
        raise ValueError("Ảnh tối đa 2 MB")
    header, separator, encoded = value.partition(",")
    if not separator or header not in IMAGE_FORMATS:
        raise ValueError("Chỉ hỗ trợ ảnh PNG, JPEG hoặc WebP")
    try:
        raw = base64.b64decode(encoded, validate=True)
    except (Base64Error, ValueError) as exc:
        raise ValueError("Dữ liệu ảnh không hợp lệ") from exc
    if not raw or len(raw) > MAX_IMAGE_BYTES:
        raise ValueError("Ảnh phải có dữ liệu và không vượt quá 2 MB")
    if Image is None:
        return _validate_without_pillow(header, raw, value)
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(BytesIO(raw)) as image:
                if image.format != IMAGE_FORMATS[header]:
                    raise ValueError("Định dạng ảnh không khớp với dữ liệu")
                if image.width * image.height > MAX_IMAGE_PIXELS:
                    raise ValueError("Ảnh tối đa 12 triệu điểm ảnh")
                if getattr(image, "n_frames", 1) != 1:
                    raise ValueError("Vui lòng chọn ảnh tĩnh")
                image.verify()
            # Some decoders only detect damaged pixel data when it is loaded.
            with Image.open(BytesIO(raw)) as image:
                image.load()
    except (UnidentifiedImageError, OSError, EOFError, SyntaxError,
            Image.DecompressionBombError, Image.DecompressionBombWarning) as exc:
        raise ValueError("Ảnh bị hỏng hoặc không thể đọc được") from exc
    return value


# Chữ ký đầu file của từng định dạng, dùng khi chưa có Pillow (image Docker cũ trên VM private).
_MAGIC = {
    "PNG": lambda b: b.startswith(b"\x89PNG\r\n\x1a\n"),
    "JPEG": lambda b: b.startswith(b"\xff\xd8\xff"),
    "WEBP": lambda b: len(b) >= 12 and b[:4] == b"RIFF" and b[8:12] == b"WEBP",
}


def _validate_without_pillow(header: str, raw: bytes, value: str) -> str:
    """Kiểm tra tối thiểu: đúng định dạng khai báo và kích thước. Build lại image để có kiểm tra đầy đủ."""
    if not _MAGIC[IMAGE_FORMATS[header]](raw):
        raise ValueError("Định dạng ảnh không khớp với dữ liệu")
    return value
