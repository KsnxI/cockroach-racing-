const prisma = require('../db');
const { ApiError } = require('../utils/errors');
const { simulate } = require('../workers/simulate');

const WINNER_PRIZE = 100; // приз владельцу таракана-победителя

async function credit(tx, userId, amount, type) {
  const user = await tx.user.update({
    where: { id: userId },
    data: { balance: { increment: amount } },
  });
  await tx.transaction.create({ data: { userId, type, amount, balanceAfter: user.balance } });
}

// всё в одной транзакции: если что-то упадёт, статус и деньги откатятся
async function runRace(raceId) {
  return prisma.$transaction(
    async (tx) => {
      // «захват» заезда: второй параллельный запуск получит count = 0
      const claimed = await tx.race.updateMany({
        where: { id: raceId, status: 'BETTING_OPEN' },
        data: { status: 'RUNNING' },
      });
      if (claimed.count === 0) throw new ApiError(409, 'Race is not open for running');

      const race = await tx.race.findUnique({
        where: { id: raceId },
        include: {
          entries: { include: { racer: true } },
          bets: { where: { status: 'PENDING' } },
        },
      });

      // защита: если участников меньше двух, отменяем и возвращаем деньги
      if (race.entries.length < 2) {
        for (const bet of race.bets) {
          await tx.bet.update({ where: { id: bet.id }, data: { status: 'REFUNDED', payout: bet.amount } });
          await credit(tx, bet.userId, bet.amount, 'REFUND');
        }
        await tx.race.update({ where: { id: raceId }, data: { status: 'CANCELLED' } });
        return { cancelled: true };
      }

      // снимок характеристик на момент заезда: по нему можно повторить симуляцию позже
      const snapshot = race.entries.map((e) => ({
        id: e.id,
        name: e.racer.name,
        speed: e.racer.speed,
        stamina: e.racer.stamina,
        luck: e.racer.luck,
      }));

      const { results, lines } = simulate(snapshot, race.seed);
      const winnerEntryId = results.find((r) => r.position === 1).entryId;

      for (const r of results) {
        await tx.raceEntry.update({
          where: { id: r.entryId },
          data: { position: r.position, finishTime: r.finishTime },
        });
      }

      // статистика тараканов и приз владельцу победителя
      for (const e of race.entries) {
        const won = e.id === winnerEntryId;
        await tx.racer.update({
          where: { id: e.racerId },
          data: { races: { increment: 1 }, ...(won && { wins: { increment: 1 } }) },
        });
        if (won) await credit(tx, e.racer.ownerId, WINNER_PRIZE, 'PRIZE');
      }

      // расчёт ставок: коэффициент берём тот, что зафиксирован в момент ставки
      for (const bet of race.bets) {
        if (bet.entryId === winnerEntryId) {
          const payout = Math.floor(bet.amount * Number(bet.oddsAtBet));
          await tx.bet.update({ where: { id: bet.id }, data: { status: 'WON', payout } });
          await credit(tx, bet.userId, payout, 'BET_WIN');
        } else {
          await tx.bet.update({ where: { id: bet.id }, data: { status: 'LOST' } });
        }
      }

      await tx.race.update({
        where: { id: raceId },
        data: { status: 'FINISHED', commentary: { snapshot, lines } },
      });

      return { cancelled: false, winnerEntryId };
    },
    { timeout: 20000 }
  );
}

module.exports = { runRace };