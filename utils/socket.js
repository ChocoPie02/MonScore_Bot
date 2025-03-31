import axios from "axios";
import chalk from "chalk";
import { Wallet } from "ethers";
import log from "./logger.js";
import { delay, newAgent } from "./helper.js";

class LayerEdgeConnection {
  constructor(proxy = null, privateKey = null, refCode = "ZHsOLsEY") {
    this.refCode = refCode;
    this.proxy = proxy;

    this.axiosConfig = {
      ...(this.proxy && { httpsAgent: newAgent(this.proxy) }),
      timeout: 60000,
      headers: {
        Origin: "https://monadscore.xyz", // Tambahkan header Origin
        Referer: "https://monadscore.xyz/", // Tambahkan header Referer
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36", // Tambahkan header User-Agent
      },
    };

    this.wallet = privateKey ? new Wallet(privateKey) : Wallet.createRandom();
  }

  getWallet() {
    return this.wallet;
  }

  async makeRequest(method, url, config = {}, retries = 30) {
    for (let i = 0; i < retries; i++) {
      try {
        const response = await axios({
          method,
          url,
          ...config,
          ...this.axiosConfig,
        });
        return response;
      } catch (error) {
        if (error?.response?.status === 404 || error?.status === 404) {
          log.error(
            chalk.red(
              `Error 404 : ${
                error?.response?.data?.message || "User not found"
              }`
            )
          );
          return 404;
        } else if (error?.response?.status === 400 || error?.status === 400) {
          log.error(chalk.red(`Error 400 : ${error?.response?.data?.message}`));
          return 400;
        } else if (error?.response?.status === 201 || error?.status === 201) {
          return 201;
        } else if (
          error?.response?.data?.error === true ||
          error?.status === 403
        ) {
          log.error(chalk.red(`Error 403 : ${error?.response?.data?.message}`));
          return 403;
        } else if (i === retries - 1) {
          log.error(`Max retries reached - Request failed:`, error.message);
          if (this.proxy) {
            log.error(`Failed proxy: ${this.proxy}`, error.message);
          }
          return null;
        }

        process.stdout.write(
          chalk.yellow(
            `request failed: ${error.message} => Retrying... (${
              i + 1
            }/${retries})\r`
          )
        );
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }
    return null;
  }

  async registerWallet() {
    const registerData = {
      wallet: this.wallet.address,
      invite: this.refCode || "",
    };

    const response = await this.makeRequest(
      "post",
      `https://mscore.onrender.com/user`,
      { data: registerData }
    );

    if (response && response.data) {
      log.info("Wallet successfully registered", response.data);
      return true;
    } else if (response === 201 || response.data?.statusCode === 201) {
      log.info("Wallet successfully registered", response.data);
      return true;
    } else if (response === 403) {
      log.info("Wallet failed due bad proxy");
      throw new Error("Skipping until got a good proxy");
      ;
    } else {
      log.error("Failed To Register wallets", "error");
      return false;
    }
  }

  async connectNode() {
    const timestamp = Date.now();

    const dataSign = {
      wallet: this.wallet.address,
      startTime: timestamp,
    };

    const response = await this.makeRequest(
      "put",
      `https://mscore.onrender.com/user/update-start-time`,
      { data: dataSign }
    );

    if (response && response.data && response.data.success === true) {
      log.info("Connected Node Successfully", response.data?.message);
      return true;
    } else {
      log.info("Failed to connect Node");
      return false;
    }
  }

  async login() {
    const dataLogin = {
      wallet: this.wallet.address,
    };
    const response = await this.makeRequest(
      "post",
      `https://mscore.onrender.com/user/login`,
      { data: dataLogin }
    );

    if (response === 404) {
      log.info("Node not found in this wallet, trying to regitering wallet...");
      const regis = await this.registerWallet();
      if (regis) {
        return "New Account";
      } else {
        log.warn(regis)
        return false;
      }
    }

    if (response && response.data && response.data.user?.startTime !== null) {
      log.info("Node Status Running ", response.data?.message);
      return response.data;
    } else {
      log.error("Node not running trying to start node...");
      return false;
    }
  }

  async statusTask() {
    const datatask = {
      wallet: this.wallet.address,
    };
    const response = await this.makeRequest(
      "get",
      `https://mscore.onrender.com/user/login`,
      { data: datatask }
    );

    if (response && response.data?.user) {
      log.info(
        `[${this.wallet.address}] Task Done : ${response.data?.user?.claimedTasks}`
      );
      return response.data?.user?.claimedTasks;
    } else {
      log.error("Failed to check task..");
      return false;
    }
  }

  async claimTask(id) {
    const dataTask = {
      wallet: this.wallet.address,
      taskId: id,
    };

    const response = await this.makeRequest(
      "post",
      `https://mscore.onrender.com/user/claim-task`,
      { data: dataTask }
    );

    if (response && response.data) {
      log.info("Task Claim Successfully", response.data?.message);
      return true;
    } else if (response === 400 || response.data?.statusCode === 400) {
      log.error("Failed to claim task Error 400");
      return false;
    } else {
      log.error("Failed to claim task");
      return false;
    }
  }

  async claimDaily() {
    const timestamp = Date.now();
    const message = `I am claiming my daily node point for ${this.wallet.address} at ${timestamp}`;
    const sign = await this.wallet.signMessage(message);
    const wallet = this.wallet.address;

    const dataSign = {
      walletAddress: wallet,
      timestamp: timestamp,
      sign: sign,
    };

    const response = await this.makeRequest(
      "post",
      `https://referralapi.layeredge.io/api/light-node/claim-node-points`,
      { data: dataSign }
    );

    if (response && response.data) {
      log.info("Claim Points Success Result:", response.data);
      return true;
    } else if (response === 405 || response.data.statusCode === 405) {
      return true;
    } else {
      log.error("Failed to Stopping Node and claiming points");
      return false;
    }
  }

  async checkNodePoints() {
    const response = await this.makeRequest(
      "get",
      `https://referralapi.layeredge.io/api/referral/wallet-details/${this.wallet.address}`
    );

    if (response && response.data) {
      log.info(
        `[${this.wallet.address}] Total Points:`,
        response.data.data?.nodePoints || 0
      );
      log.info(
        `[${this.wallet.address}] Total Uptime:`,
        `${Math.floor((response.data.data?.nodePoints || 0) / 2e3)} Hours`
      );
      return response.data.data.nodePoints;
    } else {
      log.error("Failed to check Total Points..");
      return false;
    }
  }

  async checkLastDaily() {
    const response = await this.makeRequest(
      "get",
      `https://referralapi.layeredge.io/api/referral/wallet-details/${this.wallet.address}`
    );

    if (response && response.data) {
      log.info(
        `[${this.wallet.address}] Last Claim Daily:`,
        response.data.data?.lastClaimed || 0
      );
      const lastclaim = response.data.data?.lastClaimed;

      return Date.now() - new Date(lastclaim) >= 24 * 3600 * 1000;
    } else {
      log.error("Failed to check last claim..");
      return false;
    }
  }

  async checkTaskStatus(task) {
    const response = await this.makeRequest(
      "get",
      `https://referralapi.layeredge.io/api/referral/wallet-details/${this.wallet.address}`
    );

    if (response && response.data) {
      const hasTaskDone =
        response.data?.data?.referrals?.some(
          (item) => item.type === "reward" && item.subType === task
        ) ?? false;
      if (hasTaskDone) {
        log.info(
          `[${this.wallet.address}] Status Task:`,
          `${task} Already Done`
        );
        return true;
      } else {
        log.warn(`[${this.wallet.address}] Status Task:`, `${task} Not yet`);
        return false;
      }
    } else {
      log.error("Failed to check task..");
      return false;
    }
  }

  async checkProofTest() {
    const response = await this.makeRequest(
      "get",
      `https://referralapi.layeredge.io/api/card/proof-status/${this.wallet.address}`
    );
    if (response && response.data) {
      log.info(
        `[${this.wallet.address}] Status Submit Proof:`,
        response.data?.data?.hasSubmitted || "Not Available"
      );
      const submission = response.data?.data?.hasSubmitted;
      return submission;
    } else if (response === 404 || response?.data?.statusCode === 404) {
      log.info(`[${this.wallet.address}] Server Status Not Ready`);
      return false;
    } else {
      log.error("Failed to check Proof Test..");
      return false;
    }
  }

  async checkProofCard() {
    const response = await this.makeRequest(
      "get",
      `https://staging-referralapi.layeredge.io/api/card/card-image/${this.wallet.address}`
    );
    if (response && response.data) {
      log.info(
        `[${this.wallet.address}] Status Submit Proof:`,
        response.data?.message
      );
      const submission = response.data?.message;
      return submission;
    } else if (response === 404 || response?.data?.statusCode === 404) {
      log.info(
        `[${this.wallet.address}] Status proof test : `,
        "Not Submited Yet"
      );
      return false;
    } else {
      log.error("Failed to check Proof Card..");
      return false;
    }
  }

  async sendProof() {
    const timestamp = Date.now();
    const message = `I am submitting a proof for LayerEdge at ${timestamp}`;
    const sign = await this.wallet.signMessage(message);
    const wallet = this.wallet.address;

    const dataSign = {
      proof: wallet.slice(-6),
      signature: sign,
      message: message,
      walletAddress: wallet,
    };

    const headi = {
      origin: "https://dashboard.layeredge.io/",
    };

    const response = await this.makeRequest(
      "post",
      `https://referralapi.layeredge.io/api/card/submit-proof`,
      {
        data: dataSign,
      }
    );
    if (response && response.data) {
      log.info("Send Test Proof Status Success Result:", response.data.message);
      return true;
    } else if (response === 405 || response?.data?.statusCode === 405) {
      return true;
    } else if (response === 429 || response?.statusCode === 429) {
      log.info(`[${this.wallet.address}] Status Task:`, `Too Many Requests`);
      if (
        response?.message ===
        "Proof already submitted: Only one submission allowed per address"
      ) {
        log.info(
          `[${this.wallet.address}] Status Task:`,
          `Its technically already done HeHe :)`
        );
        return true;
      } else {
        return false;
      }
    } else {
      log.error("Failed to Send Proof Test");
      return false;
    }
  }

  async claimCard() {
    const wallet = this.wallet.address;

    const dataSign = {
      walletAddress: wallet,
    };

    const response = await this.makeRequest(
      "post",
      `https://staging-referralapi.layeredge.io/api/card/shareable-card`,
      {
        data: dataSign,
      }
    );
    if (response && response.data) {
      log.info("Claim Card Status Result:", response.data.message);
      return true;
    } else if (response === 405 || response?.data?.statusCode === 405) {
      return true;
    } else if (response === 429 || response?.data?.statusCode === 429) {
      log.info(`[${this.wallet.address}] Status Task:`, `Too Many Requests`);
      return false;
    } else if (response === 404 || response?.data?.statusCode === 404) {
      log.warn(`[${this.wallet.address}] This wallet not sending Proof yet`);
      return false;
    } else {
      log.error("Failed to Claim Card");
      return false;
    }
  }

  async taskNodePoint() {
    const timestamp = Date.now();
    const message = `I am claiming my light node run task node points for ${this.wallet.address} at ${timestamp}`;
    const sign = await this.wallet.signMessage(message);
    const wallet = this.wallet.address;

    const dataSign = {
      walletAddress: wallet,
      timestamp: timestamp,
      sign: sign,
    };

    const response = await this.makeRequest(
      "post",
      `https://referralapi.layeredge.io/api/task/node-points`,
      { data: dataSign }
    );

    if (response && response.data) {
      log.info("Claim Points Success Result:", response.data);
      return true;
    } else if (response === 405 || response.data.statusCode === 405) {
      return true;
    } else if (response === 429 || response.data.statusCode === 429) {
      log.info(`[${this.wallet.address}] Status Task:`, `Too Many Request`);
      return true;
    } else {
      log.error("Failed to Send Task Node");
      return false;
    }
  }

  async taskProof() {
    const timestamp = Date.now();
    const message = `I am claiming my proof submission node points for ${this.wallet.address} at ${timestamp}`;
    const sign = await this.wallet.signMessage(message);
    const wallet = this.wallet.address;

    const dataSign = {
      walletAddress: wallet,
      timestamp: timestamp,
      sign: sign,
    };

    const response = await this.makeRequest(
      "post",
      `https://referralapi.layeredge.io/api/task/proof-submission`,
      { data: dataSign }
    );

    if (response && response.data) {
      log.info("Claim Points Success Result:", response.data?.message);
      return true;
    } else if (response === 409 || response.data.statusCode === 409) {
      log.info("Claim Points Already Claimed :", response.data);
      return true;
    } else if (response === 404 || response.data.statusCode === 404) {
      log.info("Claim Points Failed Send Proof First :", response.data);
      return false;
    } else if (response === 429 || response.data.statusCode === 429) {
      log.info(`[${this.wallet.address}] Status Task:`, `Too Many Request`);
      return false;
    } else {
      log.error("Failed to Send task Proof");
      return false;
    }
  }
}

export default LayerEdgeConnection;
