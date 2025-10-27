import { describe, it, expect, beforeEach } from "vitest";
import { ClarityValue, uintCV } from "@stacks/transactions";

const ERR_NOT_AUTHORIZED = 401;
const ERR_INVALID_AMOUNT = 402;
const ERR_INVALID_PRINCIPAL = 403;
const ERR_PAUSED = 404;
const ERR_BLACKLISTED = 405;
const ERR_INSUFFICIENT_BALANCE = 406;
const ERR_INVALID_METADATA = 407;
const ERR_MAX_SUPPLY_EXCEEDED = 408;
const ERR_INVALID_DECIMALS = 409;
const ERR_INVALID_SYMBOL = 410;
const ERR_INVALID_NAME = 411;
const ERR_ALREADY_INITIALIZED = 412;
const ERR_NOT_INITIALIZED = 413;
const ERR_INVALID_URI = 414;
const ERR_MINT_FAILED = 415;
const ERR_BURN_FAILED = 416;
const ERR_TRANSFER_FAILED = 417;
const ERR_PAUSE_FAILED = 418;
const ERR_BLACKLIST_FAILED = 419;
const ERR_UPDATE_FAILED = 420;
const ERR_QUERY_FAILED = 421;
const ERR_INVALID_PARAM = 422;
const ERR_OVERFLOW = 423;
const ERR_UNDERFLOW = 424;
const ERR_DIVISION_BY_ZERO = 425;
const ERR_INVALID_OPERATION = 426;
const ERR_ACCESS_DENIED = 427;
const ERR_CONTRACT_LOCKED = 428;
const ERR_INVALID_STATE = 429;
const ERR_MIGRATION_FAILED = 430;

interface Result<T> {
  ok: boolean;
  value: T;
}

class FitnessPointTokenMock {
  state: {
    contractOwner: string;
    tokenName: string;
    tokenSymbol: string;
    tokenDecimals: number;
    tokenUri: string | null;
    totalSupply: number;
    maxSupply: number;
    paused: boolean;
    initialized: boolean;
    oraclePrincipal: string | null;
    balances: Map<string, number>;
    blacklisted: Map<string, boolean>;
  } = {
    contractOwner: "ST1OWNER",
    tokenName: "FitnessPoint",
    tokenSymbol: "FIT",
    tokenDecimals: 6,
    tokenUri: null,
    totalSupply: 0,
    maxSupply: 1000000000000,
    paused: false,
    initialized: false,
    oraclePrincipal: null,
    balances: new Map(),
    blacklisted: new Map(),
  };
  caller: string = "ST1OWNER";
  events: Array<{ event: string; [key: string]: any }> = [];

  constructor() {
    this.reset();
  }

  reset() {
    this.state = {
      contractOwner: "ST1OWNER",
      tokenName: "FitnessPoint",
      tokenSymbol: "FIT",
      tokenDecimals: 6,
      tokenUri: null,
      totalSupply: 0,
      maxSupply: 1000000000000,
      paused: false,
      initialized: false,
      oraclePrincipal: null,
      balances: new Map(),
      blacklisted: new Map(),
    };
    this.caller = "ST1OWNER";
    this.events = [];
  }

  getName(): Result<string> {
    return { ok: true, value: this.state.tokenName };
  }

  getSymbol(): Result<string> {
    return { ok: true, value: this.state.tokenSymbol };
  }

  getDecimals(): Result<number> {
    return { ok: true, value: this.state.tokenDecimals };
  }

  getBalance(account: string): Result<number> {
    return { ok: true, value: this.state.balances.get(account) || 0 };
  }

  getTotalSupply(): Result<number> {
    return { ok: true, value: this.state.totalSupply };
  }

  getTokenUri(): Result<string | null> {
    return { ok: true, value: this.state.tokenUri };
  }

  isPaused(): Result<boolean> {
    return { ok: true, value: this.state.paused };
  }

  isBlacklisted(account: string): Result<boolean> {
    return { ok: true, value: this.state.blacklisted.get(account) || false };
  }

