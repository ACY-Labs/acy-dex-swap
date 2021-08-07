import { useWeb3React } from "@web3-react/core";
import { InjectedConnector } from "@web3-react/injected-connector";
import { useState, useEffect, useCallback } from "react";
import {
  getRouterContract,
  calculateGasMargin,
  getContract,
  getTokenTotalSupply,
  isZero,
  ROUTER_ADDRESS,
  getAllowance,
  ACYSwapErrorStatus,
  approve,
  checkTokenIsApproved,
  computeTradePriceBreakdown,
  getUserTokenAmount,
  getUserTokenBalance,
  addLiquidityGetEstimated,
  calculateSlippageAmount,
  INITIAL_ALLOWED_SLIPPAGE,
} from "../utils";
import { Form, Button, Alert, Dropdown } from "react-bootstrap";
import ERC20ABI from "../abis/ERC20.json";
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
import { MaxUint256 } from "@ethersproject/constants";
import { BigNumber } from "@ethersproject/bignumber";
import { parseUnits } from "@ethersproject/units";

async function addLiquidity(
  inputToken0,
  inputToken1,
  allowedSlippage = INITIAL_ALLOWED_SLIPPAGE,
  exactIn = true,
  chainId,
  library,
  account,
  setNeedApproveToken0,
  setNeedApproveToken1,
  setApproveAmountToken0,
  setApproveAmountToken1,
  setLiquidityStatus,
  setLiquidityBreakdown,
  setToken0Amount,
  setToken1Amount,
  setMintingToken0,
  setMintingToken1
) {
  let status = await (async () => {
    // check uniswap
    console.log(FACTORY_ADDRESS);

    let router = getRouterContract(library, account);

    const {
      address: token0Address,
      symbol: token0Symbol,
      decimal: token0Decimal,
      amount: token0Amount,
    } = inputToken0;
    const {
      address: token1Address,
      symbol: token1Symbol,
      decimal: token1Decimal,
      amount: token1Amount,
    } = inputToken1;

    console.log(`tokenAmount0: ${token0Amount} tokenAmount1: ${token1Amount}`);

    let token0IsETH = token0Symbol === "ETH";
    let token1IsETH = token1Symbol === "ETH";

    if (!inputToken0.symbol || !inputToken1.symbol)
      return new ACYSwapErrorStatus("One or more token input is missing");
    if (
      exactIn &&
      (isNaN(parseFloat(token0Amount)) || token0Amount === "0" || !token0Amount)
    )
      return new ACYSwapErrorStatus("Format Error");
    if (
      !exactIn &&
      (isNaN(parseFloat(token1Amount)) || token1Amount === "0" || !token1Amount)
    )
      return new ACYSwapErrorStatus("Format Error");

    console.log("token0");
    console.log(inputToken0);
    console.log("token1");
    console.log(inputToken1);
    if (token0IsETH && token1IsETH)
      return new ACYSwapErrorStatus("Doesn't support ETH to ETH");

    if (
      (token0IsETH && token1Symbol === "WETH") ||
      (token0Symbol === "WETH" && token1IsETH)
    ) {
      // UI should sync value of ETH and WETH
      if (exactIn) setToken1Amount(token0Amount);
      else setToken0Amount(token1Amount);

      return new ACYSwapErrorStatus("Invalid pair WETH/ETH");
    }
    // ETH <-> Non-WETH ERC20     OR     Non-WETH ERC20 <-> Non-WETH ERC20
    else {
      console.log("ADD LIQUIDITY");

      console.log("------------------ CONSTRUCT TOKEN ------------------");
      // use WETH for ETHER to work with Uniswap V2 SDK
      const token0 = token0IsETH
        ? WETH[chainId]
        : new Token(chainId, token0Address, token0Decimal, token0Symbol);
      const token1 = token1IsETH
        ? WETH[chainId]
        : new Token(chainId, token1Address, token1Decimal, token1Symbol);

      // quit if the two tokens are equivalent, i.e. have the same chainId and address
      if (token0.equals(token1)) return new ACYSwapErrorStatus("Equal tokens!");

      // check user account balance
      console.log("------------------ CHECK BALANCE ------------------");

      let userToken0Balance = await getUserTokenAmount(
        token0IsETH
          ? ETHER
          : new Token(chainId, token0Address, token0Decimal, token0Symbol),
        account,
        library
      );

      let userToken1Balance = await getUserTokenAmount(
        token1IsETH
          ? ETHER
          : new Token(chainId, token1Address, token1Decimal, token1Symbol),
        account,
        library
      );

      console.log("token0 balance");
      console.log(userToken0Balance);

      console.log("token1 balance");
      console.log(userToken1Balance);

      let userHasSufficientBalance =
        userToken0Balance.gt(parseUnits(token0Amount, token0Decimal)) &&
        userToken1Balance.gt(parseUnits(token1Amount, token1Decimal));

      // quit if user doesn't have enough balance, otherwise this will cause error
      if (!userHasSufficientBalance)
        return new ACYSwapErrorStatus("Not enough balance");

      // get pair using our own provider
      console.log("------------------ CONSTRUCT PAIR ------------------");
      console.log("FETCH");
      // if an error occurs, because pair doesn't exists
      const pair = await Fetcher.fetchPairData(token0, token1, library).catch(
        (e) => {
          console.log(e);
          return new ACYSwapErrorStatus(
            `${token0.symbol} - ${token1.symbol} pool does not exist. Creating one`
          );
        }
      );

      console.log(pair);
      let noLiquidity = false;
      if (pair instanceof ACYSwapErrorStatus) {
        setLiquidityStatus(pair.getErrorText());
        noLiquidity = true;
      }

      console.log("------------------ PARSE AMOUNT ------------------");
      // convert typed in amount to BigNumber using ethers.js's parseUnits,
      let parsedAmount = exactIn
        ? new TokenAmount(token0, parseUnits(token0Amount, token0Decimal))
        : new TokenAmount(token1, parseUnits(token1Amount, token1Decimal));

      let parsedToken0Amount;
      let parsedToken1Amount;

      if (!noLiquidity) {
        console.log("estimated dependent amount");
        // console.log(pair.priceOf(token0).quote(inputAmount).raw.toString());
        let dependentTokenAmount;
        if (exactIn) {
          dependentTokenAmount = pair.priceOf(token0).quote(parsedAmount);

          let token0TokenAmount = new TokenAmount(
            token0,
            parseUnits(token0Amount, token0Decimal)
          );

          parsedToken0Amount =
            token0 === ETHER
              ? CurrencyAmount.ether(token0TokenAmount.raw)
              : token0TokenAmount;

          parsedToken1Amount =
            token1 === ETHER
              ? CurrencyAmount.ether(dependentTokenAmount.raw)
              : dependentTokenAmount;

          setToken1Amount(dependentTokenAmount.toExact());
        } else {
          dependentTokenAmount = pair.priceOf(token1).quote(parsedAmount);

          let token1TokenAmount = new TokenAmount(
            token1,
            parseUnits(token1Amount, token1Decimal)
          );

          parsedToken0Amount =
            token0 === ETHER
              ? CurrencyAmount.ether(dependentTokenAmount.raw)
              : dependentTokenAmount;

          parsedToken1Amount =
            token1 === ETHER
              ? CurrencyAmount.ether(token1TokenAmount.raw)
              : token1TokenAmount;

          setToken0Amount(dependentTokenAmount.toExact());
        }
      } else {
        if (token0Amount === "0" || token1Amount === "0") {
          if (noLiquidity) {
            return new ACYSwapErrorStatus(
              "Creating a new pool, please enter both amounts"
            );
          }
          return new ACYSwapErrorStatus(
            "One field is empty, it's probably a new pool"
          );
        }

        parsedToken0Amount = new TokenAmount(
          token0,
          parseUnits(token0Amount, token0Decimal)
        );
        parsedToken1Amount = new TokenAmount(
          token1,
          parseUnits(token1Amount, token1Decimal)
        );
      }

      console.log("------------------ BREAKDOWN ------------------");

      if (!noLiquidity) {
        let totalSupply = await getTokenTotalSupply(
          pair.liquidityToken,
          library,
          account
        );
        console.log("Liquidity MInted");
        console.log(pair.liquidityToken);
        let liquidityMinted = pair.getLiquidityMinted(
          totalSupply,
          parsedToken0Amount,
          parsedToken1Amount
        );

        let poolTokenPercentage = new Percent(
          liquidityMinted.raw,
          totalSupply.add(liquidityMinted).raw
        ).toFixed(4);

        setLiquidityBreakdown([
          `Pool reserve: ${pair.reserve0.toExact()} ${
            pair.token0.symbol
          } + ${pair.reserve1.toExact()} ${pair.token1.symbol}`,
          `Pool share: ${poolTokenPercentage}%`,
          `${token0.symbol}: ${parsedToken0Amount.toExact()}`,
          `${token1.symbol}: ${parsedToken1Amount.toExact()}`,
          // noLiquidity ? "100" : `${poolTokenPercentage?.toSignificant(4)}} %`,
        ]);
      } else {
        setLiquidityBreakdown(["New pool"]);
      }

      let approveStatus = 0;

      console.log("------------------ ALLOWANCE ------------------");
      if (!token0IsETH) {
        // debug
        let token0Allowance = await getAllowance(
          token0Address,
          account,
          ROUTER_ADDRESS,
          library,
          account
        );

        console.log(`Current allowance for ${token0Symbol}:`);
        console.log(token0Allowance);

        // end of debug

        let token0approval = await checkTokenIsApproved(
          token0Address,
          parsedToken0Amount.raw.toString(),
          library,
          account
        );
        console.log("token 0 approved?");
        console.log(token0approval);

        if (!token0approval) {
          console.log("Not enough allowance");
          setApproveAmountToken0(parsedToken0Amount.raw.toString());
          setNeedApproveToken0(true);
          approveStatus += 1;
        }
      }

      if (!token1IsETH) {
        console.log(
          `Inside addLiquidity, amount needed: ${parsedToken1Amount.raw.toString()}`
        );
        let token1approval = await checkTokenIsApproved(
          token1Address,
          parsedToken1Amount.raw.toString(),
          library,
          account
        );
        console.log("token 1 approved?");
        console.log(token1approval);

        if (!token1approval) {
          console.log("Not enough allowance for token1");
          setApproveAmountToken1(parsedToken1Amount.raw.toString());
          setNeedApproveToken1(true);
          approveStatus += 2;
        }
      }

      if (approveStatus > 0) {
        return new ACYSwapErrorStatus(
          `Need approve ${
            approveStatus === 1
              ? token0Symbol
              : approveStatus === 2
              ? token1Symbol
              : `${token0Symbol} and ${token1Symbol}`
          }`
        );
      }

      console.log(
        "------------------ PREPARE ADD LIQUIDITY ------------------"
      );

      setLiquidityStatus("Processing add liquidity request");
      console.log("parsed token 0 amount");
      console.log(parsedToken0Amount.raw);
      console.log("parsed token 1 amount");
      console.log(parsedToken1Amount.raw);
      console.log(allowedSlippage);

      let estimate;
      let method;
      let args;
      let value;

      if (token0IsETH || token1IsETH) {
        estimate = router.estimateGas.addLiquidityETH;
        method = router.addLiquidityETH;
        let nonETHToken = token0IsETH ? token1 : token0;

        let parsedNonETHTokenAmount = token0IsETH
          ? parsedToken1Amount
          : parsedToken0Amount;

        let minETH = token0IsETH
          ? calculateSlippageAmount(
              parsedToken0Amount,
              noLiquidity ? 0 : allowedSlippage
            )[0].toString()
          : calculateSlippageAmount(
              parsedToken1Amount,
              noLiquidity ? 0 : allowedSlippage
            )[0].toString();

        args = [
          nonETHToken.address,
          parsedNonETHTokenAmount.raw.toString(),
          calculateSlippageAmount(
            parsedNonETHTokenAmount,
            noLiquidity ? 0 : allowedSlippage
          )[0].toString(),
          minETH,
          account,
          `0x${(Math.floor(new Date().getTime() / 1000) + 60).toString(16)}`,
        ];
        value = BigNumber.from(
          (token1IsETH ? parsedToken1Amount : parsedToken0Amount).raw.toString()
        );

        console.log(value);
      } else {
        estimate = router.estimateGas.addLiquidity;
        method = router.addLiquidity;
        args = [
          token0Address,
          token1Address,
          parsedToken0Amount.raw.toString(),
          parsedToken1Amount.raw.toString(),
          calculateSlippageAmount(
            parsedToken0Amount,
            noLiquidity ? 0 : allowedSlippage
          )[0].toString(),
          calculateSlippageAmount(
            parsedToken1Amount,
            noLiquidity ? 0 : allowedSlippage
          )[0].toString(),
          account,
          `0x${(Math.floor(new Date().getTime() / 1000) + 60).toString(16)}`,
        ];
        value = null;
      }

      console.log(args);

      setMintingToken0(token0);
      setMintingToken1(token1);

      let result = await estimate(...args, value ? { value } : {}).then(
        (estimatedGasLimit) =>
          method(...args, {
            ...(value ? { value } : {}),
            gasLimit: calculateGasMargin(estimatedGasLimit),
          }).catch((e) => {
            return new ACYSwapErrorStatus("Error in transaction");
          })
      );

      return result;
    }
  })();
  if (status instanceof ACYSwapErrorStatus) {
    setLiquidityStatus(status.getErrorText());
  } else {
    console.log(status);
    setLiquidityStatus("OK");
  }
}

