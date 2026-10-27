#!/usr/bin/env bash
set -euo pipefail
cd /opt/gejian
umask 077
mkdir -p backups
name="backups/gejian-$(date -u +%Y%m%dT%H%M%SZ).sql.gz"
docker compose exec -T db sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysqldump -u root --single-transaction --no-tablespaces --set-gtid-purged=OFF --routines --triggers gejian' | gzip > "$name"
gzip -t "$name"
echo "Backup created: $name"
