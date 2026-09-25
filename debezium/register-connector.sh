#!/usr/bin/env bash
# Registers the outbox source connector for ticketdb/events against the
# local Kafka Connect (Debezium) REST API -- mirrors
# tenant-microservice/debezium/register-connector.sh.
set -euo pipefail

CONNECT_URL="${CONNECT_URL:-http://localhost:8083}"
CONFIG_FILE="$(dirname "$0")/ticket-outbox-connector.json"

curl -sf -X POST \
  -H "Content-Type: application/json" \
  --data @"${CONFIG_FILE}" \
  "${CONNECT_URL}/connectors"

echo "Submitted ticket-outbox-connector to ${CONNECT_URL}."
