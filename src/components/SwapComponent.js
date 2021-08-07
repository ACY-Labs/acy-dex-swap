import { useWeb3React } from "@web3-react/core";
import { InjectedConnector } from "@web3-react/injected-connector";
import { useState, useEffect, useCallback } from "react";
import {
  getRouterContract,
  calculateGasMargin,
  getContract,
  isZero,
  ROUTER_ADDRESS,
  getAllowance,
  ACYSwapErrorStatus,
  computeTradePriceBreakdown,
  getUserTokenAmount,
  swapGetEstimated,
  approve,
  checkTokenIsApproved,
  getUserTokenBalance,
  INITIAL_ALLOWED_SLIPPAGE,
} from "../utils";
import { Form, Button, Alert, Dropdown } from "react-bootstrap";
import WETHABI from "../abis/WETH.json";
import {
  Token,
  TokenAmount,
  Pair,
  TradeType,
  Route,
  Trade,
  Fetcher,
  Percent,
  Router,
  WETH,
  ETHER,
  CurrencyAmount,
  InsufficientReservesError,
  FACTORY_ADDRESS,
} from "@uniswap/sdk";
import { BigNumber } from "@ethersproject/bignumber";
import { parseUnits } from "@ethersproject/units";

async function swap(
  inputToken0,
  inputToken1,
  allowedSlippage = INITIAL_ALLOWED_SLIPPAGE,
  exactIn = true,
  chainId,
  library,
  account,
  setNeedApprove,
  setApproveAmount,
  setSwapStatus,
  setSwapBreakdown,
  setToken0Amount,
  setToken1Amount
) {
  let status = await (async () => {
    // check uniswap
    console.log(FACTORY_ADDRESS);

    // change slippage from bips (0.01%) into percentage
    allowedSlippage = new Percent(allowedSlippage, 10000);

    let contract = getRouterContract(library, account);

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

    console.log(`input: ${token0Amount}`);
    let token0IsETH = token0Symbol === "ETH";
    let token1IsETH = token1Symbol === "ETH";

    if (!inputToken0.symbol || !inputToken1.symbol)
      return new ACYSwapErrorStatus("One or more token input is missing");
    if (exactIn && (isNaN(parseFloat(token0Amount)) || token0Amount === "0"))
      return new ACYSwapErrorStatus("Format Error");
    if (!exactIn && (isNaN(parseFloat(token1Amount)) || token1Amount === "0"))
      return new ACYSwapErrorStatus("Format Error");

    console.log(inputToken0);
    console.log(inputToken1);
    if (token0IsETH && token1IsETH)
      return new ACYSwapErrorStatus("Doesn't support ETH to ETH");

    // check user account balance
    console.log("------------------ CHECK BALANCE ------------------");
    // Big Number comparison
    let userToken0Balance = await getUserTokenAmount(
      token0IsETH
        ? ETHER
        : new Token(chainId, token0Address, token0Decimal, token0Symbol),
      account,
      library
    );

    console.log(userToken0Balance);
    let userHasSufficientBalance = userToken0Balance.gt(
      parseUnits(token0Amount, token0Decimal)
    );

    // quit if user doesn't have enough balance, otherwise this will cause error
    if (!userHasSufficientBalance)
      return new ACYSwapErrorStatus("Not enough balance");

    let wethContract;

    console.log("------------------ WRAP OR SWAP  ------------------");
    // if one is ETH and other WETH, use WETH contract's deposit and withdraw
    // wrap ETH into WETH
    if (token0IsETH && token1Symbol === "WETH") {
      console.log("WRAP");

      // UI should sync value of ETH and WETH
      if (exactIn) setToken1Amount(token0Amount);
      else setToken0Amount(token1Amount);

      wethContract = getContract(token1Address, WETHABI, library, account);
      let wrappedAmount = BigNumber.from(
        parseUnits(token0Amount, token0Decimal)
      ).toHexString();
      let result = await wethContract
        .deposit({
          value: wrappedAmount,
        })
        .catch((e) => {
          console.log(e);
          return new ACYSwapErrorStatus("WETH Deposit failed");
        });

      return result;
    }
    // unwrap WETH into ETH
    else if (token0Symbol === "WETH" && token1IsETH) {
      console.log("UNWRAP");

      // UI should sync value of ETH and WETH
      if (exactIn) setToken1Amount(token0Amount);
      else setToken0Amount(token1Amount);

      wethContract = getContract(token0Address, WETHABI, library, account);

      let wrappedAmount = BigNumber.from(
        parseUnits(token0Amount, token0Decimal)
      ).toHexString();

      let result = await wethContract.withdraw(wrappedAmount).catch((e) => {
        console.log(e);
        return new ACYSwapErrorStatus("WETH Withdrawal failed");
      });
      return result;
    }
    // ETH <-> Non-WETH ERC20     OR     Non-WETH ERC20 <-> Non-WETH ERC20
    else {
      console.log("SWAP");

      console.log("------------------ CONSTRUCT TOKEN ------------------");
      // use WETH for ETHER to work with Uniswap V2 SDK
      const token0 = token0IsETH
        ? WETH[chainId]
        : new Token(chainId, token0Address, token0Decimal, token0Symbol);
      const token1 = token1IsETH
        ? WETH[chainId]
        : new Token(chainId, token1Address, token1Decimal, token1Symbol);

      console.log(token0);
      console.log(token1);

      // quit if the two tokens are equivalent, i.e. have the same chainId and address
      if (token0.equals(token1)) return new ACYSwapErrorStatus("Equal tokens!");

      // helper function from uniswap sdk to get pair address, probably needed if want to replace fetchPairData
      let pairAddress = Pair.getAddress(token0, token1);
      console.log(`Pair address: ${pairAddress}`);

      // get pair using our own provider
      console.log("------------------ CONSTRUCT PAIR ------------------");
      console.log("FETCH");
      const pair = await Fetcher.fetchPairData(token0, token1, library).catch(
        (e) => {
          return new ACYSwapErrorStatus(
            `${token0.symbol} - ${token1.symbol} pool does not exist. Create one?`
          );
        }
      );
      if (pair instanceof ACYSwapErrorStatus) return pair;

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
        return new ACYSwapErrorStatus("Error with Trade object");
      }

      console.log(trade);

      console.log("------------------ SLIPPAGE CALCULATE ------------------");
      let slippageAdjustedAmount;
      let minAmountOut;
      let maxAmountIn;

      // calculate slippage adjusted amount
      if (exactIn) {
        console.log(
          `By algorithm, expected to get: ${trade.outputAmount.toExact()}`
        );
        // if provided exact token in, we want to know min out token amount
        minAmountOut = trade.minimumAmountOut(allowedSlippage);
        slippageAdjustedAmount = minAmountOut.raw.toString();

        // update UI with estimated output token amount
        setToken1Amount(trade.outputAmount.toExact());

        console.log(`Minimum received: ${slippageAdjustedAmount}`);
      } else {
        console.log(
          `By algorithm, expected to get: ${trade.inputAmount.toExact()}`
        );
        maxAmountIn = trade.maximumAmountIn(allowedSlippage);
        slippageAdjustedAmount = maxAmountIn.raw.toString();

        setToken0Amount(trade.inputAmount.toExact());

        // updated input token field, check if still below account balance

        console.log(userToken0Balance.toString());
        console.log(trade.inputAmount.raw.toString());
        userHasSufficientBalance = userToken0Balance.gt(
          BigNumber.from(trade.inputAmount.raw.toString())
        );

        // quit if user doesn't have enough balance, otherwise this will cause error
        if (!userHasSufficientBalance)
          return new ACYSwapErrorStatus("Not enough balance");

        console.log(`Maximum pay: ${slippageAdjustedAmount}`);
      }

      console.log("------------------ BREAKDOWN ------------------");

      let { priceImpactWithoutFee, realizedLPFee } =
        computeTradePriceBreakdown(trade);

      let breakdownInfo = [
        `Price impact : ${priceImpactWithoutFee.toFixed(2)}%`,
        `LP FEE : ${realizedLPFee?.toSignificant(6)} ${
          trade.inputAmount.currency.symbol
        }`,
        `${exactIn ? "Min received:" : "Max sold"} : ${
          exactIn ? minAmountOut.toSignificant(4) : maxAmountIn.toSignificant(4)
        } ${
          exactIn
            ? trade.outputAmount.currency.symbol
            : trade.inputAmount.currency.symbol
        }`,
      ];
      setSwapBreakdown(breakdownInfo);
      console.log(breakdownInfo);

      console.log("------------------ ALLOWANCE ------------------");
      if (!token0IsETH) {
        let allowance = await getAllowance(
          token0Address,
          account,
          ROUTER_ADDRESS,
          library,
          account
        );

        console.log(
          `Current allowance for ${trade.inputAmount.currency.symbol}:`
        );
        console.log(allowance);

        let token0AmountToApprove = exactIn
          ? inputAmount.raw.toString()
          : slippageAdjustedAmount;

        let token0approval = await checkTokenIsApproved(
          token0Address,
          token0AmountToApprove,
          library,
          account
        );
        console.log(token0approval);

        if (!token0approval) {
          console.log("Not enough allowance");
          setApproveAmount(token0AmountToApprove);
          setNeedApprove(true);
          return new ACYSwapErrorStatus("Need approve");
        }
      }

      console.log("------------------ PREPARE SWAP ------------------");

      let { methodName, args, value } = Router.swapCallParameters(trade, {
        feeOnTransfer: false,
        allowedSlippage,
        recipient: account,
        ttl: 60,
      });

      const options = !value || isZero(value) ? {} : { value };

      console.log("------------------ ARGUMENTS ------------------");
      console.log(options);
      console.log(args);

      let result = await contract.estimateGas[methodName](...args, options)
        .then((gasEstimate) => {
          return contract[methodName](...args, {
            gasLimit: calculateGasMargin(gasEstimate),
            ...options,
          });
        })
        .catch((e) => {
          return new ACYSwapErrorStatus(`${methodName} failed with error ${e}`);
        });

      return result;
    }
  })();
  if (status instanceof ACYSwapErrorStatus) {
    setSwapStatus(status.getErrorText());
  } else {
    console.log(status);
    setSwapStatus("OK");
  }
}