async function clearAllowance(tokenAddress, library, account) {
  let tokenContract = getContract(tokenAddress, ERC20ABI, library, account);

  await tokenContract.approve(ROUTER_ADDRESS, "0");
}

async function updatePool(token0, token1, library, setLiquidityBreakdown) {
  if (!token0 || !token1) return;

  const pair = await Fetcher.fetchPairData(token0, token1, library)
    .then((pair) => {
      console.log("token reserves");
      console.log(pair.reserve0.toExact());
      console.log(pair.reserve1.toExact());
      return pair;
    })
    .catch((e) => {
      console.log(e);
      return new ACYSwapErrorStatus(
        `${token0.symbol} - ${token1.symbol} pool does not exist. Creating one`
      );
    });

  console.log(pair);

  if (pair instanceof ACYSwapErrorStatus) {
    return;
  }

  setLiquidityBreakdown([
    `Pool reserve: ${pair.reserve0.toExact()} ${
      pair.token0.symbol
    } + ${pair.reserve1.toExact()} ${pair.token1.symbol}`,
    // noLiquidity ? "100" : `${poolTokenPercentage?.toSignificant(4)}} %`,
  ]);
}

async function checkPositions(
  inputToken0,
  inputToken1,
  chainId,
  library,
  account
) {
  if (!inputToken0 || !inputToken1) return;

  const {
    address: token0Address,
    symbol: token0Symbol,
    decimal: token0Decimal,
  } = inputToken0;
  const {
    address: token1Address,
    symbol: token1Symbol,
    decimal: token1Decimal,
  } = inputToken1;

  let token0IsETH = token0Symbol === "ETH";
  let token1IsETH = token1Symbol === "ETH";

  if (token0IsETH && token1IsETH) return;

  if (
    (token0IsETH && token1Symbol === "WETH") ||
    (token0Symbol === "WETH" && token1IsETH)
  ) {
    return;
  }
  // ETH <-> Non-WETH ERC20     OR     Non-WETH ERC20 <-> Non-WETH ERC20
  else {
    console.log("------------------ CONSTRUCT TOKEN ------------------");
    // use WETH for ETHER to work with Uniswap V2 SDK
    const token0 = token0IsETH
      ? WETH[chainId]
      : new Token(chainId, token0Address, token0Decimal, token0Symbol);
    const token1 = token1IsETH
      ? WETH[chainId]
      : new Token(chainId, token1Address, token1Decimal, token1Symbol);

    // quit if the two tokens are equivalent, i.e. have the same chainId and address
    if (token0.equals(token1)) return;

    // get pair using our own provider
    console.log("------------------ CONSTRUCT PAIR ------------------");
    // if an error occurs, because pair doesn't exists
    const pair = await Fetcher.fetchPairData(token0, token1, library).catch(
      (e) => {
        console.log(e);
        return new ACYSwapErrorStatus(
          `${token0.symbol} - ${token1.symbol} pool does not exist. Creating one`
        );
      }
    );

    if (!pair.liquidityToken) return;

    console.log("pair in uer liquidity position");
    console.log(pair);

    let userPoolBalance = await getUserTokenAmount(
      pair.liquidityToken,
      account,
      library
    );
    userPoolBalance = new TokenAmount(pair.liquidityToken, userPoolBalance);

    let totalPoolTokens = await getTokenTotalSupply(
      pair.liquidityToken,
      library,
      account
    );

    console.log("usePoolBalance");
    console.log(userPoolBalance);
    console.log("totalPoolTokens");
    console.log(totalPoolTokens);

    let token0Deposited = pair.getLiquidityValue(
      pair.token0,
      totalPoolTokens,
      userPoolBalance,
      false
    );
    let token1Deposited = pair.getLiquidityValue(
      pair.token1,
      totalPoolTokens,
      userPoolBalance,
      false
    );

    console.log("userPoolBalance");
    console.log(userPoolBalance);
    console.log(
      `${pair.token0.symbol} deposited: ${token0Deposited.toSignificant(6)}`
    );
    console.log(
      `${pair.token1.symbol} deposited: ${token1Deposited.toSignificant(6)}`
    );
  }
}