  initialize(name: string, symbol: string, decimals: number, uri: string | null, max: number): Result<boolean> {
    if (this.caller !== this.state.contractOwner) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (this.state.initialized) return { ok: false, value: ERR_ALREADY_INITIALIZED };
    if (name.length === 0) return { ok: false, value: ERR_INVALID_NAME };
    if (symbol.length === 0) return { ok: false, value: ERR_INVALID_SYMBOL };
    if (decimals > 18) return { ok: false, value: ERR_INVALID_DECIMALS };
    this.state.tokenName = name;
    this.state.tokenSymbol = symbol;
    this.state.tokenDecimals = decimals;
    this.state.tokenUri = uri;
    this.state.maxSupply = max;
    this.state.initialized = true;
    return { ok: true, value: true };
  }

  setOracle(oracle: string): Result<boolean> {
    if (this.caller !== this.state.contractOwner) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (oracle === "SP000000000000000000002Q6VF78") return { ok: false, value: ERR_INVALID_PRINCIPAL };
    this.state.oraclePrincipal = oracle;
    return { ok: true, value: true };
  }

  pause(): Result<boolean> {
    if (this.caller !== this.state.contractOwner) return { ok: false, value: ERR_NOT_AUTHORIZED };
    this.state.paused = true;
    return { ok: true, value: true };
  }

  unpause(): Result<boolean> {
    if (this.caller !== this.state.contractOwner) return { ok: false, value: ERR_NOT_AUTHORIZED };
    this.state.paused = false;
    return { ok: true, value: true };
  }

  blacklist(account: string): Result<boolean> {
    if (this.caller !== this.state.contractOwner) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (account === "SP000000000000000000002Q6VF78") return { ok: false, value: ERR_INVALID_PRINCIPAL };
    this.state.blacklisted.set(account, true);
    return { ok: true, value: true };
  }

  unblacklist(account: string): Result<boolean> {
    if (this.caller !== this.state.contractOwner) return { ok: false, value: ERR_NOT_AUTHORIZED };
    this.state.blacklisted.delete(account);
    return { ok: true, value: true };
  }

  transfer(amount: number, sender: string, recipient: string, memo: Uint8Array | null): Result<boolean> {
    if (!this.state.initialized) return { ok: false, value: ERR_NOT_INITIALIZED };
    if (this.state.paused) return { ok: false, value: ERR_PAUSED };
    if (this.state.blacklisted.get(sender) || false) return { ok: false, value: ERR_BLACKLISTED };
    if (this.state.blacklisted.get(recipient) || false) return { ok: false, value: ERR_BLACKLISTED };
    if (amount <= 0) return { ok: false, value: ERR_INVALID_AMOUNT };
    if (recipient === "SP000000000000000000002Q6VF78") return { ok: false, value: ERR_INVALID_PRINCIPAL };
    if (this.caller !== sender) return { ok: false, value: ERR_NOT_AUTHORIZED };
    const senderBal = this.state.balances.get(sender) || 0;
    if (senderBal < amount) return { ok: false, value: ERR_INSUFFICIENT_BALANCE };
    this.state.balances.set(sender, senderBal - amount);
    const recipBal = this.state.balances.get(recipient) || 0;
    this.state.balances.set(recipient, recipBal + amount);
    this.events.push({ event: "transfer", amount, from: sender, to: recipient, memo });
    return { ok: true, value: true };
  }

  mint(amount: number, recipient: string): Result<boolean> {
    if (!this.state.initialized) return { ok: false, value: ERR_NOT_INITIALIZED };
    if (this.state.paused) return { ok: false, value: ERR_PAUSED };
    if (amount <= 0) return { ok: false, value: ERR_INVALID_AMOUNT };
    if (this.state.totalSupply + amount > this.state.maxSupply) return { ok: false, value: ERR_MAX_SUPPLY_EXCEEDED };
    if (recipient === "SP000000000000000000002Q6VF78") return { ok: false, value: ERR_INVALID_PRINCIPAL };
    if (!this.state.oraclePrincipal) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (this.caller !== this.state.oraclePrincipal) return { ok: false, value: ERR_NOT_AUTHORIZED };
    const recipBal = this.state.balances.get(recipient) || 0;
    this.state.balances.set(recipient, recipBal + amount);
    this.state.totalSupply += amount;
    this.events.push({ event: "mint", amount, to: recipient });
    return { ok: true, value: true };
  }