const SwapComponent = () => {
  let [token0, setToken0] = useState(null);
  let [token1, setToken1] = useState(null);
  let [token0Balance, setToken0Balance] = useState("0");
  let [token1Balance, setToken1Balance] = useState("0");
  let [token0Amount, setToken0Amount] = useState("0");
  let [token1Amount, setToken1Amount] = useState("0");
  let [swapBreakdown, setSwapBreakdown] = useState();
  let [swapStatus, setSwapStatus] = useState();
  let [needApprove, setNeedApprove] = useState(false);
  let [approveAmount, setApproveAmount] = useState("0");
  let [exactIn, setExactIn] = useState(true);

  const individualFieldPlaceholder = "Enter amount";
  const dependentFieldPlaceholder = "Estimated value";

  const { account, chainId, library, activate } = useWeb3React();
  const injected = new InjectedConnector({
    supportedChainIds: [1, 3, 4, 5, 42, 80001],
  });

  let supportedTokens = [
    {
      symbol: "USDC",
      address: "0x4DBCdF9B62e891a7cec5A2568C3F4FAF9E8Abe2b",
      decimal: 6,
    },
    {
      symbol: "ETH",
      address: "0xc778417E063141139Fce010982780140Aa0cD5Ab",
      decimal: 18,
    },
    {
      symbol: "WETH",
      address: "0xc778417E063141139Fce010982780140Aa0cD5Ab",
      decimal: 18,
    },
    {
      symbol: "UNI",
      address: "0x03e6c12ef405ac3f642b9184eded8e1322de1a9e",
      decimal: 18,
    },
    {
      symbol: "DAI",
      address: "0x5592ec0cfb4dbc12d3ab100b257153436a1f0fea",
      decimal: 18,
    },
    {
      symbol: "cDAI",
      address: "0x6d7f0754ffeb405d23c51ce938289d4835be3b14",
      decimal: 8,
    },
    {
      symbol: "WBTC",
      address: "0x577d296678535e4903d59a4c929b718e1d575e0a",
      decimal: 8,
    },
  ];

  useEffect(() => {
    activate(injected);
  }, []);

  let t0Changed = useCallback(async () => {
    if (!token0 || !token1) return;
    if (!exactIn) return;
    setToken1Amount(
      await swapGetEstimated(
        {
          ...token0,
          amount: token0Amount,
        },
        {
          ...token1,
          amount: token1Amount,
        },

        true,
        chainId,
        library
      )
    );
  }, [token0, token1, token0Amount, token1Amount, exactIn, chainId, library]);

  let t1Changed = useCallback(async () => {
    if (!token0 || !token1) return;
    if (exactIn) return;
    setToken0Amount(
      await swapGetEstimated(
        {
          ...token0,
          amount: token0Amount,
        },
        {
          ...token1,
          amount: token1Amount,
        },

        false,
        chainId,
        library
      )
    );
  }, [token0, token1, token0Amount, token1Amount, exactIn, chainId, library]);

  useEffect(() => {
    t0Changed();
  }, [token0Amount]);

  useEffect(() => {
    t1Changed();
  }, [token1Amount]);

  return (
    <div>
      <h1>swap</h1>

      <Alert variant="success">
        <Alert.Heading>Hey, nice to see you</Alert.Heading>
        <p>{account}</p>
      </Alert>

      <Form>
        <Form.Group className="mb-3" controlId="formBasicEmail">
          <Dropdown>
            <Dropdown.Toggle variant="success" id="dropdown-basic">
              {(token0 && token0.symbol) || "In token"}
            </Dropdown.Toggle>

            <Dropdown.Menu>
              {supportedTokens.map((token, index) => (
                <Dropdown.Item
                  key={index}
                  onClick={async () => {
                    setToken0(token);
                    setToken0Balance(
                      await getUserTokenBalance(
                        token,
                        chainId,
                        account,
                        library
                      )
                    );
                  }}
                >
                  {token.symbol}
                </Dropdown.Item>
              ))}
            </Dropdown.Menu>
          </Dropdown>
          <Form.Control
            value={token0Amount}
            placeholder={
              exactIn ? individualFieldPlaceholder : dependentFieldPlaceholder
            }
            onChange={(e) => {
              setToken0Amount(e.target.value);
              setExactIn(true);
            }}
          />
          <small>Balance: {token0Balance}</small>
        </Form.Group>
        <Form.Group className="mb-3" controlId="formBasicPassword">
          <Dropdown>
            <Dropdown.Toggle variant="success" id="dropdown-basic">
              {(token1 && token1.symbol) || "Out token"}
            </Dropdown.Toggle>

            <Dropdown.Menu>
              {supportedTokens.map((token, index) => (
                <Dropdown.Item
                  key={index}
                  onClick={async () => {
                    setToken1(token);
                    setToken1Balance(
                      await getUserTokenBalance(
                        token,
                        chainId,
                        account,
                        library
                      )
                    );
                  }}
                >
                  {token.symbol}
                </Dropdown.Item>
              ))}
            </Dropdown.Menu>
          </Dropdown>
          <Form.Control
            value={token1Amount}
            placeholder={
              exactIn ? dependentFieldPlaceholder : individualFieldPlaceholder
            }
            onChange={(e) => {
              setToken1Amount(e.target.value);
              setExactIn(false);
            }}
          />
          <small>Balance: {token1Balance}</small>
        </Form.Group>
        <Alert variant="danger">
          Slippage tolerance: {INITIAL_ALLOWED_SLIPPAGE} bips (0.01%)
        </Alert>
        <Alert variant="primary">
          {swapBreakdown && swapBreakdown.map((info) => <p>{info}</p>)}
        </Alert>
        <Alert variant="info">Swap status: {swapStatus}</Alert>
        <Button
          variant="warning"
          onClick={() => {
            approve(token0.address, approveAmount, library, account);
          }}
        >
          Approve
        </Button>
        <Button
          variant="success"
          onClick={() => {
            swap(
              {
                ...token0,
                amount: token0Amount,
              },
              {
                ...token1,
                amount: token1Amount,
              },

              INITIAL_ALLOWED_SLIPPAGE,
              exactIn,
              chainId,
              library,
              account,
              setNeedApprove,
              setApproveAmount,
              setSwapStatus,
              setSwapBreakdown,
              setToken0Amount,
              setToken1Amount
            );
          }}
        >
          Swap
        </Button>
      </Form>
    </div>
  );
};

export default SwapComponent;
