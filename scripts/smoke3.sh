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

echo "1. заявка таракана игрока 1 (201)"
E1=$(curl -s -X POST $URL/races/$RACE/entries -H "$A1" -H "$H" -d "{\"racerId\":\"$R1\"}" | j data.id); echo $E1
echo "2. игрок 1 заявляет чужого таракана (403)"
req -X POST $URL/races/$RACE/entries -H "$A1" -H "$H" -d "{\"racerId\":\"$R2\"}"
echo "3. заявка таракана игрока 2 (201)"
E2=$(curl -s -X POST $URL/races/$RACE/entries -H "$A2" -H "$H" -d "{\"racerId\":\"$R2\"}" | j data.id); echo $E2
echo "4. повторная заявка (409)"
req -X POST $URL/races/$RACE/entries -H "$A1" -H "$H" -d "{\"racerId\":\"$R1\"}"
echo "5. игрок ставит коэффициент (403)"
req -X PATCH $URL/races/$RACE/entries/$E1/odds -H "$A1" -H "$H" -d '{"odds":2.5}'
echo "6. букмекер ставит коэффициенты (200)"
req -X PATCH $URL/races/$RACE/entries/$E1/odds -H "$AB" -H "$H" -d '{"odds":2.5}'
req -X PATCH $URL/races/$RACE/entries/$E2/odds -H "$AB" -H "$H" -d '{"odds":1.8}'
echo "7. ставка до открытия приёма (409)"
req -X POST $URL/bets -H "$A1" -H "$H" -d "{\"entryId\":\"$E2\",\"amount\":100}"
echo "8. букмекер открывает ставки (200, есть seedHash, нет seed)"
req -X POST $URL/races/$RACE/open-betting -H "$AB"
echo "9. ставка игрока 1 на таракана игрока 2 (201, oddsAtBet 1.80, balance 900)"
req -X POST $URL/bets -H "$A1" -H "$H" -d "{\"entryId\":\"$E2\",\"amount\":100}"
echo "10. ставка на своего таракана (403)"
req -X POST $URL/bets -H "$A1" -H "$H" -d "{\"entryId\":\"$E1\",\"amount\":100}"
echo "11. слишком маленькая ставка (400)"
req -X POST $URL/bets -H "$A1" -H "$H" -d "{\"entryId\":\"$E2\",\"amount\":1}"
echo "12. ставка больше баланса (400 из-за MAX_BET или 422)"
req -X POST $URL/bets -H "$A1" -H "$H" -d "{\"entryId\":\"$E2\",\"amount\":99999}"
echo "13. ставка букмекера (403)"
req -X POST $URL/bets -H "$AB" -H "$H" -d "{\"entryId\":\"$E2\",\"amount\":100}"
echo "14. мои ставки (200, одна)"
req "$URL/bets?status=PENDING&limit=5" -H "$A1"
echo "15. история транзакций игрока 1 (200: бонус, покупка, ставка)"
req "$URL/me/transactions?limit=5" -H "$A1"
echo "16. чужие ставки не видны (200, пусто)"
req "$URL/bets" -H "$A2"
