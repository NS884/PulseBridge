#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:8080}"
EMAIL="${EMAIL:-testuser@test.com}"
PASSWORD="${PASSWORD:-password123}"

echo "Checking ${BASE_URL}"

login_response="$(curl -fsS \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"${EMAIL}\",\"password\":\"${PASSWORD}\"}" \
  "${BASE_URL}/auth/login")"

token="$(printf '%s' "${login_response}" | node -e 'let data=""; process.stdin.on("data", c => data += c); process.stdin.on("end", () => console.log(JSON.parse(data).token || ""));')"

if [[ -z "${token}" ]]; then
  echo "Login did not return a token" >&2
  exit 1
fi

patients_response="$(curl -fsS \
  -H "Authorization: Bearer ${token}" \
  "${BASE_URL}/api/patients")"

patient_count="$(printf '%s' "${patients_response}" | node -e 'let data=""; process.stdin.on("data", c => data += c); process.stdin.on("end", () => { const parsed = JSON.parse(data); console.log(Array.isArray(parsed) ? parsed.length : "not-array"); });')"

if [[ "${patient_count}" == "not-array" ]]; then
  echo "Patient API did not return an array" >&2
  exit 1
fi

unique_id="$(date +%s)"
create_payload="$(node -e "console.log(JSON.stringify({name:'Smoke Test ${unique_id}',email:'smoke.${unique_id}@example.com',address:'100 Test Drive',dateOfBirth:'1990-01-01',registeredDate:new Date().toISOString().slice(0,10)}))")"

created_response="$(curl -fsS \
  -H "Authorization: Bearer ${token}" \
  -H "Content-Type: application/json" \
  -d "${create_payload}" \
  "${BASE_URL}/api/patients")"

created_id="$(printf '%s' "${created_response}" | node -e 'let data=""; process.stdin.on("data", c => data += c); process.stdin.on("end", () => console.log(JSON.parse(data).id || ""));')"

if [[ -z "${created_id}" ]]; then
  echo "Create patient did not return an id" >&2
  exit 1
fi

curl -fsS \
  -X DELETE \
  -H "Authorization: Bearer ${token}" \
  "${BASE_URL}/api/patients/${created_id}" >/dev/null

echo "OK: login, list, create, and delete passed against ${BASE_URL}"
