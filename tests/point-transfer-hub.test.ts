import { describe, it, expect, beforeEach } from "vitest";

const ERR_NOT_AUTHORIZED = 601;
const ERR_INVALID_AMOUNT = 602;
const ERR_INVALID_PRINCIPAL = 603;
const ERR_PLATFORM_NOT_REGISTERED = 604;
const ERR_INSUFFICIENT_BALANCE = 605;
const ERR_RATE_LIMIT = 607;
const ERR_INVALID_CONVERSION = 608;
const ERR_CONTRACT_NOT_SET = 609;
const ERR_ALREADY_INITIALIZED = 610;
const ERR_INVALID_FEE = 611;
const ERR_PLATFORM_EXISTS = 617;
const ERR_INVALID_STATE = 613;

interface Result<T> {
  ok: boolean;
  value: T;
}

class PointTransferHubMock {
  state = {
    contractOwner: "ST1OWNER",
    tokenContract: "",
    transferFeeBp: 50,
    minTransferAmount: 100,
    rateLimitPeriod: 10,
    initialized: false,
    platforms: new Map<
      string,
      {
        name: string;
        symbol: string;
        decimals: number;
        conversionRate: number;
        active: boolean;
        feeRecipient: string;
      }
    >(),
    userNonce: new Map<string, number>(),
    rateLimit: new Map<string, number>(),
  };
  caller = "ST1OWNER";
  blockHeight = 1000;
  events: any[] = [];
  tokenTransfers: { from: string; to: string; amount: number }[] = [];

  reset() {
    this.state = {
      contractOwner: "ST1OWNER",
      tokenContract: "",
      transferFeeBp: 50,
      minTransferAmount: 100,
      rateLimitPeriod: 10,
      initialized: false,
      platforms: new Map(),
      userNonce: new Map(),
      rateLimit: new Map(),
    };
    this.caller = "ST1OWNER";
    this.blockHeight = 1000;
    this.events = [];
    this.tokenTransfers = [];
  }

  getPlatform(platform: string): any {
    return this.state.platforms.get(platform) || null;
  }

  isPlatformActive(platform: string): Result<boolean> {
    const p = this.state.platforms.get(platform);
    return { ok: true, value: !!p?.active };
  }

  getTransferFee(amount: number): Result<number> {
    return {
      ok: true,
      value: Math.floor((amount * this.state.transferFeeBp) / 10000),
    };
  }

  initialize(
    token: string,
    feeBp: number,
    minAmount: number,
    ratePeriod: number
  ): Result<boolean> {
    if (this.caller !== this.state.contractOwner)
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (this.state.initialized)
      return { ok: false, value: ERR_ALREADY_INITIALIZED };
    if (!token || token === "SP000000000000000000002Q6VF78")
      return { ok: false, value: ERR_INVALID_PRINCIPAL };
    if (feeBp > 500) return { ok: false, value: ERR_INVALID_FEE };
    if (minAmount < 100) return { ok: false, value: ERR_INVALID_AMOUNT };
    this.state.tokenContract = token;
    this.state.transferFeeBp = feeBp;
    this.state.minTransferAmount = minAmount;
    this.state.rateLimitPeriod = ratePeriod;
    this.state.initialized = true;
    return { ok: true, value: true };
  }

  registerPlatform(
    platform: string,
    name: string,
    symbol: string,
    decimals: number,
    conversionRate: number,
    feeRecipient: string
  ): Result<boolean> {
    if (this.caller !== this.state.contractOwner)
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (!this.state.initialized) return { ok: false, value: ERR_INVALID_STATE };
    if (!platform || platform === "SP000000000000000000002Q6VF78")
      return { ok: false, value: ERR_INVALID_PRINCIPAL };
    if (!feeRecipient || feeRecipient === "SP000000000000000000002Q6VF78")
      return { ok: false, value: ERR_INVALID_PRINCIPAL };
    if (name.length === 0) return { ok: false, value: 616 };
    if (symbol.length === 0) return { ok: false, value: 618 };
    if (decimals > 18) return { ok: false, value: 619 };
    if (conversionRate <= 0)
      return { ok: false, value: ERR_INVALID_CONVERSION };
    if (this.state.platforms.has(platform))
      return { ok: false, value: ERR_PLATFORM_EXISTS };
    this.state.platforms.set(platform, {
      name,
      symbol,
      decimals,
      conversionRate,
      active: true,
      feeRecipient,
    });
    this.events.push({ event: "platform-registered", platform, name });
    return { ok: true, value: true };
  }

