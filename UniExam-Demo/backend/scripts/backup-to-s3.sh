#!/bin/bash
# Backup PostgreSQL của UniExam lên Amazon S3. CHẠY TRÊN EC2 uniexam-public.
#
# Cách làm: qua đường hầm WireGuard, SSH vào uniexam-private bằng một khóa CHỈ được phép chạy pg_dump,
# nén bản dump, kiểm tra dump trọn vẹn, rồi đẩy lên S3 bằng IAM role của EC2 (không cần khóa AWS).
# Giữ 3 bản gần nhất trên EC2; trên S3 đặt lifecycle rule để tự xóa bản cũ.
# Cài đặt và khôi phục: xem README.production.md, mục 2.6.
set -euo pipefail

BUCKET="${BUCKET:-uniexam-submission-442532936214-ap-southeast-2}"
PREFIX="${PREFIX:-backups/postgres}"
PRIVATE_HOST="${PRIVATE_HOST:-ubuntu@10.200.0.2}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/uniexam-backup}"
LOCAL_DIR="${LOCAL_DIR:-$HOME/uniexam-backups}"
KEEP_LOCAL="${KEEP_LOCAL:-3}"

mkdir -p "$LOCAL_DIR"
STAMP="$(date -u +%Y%m%d-%H%M%S)"
FILE="$LOCAL_DIR/uniexam-$STAMP.sql.gz"

# Khóa SSH bị giới hạn bằng command="..." trong authorized_keys trên private, nên lệnh này luôn là pg_dump.
ssh -i "$SSH_KEY" -o BatchMode=yes -o ConnectTimeout=30 -o ServerAliveInterval=30 "$PRIVATE_HOST" pg_dump \
  | gzip > "$FILE.part"

# Dump trọn vẹn luôn kết thúc bằng dòng này; thiếu là bị đứt giữa chừng.
if ! gunzip -c "$FILE.part" | tail -n 5 | grep -q "PostgreSQL database dump complete"; then
  rm -f "$FILE.part"
  echo "$(date '+%F %T') LOI: ban dump khong tron ven" >&2
  exit 1
fi
mv "$FILE.part" "$FILE"

aws s3 cp "$FILE" "s3://$BUCKET/$PREFIX/$(basename "$FILE")" --only-show-errors

# Chỉ giữ vài bản mới nhất trên EC2 (bản đầy đủ nằm trên S3).
ls -1t "$LOCAL_DIR"/uniexam-*.sql.gz | tail -n +"$((KEEP_LOCAL + 1))" | xargs -r rm -f
echo "$(date '+%F %T') OK $(basename "$FILE") $(du -h "$FILE" | cut -f1) -> s3://$BUCKET/$PREFIX/"