const LiquidityComponent = () => {
  let [token0, setToken0] = useState(null);
  let [token1, setToken1] = useState(null);
  let [token0Balance, setToken0Balance] = useState("0");
  let [token1Balance, setToken1Balance] = useState("0");
  let [token0Amount, setToken0Amount] = useState("0");
  let [token1Amount, setToken1Amount] = useState("0");
  let [liquidityBreakdown, setLiquidityBreakdown] = useState();
  let [liquidityStatus, setLiquidityStatus] = useState();
  let [needApproveToken0, setNeedApproveToken0] = useState(false);
  let [needApproveToken1, setNeedApproveToken1] = useState(false);
  let [approveAmountToken0, setApproveAmountToken0] = useState("0");
  let [approveAmountToken1, setApproveAmountToken1] = useState("0");
  let [mintingToken0, setMintingToken0] = useState(null);
  let [mintingToken1, setMintingToken1] = useState(null);

  let [token0ApproxAmount, setToken0ApproxAmount] = useState("0");
  let [token1ApproxAmount, setToken1ApproxAmount] = useState("0");
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
      address: "0xeb8f08a975Ab53E34D8a0330E0D34de942C95926",
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

  let getDependentField = useCallback(async () => {
    let estimated = await addLiquidityGetEstimated(
      {
        ...token0,
        amount: token0Amount,
      },
      {
        ...token1,
        amount: token1Amount,
      },
      exactIn,
      chainId,
      library
    );

    if (!estimated) estimated = 0;

    return estimated;
  }, [token0, token1, token0Amount, token1Amount, chainId, library, exactIn]);

  let t0Changed = useCallback(async () => {
    if (!token0 || !token1) return;

    if (!exactIn) return;

    let estimated = await getDependentField();

    setToken1Amount(estimated);
  }, [token0, token1, getDependentField, exactIn]);

  let t1Changed = useCallback(async () => {
    if (!token0 || !token1) return;

    if (exactIn) return;

    let estimated = await getDependentField();

    setToken0Amount(estimated);
  }, [token0, token1, getDependentField, exactIn]);

  useEffect(() => {
    t0Changed();
  }, [token0Amount, t0Changed]);

  useEffect(() => {
    t1Changed();
  }, [token1Amount, t1Changed]);

  useEffect(() => {
    checkPositions(token0, token1, chainId, library, account);
  }, [token0, token1, chainId, library, account]);

  return (
    <div>
      <h1>liquidity</h1>
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
              setExactIn(true);
              setToken0Amount(e.target.value);
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
              setExactIn(false);
              setToken1Amount(e.target.value);
            }}
          />
          <small>Balance: {token1Balance}</small>
        </Form.Group>
        <Alert variant="danger">
          Slippage tolerance: {INITIAL_ALLOWED_SLIPPAGE} bips (0.01%)
        </Alert>
        <Alert variant="primary">
          {liquidityBreakdown &&
            liquidityBreakdown.map((info) => <p>{info}</p>)}
        </Alert>
        <Alert variant="info">Liquidity status: {liquidityStatus}</Alert>

        {/* APPROVE BUTTONS */}
        <Button
          variant="warning"
          onClick={() => {
            approve(token0.address, approveAmountToken0, library, account);
          }}
        >
          Approve {token0 && token0.symbol}
        </Button>
        <Button
          variant="warning"
          onClick={() => {
            approve(token1.address, approveAmountToken1, library, account);
          }}
        >
          Approve {token1 && token1.symbol}
        </Button>
        {/* <Button
          variant="danger"
          onClick={() => {
            clearAllowance(token0.address, library, account);
            clearAllowance(token1.address, library, account);
          }}
        >
          Clear allowance
        </Button> */}

        <Button
          variant="success"
          onClick={() => {
            addLiquidity(
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
              setNeedApproveToken0,
              setNeedApproveToken1,
              setApproveAmountToken0,
              setApproveAmountToken1,
              setLiquidityStatus,
              setLiquidityBreakdown,
              setToken0Amount,
              setToken1Amount,
              setMintingToken0,
              setMintingToken1
            );
          }}
        >
          Add Liquidity
        </Button>
        <Button
          variant="danger"
          onClick={() => {
            updatePool(
              mintingToken0,
              mintingToken1,
              library,
              setLiquidityBreakdown
            );
          }}
        >
          Update pool info
        </Button>
      </Form>
    </div>
  );
};

export default LiquidityComponent;
