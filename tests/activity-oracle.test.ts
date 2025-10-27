import { describe, it, expect, beforeEach } from "vitest";

const ERR_NOT_AUTHORIZED = 501;
const ERR_INVALID_AMOUNT = 502;
const ERR_INVALID_PRINCIPAL = 503;
const ERR_ORACLE_EXISTS = 504;
const ERR_ORACLE_NOT_FOUND = 505;
const ERR_INVALID_ACTIVITY = 506;
const ERR_INVALID_TIMESTAMP = 507;
const ERR_ALREADY_PROCESSED = 509;
const ERR_RATE_LIMIT = 511;
const ERR_INSUFFICIENT_STAKE = 512;
const ERR_STAKE_LOCKED = 513;
const ERR_INVALID_POINTS = 514;
const ERR_INVALID_STATE = 519;

interface Result<T> {
  ok: boolean;
  value: T;
}

class ActivityOracleMock {
  state = {
    contractOwner: "ST1OWNER",
    tokenContract: "ST2TOKEN",
    pointsPerStep: 10,
    pointsPerWorkout: 100,
    minStakeAmount: 1000000,
    stakeLockPeriod: 1440,
    rateLimitPeriod: 1440,
    initialized: false,
    oracles: new Map<
      string,
      { active: boolean; stake: number; lastActivity: number }
    >(),
    processedHashes: new Map<string, boolean>(),
    rateLimit: new Map<string, number>(),
  };
  caller = "ST1OWNER";
  blockHeight = 1000;
  events: any[] = [];
  tokenTransfers: { from: string; to: string; amount: number }[] = [];
  tokenMints: { to: string; amount: number }[] = [];
  tokenBurns: { amount: number }[] = [];

  reset() {
    this.state = {
      contractOwner: "ST1OWNER",
      tokenContract: "ST2TOKEN",
      pointsPerStep: 10,
      pointsPerWorkout: 100,
      minStakeAmount: 1000000,
      stakeLockPeriod: 1440,
      rateLimitPeriod: 1440,
      initialized: false,
      oracles: new Map(),
      processedHashes: new Map(),
      rateLimit: new Map(),
    };
    this.caller = "ST1OWNER";
    this.blockHeight = 1000;
    this.events = [];
    this.tokenTransfers = [];
    this.tokenMints = [];
    this.tokenBurns = [];
  }

  getPointsPerStep(): Result<number> {
    return { ok: true, value: this.state.pointsPerStep };
  }

  getPointsPerWorkout(): Result<number> {
    return { ok: true, value: this.state.pointsPerWorkout };
  }

  getOracleInfo(oracle: string): any {
    return this.state.oracles.get(oracle) || null;
  }

  isOracleActive(oracle: string): Result<boolean> {
    const info = this.state.oracles.get(oracle);
    return { ok: true, value: !!info?.active };
  }

  initialize(
    token: string,
    pps: number,
    ppw: number,
    stake: number,
    lock: number,
    rate: number
  ): Result<boolean> {
    if (this.caller !== this.state.contractOwner)
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (this.state.initialized) return { ok: false, value: ERR_INVALID_STATE };
    if (!token || token === "SP000000000000000000002Q6VF78")
      return { ok: false, value: ERR_INVALID_PRINCIPAL };
    if (pps <= 0 || ppw <= 0 || stake <= 0)
      return { ok: false, value: ERR_INVALID_AMOUNT };
    this.state.tokenContract = token;
    this.state.pointsPerStep = pps;
    this.state.pointsPerWorkout = ppw;
    this.state.minStakeAmount = stake;
    this.state.stakeLockPeriod = lock;
    this.state.rateLimitPeriod = rate;
    this.state.initialized = true;
    return { ok: true, value: true };
  }