  updatePlatformStatus(platform: string, active: boolean): Result<boolean> {
    if (this.caller !== this.state.contractOwner)
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (!this.state.platforms.has(platform))
      return { ok: false, value: ERR_PLATFORM_NOT_REGISTERED };
    const p = this.state.platforms.get(platform)!;
    this.state.platforms.set(platform, { ...p, active });
    this.events.push({ event: "platform-status-updated", platform, active });
    return { ok: true, value: true };
  }

  updateConversionRate(platform: string, newRate: number): Result<boolean> {
    if (this.caller !== this.state.contractOwner)
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (!this.state.platforms.has(platform))
      return { ok: false, value: ERR_PLATFORM_NOT_REGISTERED };
    if (newRate <= 0) return { ok: false, value: ERR_INVALID_CONVERSION };
    const p = this.state.platforms.get(platform)!;
    this.state.platforms.set(platform, { ...p, conversionRate: newRate });
    return { ok: true, value: true };
  }

  transferToPlatform(
    amount: number,
    recipientPlatform: string,
    user: string
  ): Result<number> {
    if (!this.state.initialized) return { ok: false, value: ERR_INVALID_STATE };
    if (amount < this.state.minTransferAmount)
      return { ok: false, value: ERR_INVALID_AMOUNT };
    const platform = this.state.platforms.get(recipientPlatform);
    if (!platform || !platform.active)
      return { ok: false, value: ERR_PLATFORM_NOT_REGISTERED };
    if (this.caller !== user) return { ok: false, value: ERR_NOT_AUTHORIZED };
    const last = this.state.rateLimit.get(user) || 0;
    if (this.blockHeight - last < this.state.rateLimitPeriod)
      return { ok: false, value: ERR_RATE_LIMIT };
    const fee = Math.floor((amount * this.state.transferFeeBp) / 10000);
    const netAmount = amount - fee;
    const converted = netAmount * platform.conversionRate;
    const nonce = (this.state.userNonce.get(user) || 0) + 1;
    this.tokenTransfers.push({ from: user, to: "contract", amount });
    this.tokenTransfers.push({
      from: "contract",
      to: platform.feeRecipient,
      amount: fee,
    });
    this.state.userNonce.set(user, nonce);
    this.state.rateLimit.set(user, this.blockHeight);
    this.events.push({
      event: "transfer-to-platform",
      user,
      platform: recipientPlatform,
      amount,
      fee,
      netAmount,
      converted,
      nonce,
    });
    return { ok: true, value: converted };
  }

  transferBetweenUsers(amount: number, recipient: string): Result<number> {
    if (!this.state.initialized) return { ok: false, value: ERR_INVALID_STATE };
    if (amount < this.state.minTransferAmount)
      return { ok: false, value: ERR_INVALID_AMOUNT };
    if (recipient === "SP000000000000000000002Q6VF78")
      return { ok: false, value: ERR_INVALID_PRINCIPAL };
    const last = this.state.rateLimit.get(this.caller) || 0;
    if (this.blockHeight - last < this.state.rateLimitPeriod)
      return { ok: false, value: ERR_RATE_LIMIT };
    const fee = Math.floor((amount * this.state.transferFeeBp) / 10000);
    const netAmount = amount - fee;
    const nonce = (this.state.userNonce.get(this.caller) || 0) + 1;
    this.tokenTransfers.push({ from: this.caller, to: "contract", amount });
    this.tokenTransfers.push({
      from: "contract",
      to: this.state.contractOwner,
      amount: fee,
    });
    this.tokenTransfers.push({
      from: "contract",
      to: recipient,
      amount: netAmount,
    });
    this.state.userNonce.set(this.caller, nonce);
    this.state.rateLimit.set(this.caller, this.blockHeight);
    this.events.push({
      event: "user-to-user-transfer",
      from: this.caller,
      to: recipient,
      amount,
      fee,
      netAmount,
      nonce,
    });
    return { ok: true, value: netAmount };
  }

