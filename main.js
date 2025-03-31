import fs from "fs/promises";
import log from "./utils/logger.js";
import { readFile, delay } from "./utils/helper.js";
import banner from "./utils/banner.js";
import LayerEdge from "./utils/socket.js";

// Function to read wallets
async function readWallets() {
  try {
    await fs.access("wallets.json");
    const data = await fs.readFile("wallets.json", "utf-8");
    return JSON.parse(data);
  } catch (err) {
    if (err.code === "ENOENT") {
      log.info("No wallets found in wallets.json");
      return [];
    }
    throw err;
  }
}

// Fungsi untuk menulis log waktu
async function logTime(event) {
  const timestamp = new Date().toISOString();
  log.info(`${event} at: ${timestamp}`);
  await fs.appendFile("logs.txt", `${event} at: ${timestamp}\n`);
}

// Fungsi update waktu terakhir diproses
async function updateLastProcessed(address) {
  const wallets = await readWallets();
  const updatedWallets = wallets.map((wallet) => {
    if (wallet.address === address) {
      return {
        ...wallet,
        lastProcessed: new Date().toISOString(),
      };
    }
    return wallet;
  });
  await fs.writeFile("wallets.json", JSON.stringify(updatedWallets, null, 2));
}

// Fungsi update point terakhir
async function updatePoint(address, poin, nextPoint) {
  const wallets = await readWallets();
  const updatedWallets = wallets.map((wallet) => {
    if (wallet.address === address) {
      return {
        ...wallet,
        point: poin,
        next_point: nextPoint,
      };
    }
    return wallet;
  });
  await fs.writeFile("wallets.json", JSON.stringify(updatedWallets, null, 2));
}
// Fungsi update jenis task dan value terakhir
async function updateTask(address, type, data) {
  const wallets = await readWallets();
  const updatedWallets = wallets.map((wallet) => {
    if (wallet.address === address) {
      return {
        ...wallet,
        tasks: {
          ...wallet.tasks,
          [type]: data,
        },
      };
    }
    return wallet;
  });
  await fs.writeFile("wallets.json", JSON.stringify(updatedWallets, null, 2));
}

async function run() {
  try {
    log.info(banner);
    await logTime("Script started");
    await delay(3);

    const proxies = await readFile("proxy.txt");
    let wallets = await readWallets();

    if (proxies.length === 0)
      log.warn("No proxies found in proxy.txt - running without proxies");
    if (wallets.length === 0) {
      log.info('No Wallets found, create new Wallets first "npm run autoref"');
      return;
    }

    log.info("Starting program with wallets:", wallets.length);
    await logTime(`Loaded ${wallets.length} wallets`);

    while (true) {
      // Baca ulang wallet untuk data terbaru
      wallets = await readWallets();

      // Filter wallet yang eligible
      const eligibleWallets = wallets.filter((wallet) => {
        if (!wallet.lastProcessed) return true;
        const lastProcessed = new Date(wallet.lastProcessed);
        return Date.now() - lastProcessed >= 24 * 3600 * 1000;
      });

      if (eligibleWallets.length === 0) {
        log.warn("All wallets are in cooldown. Checking again in 5 Minutes...");
        await delay(300);
        continue;
      }

      log.info(`Processing ${eligibleWallets.length} eligible wallets`);
      await logTime(`Processing ${eligibleWallets.length} eligible wallets`);

      for (const wallet of eligibleWallets) {
        const proxy =
          proxies[Math.floor(Math.random() * proxies.length)] || null;
        try {
          const socket = new LayerEdge(proxy, wallet.privateKey);
          log.info(
            `[${wallet.address}] Processing with proxy: ${proxy || "none"}`
          );

          // 1. Claim points jika node aktif
          log.info(`[${wallet.address}] Claim Daily Node`);
          const lastclaim = await socket.connectNode();
          if (lastclaim) {
            log.info(`[${wallet.address}] Daily Claimed`);
          }

          // 2. Check Task
          const tasksToCheck = ["task001", "task002", "task003"];
          const userStat = await socket.login();
          if (userStat?.user?.claimedTasks.length > 0) {
            tasksToCheck.forEach(async (task) => {
              if (userStat?.user?.claimedTasks.includes(task)) {
                await updateTask(wallet.address, task, true);
              }
            });
          } else if (userStat === "New Account") {
            const lastclaim = await socket.connectNode();
            if (lastclaim) {
              log.info(`[${wallet.address}] Daily Claimed`);
            }
          } else {
            log.info(`[${wallet.address}] Task Not Found`);
          }

          // 3. claim task
          if (wallet?.task?.task001 !== true) {
            const taks01 = await socket.claimTask("task001");
            if (taks01) {
              log.info(`[${wallet.address}] Next Task ...`);
              //update task
              await updateTask(wallet.address, "task001", true);
            }
          }
          if (wallet?.task?.task002 !== true) {
            const taks02 = await socket.claimTask("task002");
            if (taks02) {
              await updateTask(wallet.address, "task002", true);
              log.info(`[${wallet.address}] Next Task ...`);
            }
          }
          if (wallet?.task?.task003 !== true) {
            const taks03 = await socket.claimTask("task003");
            if (taks03) {
              await updateTask(wallet.address, "task003", true);
              log.info(`[${wallet.address}] Claiming Task Done.`);
            }
          }

          // 4. Update Point
          const totalPoints = userStat?.user?.totalPoints;
          const nextPoint = userStat?.user?.nextTotalPoints;
          log.info(
            `[${wallet.address}] Point : ${totalPoints} | Next Point : ${nextPoint}`
          );
          await updatePoint(wallet.address, totalPoints, nextPoint);
          log.info(`[${wallet.address}] Update Point Done.`);

          // 4. Update last processed
          await updateLastProcessed(wallet.address);
          log.info(`[${wallet.address}] Successfully processed`);
        } catch (error) {
          log.error(`[${wallet.address}] Error: ${error.stack}`);
        }
        await delay(5); // Jeda antar wallet
      }

      log.warn("Cycle completed. Next check in 5 minutes...");
      await logTime(
        `Completed Process ${eligibleWallets.length} eligible wallets`
      );
      //await delay(300); // Cek ulang tiap 1 jam
    }
  } catch (error) {
    await logTime("Script crashed");
    log.error("Fatal error:", error);
  }
}

run();