  registerOracle(stakeAmount: number): Result<boolean> {
    if (!this.state.initialized) return { ok: false, value: ERR_INVALID_STATE };
    if (stakeAmount <= 0) return { ok: false, value: ERR_INVALID_AMOUNT };
    if (stakeAmount < this.state.minStakeAmount)
      return { ok: false, value: ERR_INSUFFICIENT_STAKE };
    if (this.state.oracles.has(this.caller))
      return { ok: false, value: ERR_ORACLE_EXISTS };
    this.tokenTransfers.push({
      from: this.caller,
      to: "contract",
      amount: stakeAmount,
    });
    this.state.oracles.set(this.caller, {
      active: true,
      stake: stakeAmount,
      lastActivity: this.blockHeight,
    });
    this.events.push({
      event: "oracle-registered",
      oracle: this.caller,
      stake: stakeAmount,
    });
    return { ok: true, value: true };
  }

  deregisterOracle(): Result<boolean> {
    const info = this.state.oracles.get(this.caller);
    if (!info) return { ok: false, value: ERR_ORACLE_NOT_FOUND };
    const lockedUntil = info.lastActivity + this.state.stakeLockPeriod;
    if (this.blockHeight < lockedUntil)
      return { ok: false, value: ERR_STAKE_LOCKED };
    this.state.oracles.set(this.caller, { ...info, active: false });
    this.tokenTransfers.push({
      from: "contract",
      to: this.caller,
      amount: info.stake,
    });
    this.events.push({ event: "oracle-deregistered", oracle: this.caller });
    return { ok: true, value: true };
  }

  submitActivity(
    user: string,
    activityType: string,
    value: number,
    timestamp: number,
    proofHash: string,
    signature: Uint8Array
  ): Result<number> {
    if (!this.state.initialized) return { ok: false, value: ERR_INVALID_STATE };
    const oracleInfo = this.state.oracles.get(this.caller);
    if (!oracleInfo?.active) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (user === "SP000000000000000000002Q6VF78")
      return { ok: false, value: ERR_INVALID_PRINCIPAL };
    if (this.state.processedHashes.get(proofHash))
      return { ok: false, value: ERR_ALREADY_PROCESSED };
    const last = this.state.rateLimit.get(user) || 0;
    if (this.blockHeight - last < this.state.rateLimitPeriod)
      return { ok: false, value: ERR_RATE_LIMIT };
    if (!["steps", "workout"].includes(activityType))
      return { ok: false, value: ERR_INVALID_ACTIVITY };
    if (value <= 0) return { ok: false, value: ERR_INVALID_AMOUNT };
    if (timestamp > this.blockHeight)
      return { ok: false, value: ERR_INVALID_TIMESTAMP };
    const points =
      activityType === "steps"
        ? value * this.state.pointsPerStep
        : value * this.state.pointsPerWorkout;
    if (points === 0) return { ok: false, value: ERR_INVALID_POINTS };
    this.state.processedHashes.set(proofHash, true);
    this.state.rateLimit.set(user, this.blockHeight);
    this.tokenMints.push({ to: user, amount: points });
    this.state.oracles.set(this.caller, {
      ...oracleInfo,
      lastActivity: this.blockHeight,
    });
    this.events.push({
      event: "activity-submitted",
      user,
      type: activityType,
      value,
      points,
      proof: proofHash,
    });
    return { ok: true, value: points };
  }

  slashOracle(oracle: string, amount: number): Result<boolean> {
    if (this.caller !== this.state.contractOwner)
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    const info = this.state.oracles.get(oracle);
    if (!info) return { ok: false, value: ERR_ORACLE_NOT_FOUND };
    if (amount <= 0 || amount > info.stake)
      return { ok: false, value: ERR_INSUFFICIENT_STAKE };
    this.state.oracles.set(oracle, { ...info, stake: info.stake - amount });
    this.tokenBurns.push({ amount });
    this.events.push({ event: "oracle-slashed", oracle, amount });
    return { ok: true, value: true };
  }