  updateTransferFee(newFeeBp: number): Result<boolean> {
    if (this.caller !== this.state.contractOwner)
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (newFeeBp > 500) return { ok: false, value: ERR_INVALID_FEE };
    this.state.transferFeeBp = newFeeBp;
    return { ok: true, value: true };
  }

  updateMinTransfer(newMin: number): Result<boolean> {
    if (this.caller !== this.state.contractOwner)
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (newMin < 100) return { ok: false, value: ERR_INVALID_AMOUNT };
    this.state.minTransferAmount = newMin;
    return { ok: true, value: true };
  }

  transferOwnership(newOwner: string): Result<boolean> {
    if (this.caller !== this.state.contractOwner)
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (newOwner === "SP000000000000000000002Q6VF78")
      return { ok: false, value: ERR_INVALID_PRINCIPAL };
    this.state.contractOwner = newOwner;
    return { ok: true, value: true };
  }
}

describe("PointTransferHub", () => {
  let contract: PointTransferHubMock;

  beforeEach(() => {
    contract = new PointTransferHubMock();
    contract.reset();
  });

  it("initializes successfully", () => {
    const result = contract.initialize("ST2TOKEN", 75, 500, 5);
    expect(result.ok).toBe(true);
    expect(contract.state.initialized).toBe(true);
    expect(contract.state.transferFeeBp).toBe(75);
    expect(contract.state.minTransferAmount).toBe(500);
  });

  it("rejects double initialization", () => {
    contract.initialize("ST2TOKEN", 50, 100, 10);
    const result = contract.initialize("ST3TOKEN", 60, 200, 15);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_ALREADY_INITIALIZED);
  });

  it("registers platform successfully", () => {
    contract.initialize("ST2TOKEN", 50, 100, 10);
    const result = contract.registerPlatform(
      "ST3GYM",
      "MegaGym",
      "MGYM",
      6,
      200,
      "ST4FEE"
    );
    expect(result.ok).toBe(true);
    const platform = contract.state.platforms.get("ST3GYM");
    expect(platform?.name).toBe("MegaGym");
    expect(platform?.conversionRate).toBe(200);
    expect(platform?.active).toBe(true);
  });

  it("rejects duplicate platform", () => {
    contract.initialize("ST2TOKEN", 50, 100, 10);
    contract.registerPlatform("ST3GYM", "Gym", "G", 6, 100, "ST4FEE");
    const result = contract.registerPlatform(
      "ST3GYM",
      "Gym2",
      "G2",
      6,
      150,
      "ST5FEE"
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_PLATFORM_EXISTS);
  });

  it("rejects transfer below minimum", () => {
    contract.initialize("ST2TOKEN", 50, 5000, 1);
    contract.caller = "ST5USER";
    const result = contract.transferToPlatform(1000, "ST3APP", "ST5USER");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_AMOUNT);
  });

  it("enforces rate limit", () => {
    contract.initialize("ST2TOKEN", 50, 100, 10);
    contract.registerPlatform("ST3APP", "App", "A", 6, 100, "ST4FEE");
    contract.caller = "ST5USER";
    contract.transferToPlatform(1000, "ST3APP", "ST5USER");
    const result = contract.transferToPlatform(1000, "ST3APP", "ST5USER");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_RATE_LIMIT);
  });

  it("updates fee and min transfer", () => {
    contract.initialize("ST2TOKEN", 50, 100, 10);
    let result = contract.updateTransferFee(300);
    expect(result.ok).toBe(true);
    expect(contract.state.transferFeeBp).toBe(300);
    result = contract.updateMinTransfer(2000);
    expect(result.ok).toBe(true);
    expect(contract.state.minTransferAmount).toBe(2000);
  });

  it("transfers ownership", () => {
    contract.initialize("ST2TOKEN", 50, 100, 10);
    const result = contract.transferOwnership("ST8NEW");
    expect(result.ok).toBe(true);
    expect(contract.state.contractOwner).toBe("ST8NEW");
  });
});
