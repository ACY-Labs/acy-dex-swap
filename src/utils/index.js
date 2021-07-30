import { abi as IUniswapV2Router02ABI } from "../abis/IUniswapV2Router02.json";
import ERC20ABI from "../abis/ERC20.json";
import { getAddress } from "@ethersproject/address";
import { Contract } from "@ethersproject/contracts";
import { AddressZero } from "@ethersproject/constants";
import { BigNumber } from "@ethersproject/bignumber";
import { parseUnits, formatUnits } from "@ethersproject/units";
import {
  JSBI,
  Token,
  TokenAmount,
  TradeType,
  Route,
  Trade,
  Fetcher,
  Percent,
  WETH,
  ETHER,
  CurrencyAmount,
  InsufficientReservesError,
  FACTORY_ADDRESS,
} from "@uniswap/sdk";
import { MaxUint256 } from "@ethersproject/constants";
export const INITIAL_ALLOWED_SLIPPAGE = 50; //bips

// export const ROUTER_ADDRESS = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D";
export const ROUTER_ADDRESS = "0xC9855C11b7aDc08869069fA6465da1A42B813D78";

export function isAddress(value) {
  try {
    return getAddress(value);
  } catch {
    return false;
  }
}

// account is not optional
export function getSigner(library, account) {
  return library.getSigner(account).connectUnchecked();
}

// account is optional
export function getProviderOrSigner(library, account) {
  return account ? getSigner(library, account) : library;
}

// account is optional
export function getContract(address, ABI, library, account) {
  if (!isAddress(address) || address === AddressZero) {
    throw Error(`Invalid 'address' parameter '${address}'.`);
  }

  return new Contract(address, ABI, getProviderOrSigner(library, account));
}
export function getRouterContract(library, account) {
  return getContract(ROUTER_ADDRESS, IUniswapV2Router02ABI, library, account);
}

// add 10%
export function calculateGasMargin(value) {
  return value
    .mul(BigNumber.from(10000).add(BigNumber.from(1000)))
    .div(BigNumber.from(10000));
}

export function isZero(hexNumberString) {
  return /^0x0*$/.test(hexNumberString);
}

export async function getAllowance(
  tokenAddress,
  owner,
  spender,
  library,
  account
) {
  let tokenContract = getContract(tokenAddress, ERC20ABI, library, account);
  let allowance = await tokenContract.allowance(owner, spender);
  console.log(allowance);
  return allowance;
}

export class ACYSwapErrorStatus {
  getErrorText() {
    return this.errorText;
  }
  constructor(errorText) {
    this.errorText = errorText;
  }
}

const BASE_FEE = new Percent(JSBI.BigInt(30), JSBI.BigInt(10000));
const ONE_HUNDRED_PERCENT = new Percent(JSBI.BigInt(10000), JSBI.BigInt(10000));
const INPUT_FRACTION_AFTER_FEE = ONE_HUNDRED_PERCENT.subtract(BASE_FEE);

export function computeTradePriceBreakdown(trade) {
  // for each hop in our trade, take away the x*y=k price impact from 0.3% fees
  // e.g. for 3 tokens/2 hops: 1 - ((1 - .03) * (1-.03))
  const realizedLPFee = !trade
    ? undefined
    : ONE_HUNDRED_PERCENT.subtract(
        trade.route.pairs.reduce(
          (currentFee) => currentFee.multiply(INPUT_FRACTION_AFTER_FEE),
          ONE_HUNDRED_PERCENT
        )
      );

  // remove lp fees from price impact
  const priceImpactWithoutFeeFraction =
    trade && realizedLPFee
      ? trade.priceImpact.subtract(realizedLPFee)
      : undefined;

  // the x*y=k impact
  const priceImpactWithoutFeePercent = priceImpactWithoutFeeFraction
    ? new Percent(
        priceImpactWithoutFeeFraction?.numerator,
        priceImpactWithoutFeeFraction?.denominator
      )
    : undefined;

  // the amount of the input that accrues to LPs
  const realizedLPFeeAmount =
    realizedLPFee &&
    trade &&
    (trade.inputAmount instanceof TokenAmount
      ? new TokenAmount(
          trade.inputAmount.token,
          realizedLPFee.multiply(trade.inputAmount.raw).quotient
        )
      : CurrencyAmount.ether(
          realizedLPFee.multiply(trade.inputAmount.raw).quotient
        ));

  return {
    priceImpactWithoutFee: priceImpactWithoutFeePercent,
    realizedLPFee: realizedLPFeeAmount,
  };
}

export async function getUserTokenAmount(token, account, library) {
  if (token === ETHER) {
    return await library.getBalance(account);
  } else {
    let contractToCheckForBalance = getContract(
      token.address,
      ERC20ABI,
      library,
      account
    );
    return await contractToCheckForBalance.balanceOf(account);
  }
}

export async function getUserTokenAmountExact(token, account, library) {
  return formatUnits(
    await getUserTokenAmount(token, account, library),
    token.decimals
  );
}