  burn(amount: number, sender: string): Result<boolean> {
    if (!this.state.initialized) return { ok: false, value: ERR_NOT_INITIALIZED };
    if (this.state.paused) return { ok: false, value: ERR_PAUSED };
    if (amount <= 0) return { ok: false, value: ERR_INVALID_AMOUNT };
    if (this.caller !== sender) return { ok: false, value: ERR_NOT_AUTHORIZED };
    const senderBal = this.state.balances.get(sender) || 0;
    if (senderBal < amount) return { ok: false, value: ERR_INSUFFICIENT_BALANCE };
    this.state.balances.set(sender, senderBal - amount);
    this.state.totalSupply -= amount;
    this.events.push({ event: "burn", amount, from: sender });
    return { ok: true, value: true };
  }

  updateMetadata(name: string, symbol: string, decimals: number, uri: string | null): Result<boolean> {
    if (this.caller !== this.state.contractOwner) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (name.length === 0) return { ok: false, value: ERR_INVALID_NAME };
    if (symbol.length === 0) return { ok: false, value: ERR_INVALID_SYMBOL };
    if (decimals > 18) return { ok: false, value: ERR_INVALID_DECIMALS };
    this.state.tokenName = name;
    this.state.tokenSymbol = symbol;
    this.state.tokenDecimals = decimals;
    this.state.tokenUri = uri;
    return { ok: true, value: true };
  }

  transferOwnership(newOwner: string): Result<boolean> {
    if (this.caller !== this.state.contractOwner) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (newOwner === "SP000000000000000000002Q6VF78") return { ok: false, value: ERR_INVALID_PRINCIPAL };
    this.state.contractOwner = newOwner;
    return { ok: true, value: true };
  }
}