  updatePointsRate(steps: number, workout: number): Result<boolean> {
    if (this.caller !== this.state.contractOwner)
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (steps <= 0 || workout <= 0)
      return { ok: false, value: ERR_INVALID_AMOUNT };
    this.state.pointsPerStep = steps;
    this.state.pointsPerWorkout = workout;
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

describe("ActivityOracle", () => {
  let contract: ActivityOracleMock;

  beforeEach(() => {
    contract = new ActivityOracleMock();
    contract.reset();
  });

  it("initializes successfully", () => {
    const result = contract.initialize("ST2TOKEN", 15, 150, 500000, 720, 2880);
    expect(result.ok).toBe(true);
    expect(contract.state.initialized).toBe(true);
    expect(contract.state.pointsPerStep).toBe(15);
    expect(contract.state.pointsPerWorkout).toBe(150);
  });

  it("rejects initialization by non-owner", () => {
    contract.caller = "ST2USER";
    const result = contract.initialize("ST2TOKEN", 15, 150, 500000, 720, 2880);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("registers oracle successfully", () => {
    contract.initialize("ST2TOKEN", 10, 100, 1000000, 1440, 1440);
    contract.caller = "ST3ORACLE";
    const result = contract.registerOracle(2000000);
    expect(result.ok).toBe(true);
    const info = contract.state.oracles.get("ST3ORACLE");
    expect(info?.active).toBe(true);
    expect(info?.stake).toBe(2000000);
    expect(contract.tokenTransfers[0].amount).toBe(2000000);
  });

  it("rejects oracle registration with insufficient stake", () => {
    contract.initialize("ST2TOKEN", 10, 100, 1000000, 1440, 1440);
    contract.caller = "ST3ORACLE";
    const result = contract.registerOracle(500000);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INSUFFICIENT_STAKE);
  });

  it("enforces rate limit per user", () => {
    contract.initialize("ST2TOKEN", 10, 100, 1000000, 1440, 10);
    contract.caller = "ST3ORACLE";
    contract.registerOracle(2000000);
    contract.submitActivity(
      "ST4USER",
      "steps",
      100,
      900,
      "h1",
      new Uint8Array(65)
    );
    const result = contract.submitActivity(
      "ST4USER",
      "steps",
      100,
      905,
      "h2",
      new Uint8Array(65)
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_RATE_LIMIT);
  });

  it("deregisters oracle after lock period", () => {
    contract.initialize("ST2TOKEN", 10, 100, 1000000, 5, 1440);
    contract.caller = "ST3ORACLE";
    contract.registerOracle(2000000);
    contract.blockHeight = 2000;
    const result = contract.deregisterOracle();
    expect(result.ok).toBe(true);
    const info = contract.state.oracles.get("ST3ORACLE");
    expect(info?.active).toBe(false);
    expect(contract.tokenTransfers[1].amount).toBe(2000000);
  });

  it("slashes oracle successfully", () => {
    contract.initialize("ST2TOKEN", 10, 100, 1000000, 1440, 1440);
    contract.caller = "ST3ORACLE";
    contract.registerOracle(2000000);
    contract.caller = "ST1OWNER";
    const result = contract.slashOracle("ST3ORACLE", 500000);
    expect(result.ok).toBe(true);
    const info = contract.state.oracles.get("ST3ORACLE");
    expect(info?.stake).toBe(1500000);
    expect(contract.tokenBurns[0].amount).toBe(500000);
  });

  it("updates points rate successfully", () => {
    contract.initialize("ST2TOKEN", 10, 100, 1000000, 1440, 1440);
    const result = contract.updatePointsRate(25, 250);
    expect(result.ok).toBe(true);
    expect(contract.state.pointsPerStep).toBe(25);
    expect(contract.state.pointsPerWorkout).toBe(250);
  });

  it("transfers ownership successfully", () => {
    contract.initialize("ST2TOKEN", 10, 100, 1000000, 1440, 1440);
    const result = contract.transferOwnership("ST7NEW");
    expect(result.ok).toBe(true);
    expect(contract.state.contractOwner).toBe("ST7NEW");
  });
});