export function calculateSlippageAmount(value, slippage) {
  if (slippage < 0 || slippage > 10000) {
    throw Error(`Unexpected slippage value: ${slippage}`);
  }
  return [
    JSBI.divide(
      JSBI.multiply(value.raw, JSBI.BigInt(10000 - slippage)),
      JSBI.BigInt(10000)
    ),
    JSBI.divide(
      JSBI.multiply(value.raw, JSBI.BigInt(10000 + slippage)),
      JSBI.BigInt(10000)
    ),
  ];
}

export async function approve(tokenAddress, requiredAmount, library, account) {
  if (requiredAmount === "0") {
    console.log("Unncessary call to approve");
    return;
  }

  let allowance = await getAllowance(
    tokenAddress,
    account, // owner
    ROUTER_ADDRESS, //spender
    library, // provider
    account // active account
  );

  console.log(`ALLOWANCE FOR TOKEN ${tokenAddress}`);
  console.log(allowance);

  console.log("REquired amount");
  console.log(requiredAmount);
  if (allowance.lt(BigNumber.from(requiredAmount))) {
    let tokenContract = getContract(tokenAddress, ERC20ABI, library, account);
    let useExact = false;
    console.log("NOT ENOUGH ALLOWANCE");
    // try to get max allowance
    let estimatedGas = await tokenContract.estimateGas["approve"](
      ROUTER_ADDRESS,
      MaxUint256
    ).catch(() => {
      // general fallback for tokens who restrict approval amounts
      useExact = true;
      return tokenContract.estimateGas.approve(
        ROUTER_ADDRESS,
        requiredAmount.raw.toString()
      );
    });

    console.log(`Exact? ${useExact}`);
    await tokenContract.approve(
      ROUTER_ADDRESS,
      useExact ? requiredAmount.raw.toString() : MaxUint256,
      {
        gasLimit: calculateGasMargin(estimatedGas),
      }
    );
  } else {
    console.log("Allowance sufficient");
    return;
  }
}

export async function checkTokenIsApproved(
  tokenAddress,
  requiredAmount,
  library,
  account
) {
  let allowance = await getAllowance(
    tokenAddress,
    account, // owner
    ROUTER_ADDRESS, //spender
    library, // provider
    account // active account
  );

  console.log("REQUIRED AMOUNT:");
  console.log(requiredAmount);
  console.log(`ALLOWANCE FOR TOKEN ${tokenAddress}:`);
  console.log(allowance);

  return allowance.gte(BigNumber.from(requiredAmount));
}

export async function swapGetEstimated(
  inputToken0,
  inputToken1,
  exactIn = true,
  chainId,
  library
) {
  let {
    address: token0Address,
    symbol: token0Symbol,
    decimal: token0Decimal,
    amount: token0Amount,
  } = inputToken0;
  let {
    address: token1Address,
    symbol: token1Symbol,
    decimal: token1Decimal,
    amount: token1Amount,
  } = inputToken1;

  if (exactIn && (isNaN(parseFloat(token0Amount)) || token0Amount === ""))
    return;
  if (!exactIn && (isNaN(parseFloat(token1Amount)) || token1Amount === ""))
    return;

  let token0IsETH = token0Symbol === "ETH";
  let token1IsETH = token1Symbol === "ETH";

  // if one is ETH and other WETH, use WETH contract's deposit and withdraw
  // wrap ETH into WETH
  if (
    (token0IsETH && token1Symbol === "WETH") ||
    (token0Symbol === "WETH" && token1IsETH)
  ) {
    // UI should sync value of ETH and WETH
    if (exactIn) return token0Amount;
    else return token1Amount;
  }
  // ETH <-> Non-WETH ERC20     OR     Non-WETH ERC20 <-> Non-WETH ERC20
  else {
    // use WETH for ETHER to work with Uniswap V2 SDK
    const token0 = token0IsETH
      ? WETH[chainId]
      : new Token(chainId, token0Address, token0Decimal, token0Symbol);
    const token1 = token1IsETH
      ? WETH[chainId]
      : new Token(chainId, token1Address, token1Decimal, token1Symbol);

    if (token0.equals(token1)) return exactIn ? token0Amount : token1Amount;

    // get pair using our own provider
    const pair = await Fetcher.fetchPairData(token0, token1, library).catch(
      (e) => {
        return new ACYSwapErrorStatus(
          `${token0.symbol} - ${token1.symbol} pool does not exist. Create one?`
        );
      }
    );
    if (pair instanceof ACYSwapErrorStatus)
      return exactIn ? token1Amount : token0Amount;
    console.log(pair);

    console.log("------------------ CONSTRUCT ROUTE ------------------");
    // This is where we let Uniswap SDK know we are not using WETH but ETHER
    const route = new Route(
      [pair],
      token0IsETH ? ETHER : token0,
      token1IsETH ? ETHER : token1
    );
    console.log(route);

    console.log("------------------ PARSE AMOUNT ------------------");
    // convert typed in amount to BigNumbe rusing ethers.js's parseUnits then to string,
    console.log(token0Amount);
    console.log(token0Decimal);
    let parsedAmount = exactIn
      ? new TokenAmount(
          token0,
          parseUnits(token0Amount, token0Decimal)
        ).raw.toString(16)
      : new TokenAmount(
          token1,
          parseUnits(token1Amount, token1Decimal)
        ).raw.toString(16);

    let inputAmount;

    // CurrencyAmount instance is required for Trade contructor if input is ETHER
    if ((token0IsETH && exactIn) || (token1IsETH && !exactIn)) {
      inputAmount = new CurrencyAmount(ETHER, `0x${parsedAmount}`);
    } else {
      inputAmount = new TokenAmount(
        exactIn ? token0 : token1,
        `0x${parsedAmount}`
      );
    }

    console.log("------------------ CONSTRUCT TRADE ------------------");
    let trade;
    try {
      trade = new Trade(
        route,
        inputAmount,
        exactIn ? TradeType.EXACT_INPUT : TradeType.EXACT_OUTPUT
      );
    } catch (e) {
      if (e instanceof InsufficientReservesError) {
        console.log("Insufficient reserve!");
      } else {
        console.log("Unhandled exception!");
        console.log(e);
      }
      return exactIn ? token1Amount : token0Amount;
    }

    if (exactIn) {
      console.log(trade.outputAmount.toExact());

      return trade.outputAmount.toExact();
    } else {
      console.log(trade.inputAmount.toExact());

      return trade.inputAmount.toExact();
    }
  }
}

