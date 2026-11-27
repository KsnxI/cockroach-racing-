#!/bin/bash
H='Content-Type: application/json'
URL=${URL:-localhost:3000}
TS=$(date +%s)
req() { curl -s -w ' [%{http_code}]\n' "$@"; }
j() { P="$1" node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const o=JSON.parse(s);console.log(process.env.P.split('.').reduce((a,k)=>a&&a[k],o))})"; }

reg() { curl -s -X POST $URL/auth/register -H "$H" \
  -d "{\"email\":\"$1_$TS@test.com\",\"password\":\"password123\",\"nickname\":\"$1_${TS: -6}\"}"; }

P1=$(reg p1 | j data.accessToken)
P2=$(reg p2 | j data.accessToken)
BOOKIE=$(curl -s -X POST $URL/auth/login -H "$H" -d '{"email":"bookie@race.com","password":"bookmaker123"}' | j data.accessToken)
[ "$BOOKIE" = "undefined" ] && { echo "Нет букмекера: npm run seed"; exit 1; }
A1="Authorization: Bearer $P1"; A2="Authorization: Bearer $P2"; AB="Authorization: Bearer $BOOKIE"

R1=$(curl -s -X POST $URL/racers -H "$A1" -H "$H" -d '{"name":"Усатый Пират"}' | j data.id)
R2=$(curl -s -X POST $URL/racers -H "$A2" -H "$H" -d '{"name":"Мистер Крошка"}' | j data.id)
START=$(node -e "console.log(new Date(Date.now()+3600e3).toISOString())")
RACE=$(curl -s -X POST $URL/races -H "$AB" -H "$H" -d "{\"title\":\"Кубок $TS\",\"startsAt\":\"$START\"}" | j data.id)
E1=$(curl -s -X POST $URL/races/$RACE/entries -H "$A1" -H "$H" -d "{\"racerId\":\"$R1\"}" | j data.id)
E2=$(curl -s -X POST $URL/races/$RACE/entries -H "$A2" -H "$H" -d "{\"racerId\":\"$R2\"}" | j data.id)
curl -s -X PATCH $URL/races/$RACE/entries/$E1/odds -H "$AB" -H "$H" -d '{"odds":2.5}' > /dev/null
curl -s -X PATCH $URL/races/$RACE/entries/$E2/odds -H "$AB" -H "$H" -d '{"odds":1.8}' > /dev/null
curl -s -X POST $URL/races/$RACE/open-betting -H "$AB" > /dev/null

echo "Ставки: игрок 1 на таракана игрока 2, игрок 2 на таракана игрока 1"
req -X POST $URL/bets -H "$A1" -H "$H" -d "{\"entryId\":\"$E2\",\"amount\":100}" > /dev/null
req -X POST $URL/bets -H "$A2" -H "$H" -d "{\"entryId\":\"$E1\",\"amount\":100}" > /dev/null

echo; echo "1. результат до запуска (409)"
req $URL/races/$RACE/result -H "$A1"
echo; echo "2. игрок запускает заезд (403)"
req -X POST $URL/races/$RACE/run -H "$A1"
echo; echo "3. букмекер запускает заезд (200, standings, commentary, verification: true, true)"
req -X POST $URL/races/$RACE/run -H "$AB"
echo; echo "4. повторный запуск (409)"
req -X POST $URL/races/$RACE/run -H "$AB"
echo; echo "5. результат (200, seed раскрыт)"
req $URL/races/$RACE/result -H "$A1"
echo; echo "6. ставки игрока 1 (одна WON или LOST)"
req "$URL/bets?limit=5" -H "$A1"
echo; echo "7. ставки игрока 2"
req "$URL/bets?limit=5" -H "$A2"
echo; echo "8. транзакции игрока 1"
req "$URL/me/transactions?limit=5" -H "$A1"
echo; echo "9. транзакции игрока 2"
req "$URL/me/transactions?limit=5" -H "$A2"