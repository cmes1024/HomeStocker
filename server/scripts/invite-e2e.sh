#!/usr/bin/env bash
# 分享奖励端到端场景测试（仅本地）。
# 前置：本地 api 已启动且 WECHAT_MOCK_ENABLED=true，例如：
#   docker compose -f docker-compose.yml -f /tmp/hs-local-override.yml up -d --build
# 用法：INVITE_E2E_BASE=http://127.0.0.1:18088 bash server/scripts/invite-e2e.sh
set -u

BASE="${INVITE_E2E_BASE:-http://127.0.0.1:18088}"
STAMP="$(date +%s)"
A="e2e-A-$STAMP"
FAILED=0
PASSED=0

jget() {
  node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{const o=JSON.parse(s);const v='$1'.split('.').reduce((a,k)=>a&&a[k],o);process.stdout.write(v===undefined||v===null?'':String(v))}catch(e){process.stdout.write('')}})"
}
api() {
  curl -s -m 10 -X POST "$BASE$1" -H 'content-type: application/json' -H "X-HS-Token: ${2:-}" -d "$3"
}
login() { api /api/auth/login "" "{\"code\":\"$1\"}" | jget data.token; }
expect() {
  if [ "$2" = "$3" ]; then
    echo "PASS  $1"
    PASSED=$((PASSED + 1))
  else
    echo "FAIL  $1 (got='$2' want='$3')"
    FAILED=$((FAILED + 1))
  fi
}
expect_nonempty() {
  if [ -n "$2" ]; then
    echo "PASS  $1"
    PASSED=$((PASSED + 1))
  else
    echo "FAIL  $1 (empty)"
    FAILED=$((FAILED + 1))
  fi
}

echo "== share-invite e2e @ $BASE =="
HEALTH="$(curl -s -m 5 "$BASE/api/health" | jget ok)"
expect "E2E-0 health" "$HEALTH" "true"
if [ "$HEALTH" != "true" ]; then echo "backend not ready"; exit 1; fi

TA="$(login "$A")"
expect_nonempty "E2E-0 A login" "$TA"

# E2E-1 无家庭不能生成链接
R="$(api /api/family/createInviteLink "$TA" '{}')"
expect "E2E-1 createInviteLink before family" "$(echo "$R" | jget error.code)" "NO_FAMILY"

# A 建家（全程只保留这一个家，避免 leave 解散错对象）
R="$(api /api/family/create "$TA" "{\"name\":\"A家-$STAMP\"}")"
FA="$(echo "$R" | jget data._id)"
expect_nonempty "E2E-2 A create family" "$FA"

# A 生成链接
R="$(api /api/family/createInviteLink "$TA" '{}')"
TOKEN="$(echo "$R" | jget data.token)"
expect_nonempty "E2E-2 createInviteLink" "$TOKEN"
expect "E2E-2 rewardFamilyId frozen" "$(echo "$R" | jget data.rewardFamilyId)" "$FA"

ENT0="$(api /api/family/getEntitlement "$TA" '{}' | jget data.active)"
expect "E2E-2 no VIP before reward" "$ENT0" "false"

activate_new_user() {
  local who="$1" token="$2" label="$3" want="$4" tb r fid c
  tb="$(login "$who")"
  r="$(api /api/family/create "$tb" "{\"name\":\"${who}家\",\"inviteToken\":\"$token\"}")"
  fid="$(echo "$r" | jget data._id)"
  expect_nonempty "$label create family" "$fid"
  c="$(api /api/family/claimInvite "$tb" '{}')"
  expect "$label claim" "$(echo "$c" | jget data.status)" "$want"
}

# E2E-2 / E2E-3 一链多人
activate_new_user "e2e-B1-$STAMP" "$TOKEN" "E2E-2 B1" "granted"
activate_new_user "e2e-B2-$STAMP" "$TOKEN" "E2E-3 B2" "granted"
activate_new_user "e2e-B3-$STAMP" "$TOKEN" "E2E-3 B3" "granted"

ENT1="$(api /api/family/getEntitlement "$TA" '{}' | jget data.active)"
expect "E2E-2 VIP active after reward" "$ENT1" "true"
LINK1="$(api /api/family/getInviteLink "$TA" '{}' | jget data.grantedCount)"
expect "E2E-3 grantedCount=3" "$LINK1" "3"

# E2E-4 同一新人重复领取
TB1="$(login "e2e-B1-$STAMP")"
R="$(api /api/family/claimInvite "$TB1" '{}')"
expect "E2E-4 repeat claim" "$(echo "$R" | jget data.status)" "none"

# E2E-5 老用户（A）不产生归因
R="$(api /api/family/claimInvite "$TA" '{}')"
expect "E2E-5 old user no pending" "$(echo "$R" | jget data.status)" "none"

# E2E-7 / E2E-8 奖励落点被解散后，B4 建家不受影响
R="$(api /api/family/leave "$TA" '{}')"
expect "E2E-7 owner leave dissolves" "$(echo "$R" | jget data.dissolved)" "true"
activate_new_user "e2e-B4-$STAMP" "$TOKEN" "E2E-8 B4 (dead reward target)" "skipped"
TB4="$(login "e2e-B4-$STAMP")"
expect_nonempty "E2E-8 B4 membership survived" "$(api /api/family/getMyFamily "$TB4" '{}' | jget data._id)"

# E2E-9 重新生成：旧链接停用、累计计数不重置
R="$(api /api/family/create "$TA" "{\"name\":\"A新家-$STAMP\"}")"
expect_nonempty "E2E-9 A rebuild family" "$(echo "$R" | jget data._id)"
CODE_A2="$(echo "$R" | jget data.inviteCode)"
R="$(api /api/family/createInviteLink "$TA" '{}')"
TOKEN2="$(echo "$R" | jget data.token)"
expect_nonempty "E2E-9 new token" "$TOKEN2"
expect "E2E-9 count not reset" "$(echo "$R" | jget data.grantedCount)" "3"
activate_new_user "e2e-B5-$STAMP" "$TOKEN" "E2E-9 old link" "none"

# E2E-10 上限（已有 3 次，第 4/5 次成功，第 6 次被拦）
activate_new_user "e2e-B6-$STAMP" "$TOKEN2" "E2E-10 B6" "granted"
activate_new_user "e2e-B7-$STAMP" "$TOKEN2" "E2E-10 B7" "granted"
activate_new_user "e2e-B8-$STAMP" "$TOKEN2" "E2E-10 B8 (cap)" "skipped"
LINK2="$(api /api/family/getInviteLink "$TA" '{}' | jget data.grantedCount)"
expect "E2E-10 grantedCount capped at 5" "$LINK2" "5"

# E2E-11 原邀请码链路回归（用重建家庭的邀请码）
TD="$(login "e2e-D-$STAMP")"
R="$(api /api/family/join "$TD" "{\"inviteCode\":\"$CODE_A2\"}")"
expect_nonempty "E2E-11 join by inviteCode" "$(echo "$R" | jget data.inviteCode)"
TD="$(login "e2e-D-$STAMP")"
R="$(api /api/family/claimInvite "$TD" '{}')"
expect "E2E-11 joined user is not new" "$(echo "$R" | jget data.status)" "none"

echo "== result: passed=$PASSED failed=$FAILED =="
[ "$FAILED" -eq 0 ] || exit 1