describe("FitnessPointToken", () => {
  let contract: FitnessPointTokenMock;

  beforeEach(() => {
    contract = new FitnessPointTokenMock();
    contract.reset();
  });

  it("initializes successfully", () => {
    const result = contract.initialize("FitToken", "FTK", 8, "https://example.com", 500000000000);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.tokenName).toBe("FitToken");
    expect(contract.state.tokenSymbol).toBe("FTK");
    expect(contract.state.tokenDecimals).toBe(8);
    expect(contract.state.tokenUri).toBe("https://example.com");
    expect(contract.state.maxSupply).toBe(500000000000);
    expect(contract.state.initialized).toBe(true);
  });

  it("rejects initialization if already initialized", () => {
    contract.initialize("FitToken", "FTK", 8, null, 500000000000);
    const result = contract.initialize("NewToken", "NTK", 6, null, 1000000000000);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_ALREADY_INITIALIZED);
  });

  it("rejects initialization by non-owner", () => {
    contract.caller = "ST2USER";
    const result = contract.initialize("FitToken", "FTK", 8, null, 500000000000);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("sets oracle successfully", () => {
    const result = contract.setOracle("ST3ORACLE");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.oraclePrincipal).toBe("ST3ORACLE");
  });

  it("rejects set oracle by non-owner", () => {
    contract.caller = "ST2USER";
    const result = contract.setOracle("ST3ORACLE");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("pauses and unpauses successfully", () => {
    let result = contract.pause();
    expect(result.ok).toBe(true);
    expect(contract.state.paused).toBe(true);
    result = contract.unpause();
    expect(result.ok).toBe(true);
    expect(contract.state.paused).toBe(false);
  });

  it("rejects pause by non-owner", () => {
    contract.caller = "ST2USER";
    const result = contract.pause();
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("blacklists and unblacklists successfully", () => {
    let result = contract.blacklist("ST4BAD");
    expect(result.ok).toBe(true);
    expect(contract.state.blacklisted.get("ST4BAD")).toBe(true);
    result = contract.unblacklist("ST4BAD");
    expect(result.ok).toBe(true);
    expect(contract.state.blacklisted.get("ST4BAD")).toBe(undefined);
  });

  it("rejects blacklist by non-owner", () => {
    contract.caller = "ST2USER";
    const result = contract.blacklist("ST4BAD");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("transfers successfully", () => {
    contract.state.initialized = true;
    contract.state.balances.set("ST1OWNER", 1000);
    const result = contract.transfer(500, "ST1OWNER", "ST5RECIP", null);
    expect(result.ok).toBe(true);
    expect(contract.state.balances.get("ST1OWNER")).toBe(500);
    expect(contract.state.balances.get("ST5RECIP")).toBe(500);
    expect(contract.events[0].event).toBe("transfer");
  });

  it("rejects transfer if paused", () => {
    contract.state.initialized = true;
    contract.state.paused = true;
    const result = contract.transfer(500, "ST1OWNER", "ST5RECIP", null);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_PAUSED);
  });

  it("rejects transfer if sender blacklisted", () => {
    contract.state.initialized = true;
    contract.state.blacklisted.set("ST1OWNER", true);
    const result = contract.transfer(500, "ST1OWNER", "ST5RECIP", null);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_BLACKLISTED);
  });

  it("mints successfully", () => {
    contract.state.initialized = true;
    contract.state.oraclePrincipal = "ST1OWNER";
    const result = contract.mint(1000, "ST6RECIP");
    expect(result.ok).toBe(true);
    expect(contract.state.balances.get("ST6RECIP")).toBe(1000);
    expect(contract.state.totalSupply).toBe(1000);
    expect(contract.events[0].event).toBe("mint");
  });

  it("rejects mint if not oracle", () => {
    contract.state.initialized = true;
    contract.state.oraclePrincipal = "ST3ORACLE";
    const result = contract.mint(1000, "ST6RECIP");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("rejects mint if exceeds max supply", () => {
    contract.state.initialized = true;
    contract.state.oraclePrincipal = "ST1OWNER";
    contract.state.totalSupply = 1000000000000;
    const result = contract.mint(1, "ST6RECIP");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_MAX_SUPPLY_EXCEEDED);
  });

  it("burns successfully", () => {
    contract.state.initialized = true;
    contract.state.balances.set("ST1OWNER", 1000);
    contract.state.totalSupply = 1000;
    const result = contract.burn(500, "ST1OWNER");
    expect(result.ok).toBe(true);
    expect(contract.state.balances.get("ST1OWNER")).toBe(500);
    expect(contract.state.totalSupply).toBe(500);
    expect(contract.events[0].event).toBe("burn");
  });

  it("rejects burn if insufficient balance", () => {
    contract.state.initialized = true;
    contract.state.balances.set("ST1OWNER", 100);
    const result = contract.burn(500, "ST1OWNER");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INSUFFICIENT_BALANCE);
  });

  it("updates metadata successfully", () => {
    const result = contract.updateMetadata("NewFit", "NFT", 12, "https://new.com");
    expect(result.ok).toBe(true);
    expect(contract.state.tokenName).toBe("NewFit");
    expect(contract.state.tokenSymbol).toBe("NFT");
    expect(contract.state.tokenDecimals).toBe(12);
    expect(contract.state.tokenUri).toBe("https://new.com");
  });

  it("rejects update metadata by non-owner", () => {
    contract.caller = "ST2USER";
    const result = contract.updateMetadata("NewFit", "NFT", 12, null);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("transfers ownership successfully", () => {
    const result = contract.transferOwnership("ST7NEWOWNER");
    expect(result.ok).toBe(true);
    expect(contract.state.contractOwner).toBe("ST7NEWOWNER");
  });

  it("rejects transfer ownership by non-owner", () => {
    contract.caller = "ST2USER";
    const result = contract.transferOwnership("ST7NEWOWNER");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("gets balance correctly", () => {
    contract.state.balances.set("ST8USER", 2000);
    const result = contract.getBalance("ST8USER");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(2000);
  });

  it("gets total supply correctly", () => {
    contract.state.totalSupply = 500000;
    const result = contract.getTotalSupply();
    expect(result.ok).toBe(true);
    expect(result.value).toBe(500000);
  });

  it("checks paused status correctly", () => {
    contract.state.paused = true;
    const result = contract.isPaused();
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
  });

  it("checks blacklisted status correctly", () => {
    contract.state.blacklisted.set("ST9BAD", true);
    const result = contract.isBlacklisted("ST9BAD");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
  });
});