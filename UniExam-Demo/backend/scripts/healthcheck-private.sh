#!/bin/bash
# Giám sát app trên uniexam-private (thay cho healthcheck của Docker, vốn bị tắt vì VM chậm).
# Cài đặt:
#   cp backend/scripts/healthcheck-private.sh /srv/uniexam/healthcheck.sh && chmod +x /srv/uniexam/healthcheck.sh
#   (crontab -l 2>/dev/null; echo '*/5 * * * * flock -n /tmp/uniexam-health.lock /srv/uniexam/healthcheck.sh') | crontab -
# Xem kết quả: tail -20 /srv/uniexam/health.log
#
# Gọi /health; lỗi 3 lần liên tiếp thì restart container.
# Bỏ qua 20 phút đầu sau khi container bật (máy chậm, app cần thời gian khởi động).
LOG=/srv/uniexam/health.log

check() {   # $1=tên  $2=url  $3=container
  started=$(docker inspect -f '{{.State.StartedAt}}' "$3" 2>/dev/null) || { echo "$(date '+%F %T') $1 KHÔNG CÓ CONTAINER" >> $LOG; return; }
  if [ $(( $(date +%s) - $(date -d "$started" +%s) )) -lt 1200 ]; then
    echo "$(date '+%F %T') $1 đang khởi động, bỏ qua" >> $LOG; return
  fi
  if curl -fsS -m 60 "$2" > /dev/null 2>&1; then
    echo "$(date '+%F %T') $1 OK" >> $LOG; rm -f /tmp/uniexam_fail_$1
  else
    n=$(( $(cat /tmp/uniexam_fail_$1 2>/dev/null || echo 0) + 1 ))
    echo $n > /tmp/uniexam_fail_$1
    echo "$(date '+%F %T') $1 FAIL lần $n" >> $LOG
    if [ $n -ge 3 ]; then
      docker restart "$3" > /dev/null && echo "$(date '+%F %T') $1 ĐÃ RESTART" >> $LOG
      rm -f /tmp/uniexam_fail_$1
    fi
  fi
}

check private-api    http://10.200.0.2:8080/health  uniexam-private-app-private-api-1
check grading-worker http://127.0.0.1:8081/health   uniexam-private-app-grading-worker-1
tail -n 500 $LOG > $LOG.tmp && mv $LOG.tmp $LOG