export async function addLiquidityGetEstimated(
  inputToken0,
  inputToken1,
  exactIn = true,
  chainId,
  library
) {
  let {
    address: token0Address,
    symbol: token0Symbol,
    decimal: token0Decimal,
    amount: token0Amount,
  } = inputToken0;
  let {
    address: token1Address,
    symbol: token1Symbol,
    decimal: token1Decimal,
    amount: token1Amount,
  } = inputToken1;

  if (exactIn && (isNaN(parseFloat(token0Amount)) || token0Amount === ""))
    return;
  if (!exactIn && (isNaN(parseFloat(token1Amount)) || token1Amount === ""))
    return;
  let token0IsETH = token0Symbol === "ETH";
  let token1IsETH = token1Symbol === "ETH";

  if (
    (token0IsETH && token1Symbol === "WETH") ||
    (token0Symbol === "WETH" && token1IsETH)
  ) {
    return;
  }
  // ETH <-> Non-WETH ERC20     OR     Non-WETH ERC20 <-> Non-WETH ERC20
  else {
    // use WETH for ETHER to work with Uniswap V2 SDK
    const token0 = token0IsETH
      ? WETH[chainId]
      : new Token(chainId, token0Address, token0Decimal, token0Symbol);
    const token1 = token1IsETH
      ? WETH[chainId]
      : new Token(chainId, token1Address, token1Decimal, token1Symbol);

    if (token0.equals(token1)) return;

    // get pair using our own provider
    const pair = await Fetcher.fetchPairData(token0, token1, library).catch(
      (e) => {
        return new ACYSwapErrorStatus(
          `${token0.symbol} - ${token1.symbol} pool does not exist. Create one?`
        );
      }
    );
    if (pair instanceof ACYSwapErrorStatus)
      return exactIn ? token1Amount : token0Amount;
    console.log(pair);

    console.log("------------------ PARSE AMOUNT ------------------");
    // convert typed in amount to BigNumber rusing ethers.js's parseUnits then to string,
    console.log(token0Amount);
    console.log(token0Decimal);
    let parsedAmount = exactIn
      ? new TokenAmount(
          token0,
          parseUnits(token0Amount, token0Decimal)
        ).raw.toString(16)
      : new TokenAmount(
          token1,
          parseUnits(token1Amount, token1Decimal)
        ).raw.toString(16);

    let inputAmount;

    // CurrencyAmount instance is required for Trade contructor if input is ETHER
    if ((token0IsETH && exactIn) || (token1IsETH && !exactIn)) {
      inputAmount = new CurrencyAmount(ETHER, `0x${parsedAmount}`);
    } else {
      inputAmount = new TokenAmount(
        exactIn ? token0 : token1,
        `0x${parsedAmount}`
      );
    }

    console.log("estimated dependent amount");

    // console.log(pair.priceOf(token0).quote(inputAmount).raw.toString());
    let dependentTokenAmount = pair
      .priceOf(token0)
      .quote(new TokenAmount(token0, inputAmount.raw));
    let parsed =
      token1 === ETHER
        ? CurrencyAmount.ether(dependentTokenAmount.raw)
        : dependentTokenAmount;

    console.log(parsed.toExact());
    return parsed.toExact();
  }
}

export async function getUserTokenBalance(token, chainId, account, library) {
  let { address, symbol, decimal } = token;

  if (!token) return;
  let tokenIsETH = symbol === "ETH";
  return await getUserTokenAmountExact(
    tokenIsETH ? ETHER : new Token(chainId, address, decimal, symbol),
    account,
    library
  );
}
