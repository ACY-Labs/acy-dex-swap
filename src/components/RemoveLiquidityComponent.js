import { useWeb3React } from "@web3-react/core";
import { InjectedConnector } from "@web3-react/injected-connector";
import { useState, useEffect, useCallback, useMemo } from "react";
import { Form, Button, Alert, Dropdown } from "react-bootstrap";
import {
  getRouterContract,
  calculateGasMargin,
  getTokenTotalSupply,
  ACYSwapErrorStatus,
  approve,
  checkTokenIsApproved,
  getUserTokenBalanceRaw,
  getUserTokenBalance,
  addLiquidityGetEstimated,
  calculateSlippageAmount,
  INITIAL_ALLOWED_SLIPPAGE,
} from "../utils";
import {
  Token,
  TokenAmount,
  Fetcher,
  Percent,
  WETH,
  ETHER,
  CurrencyAmount,
  FACTORY_ADDRESS,
} from "@uniswap/sdk";
import { BigNumber } from "@ethersproject/bignumber";
import { parseUnits } from "@ethersproject/units";

async function removeLiquidity(
  inputToken0,
  inputToken1,
  allowedSlippage = INITIAL_ALLOWED_SLIPPAGE,
  exactIn = true,
  chainId,
  library,
  account
) {}

const RemoveLiquidityComponent = () => {
  let [token0, setToken0] = useState(null);
  let [token1, setToken1] = useState(null);
  let [token0Balance, setToken0Balance] = useState("0");
  let [token1Balance, setToken1Balance] = useState("0");
  let [token0Amount, setToken0Amount] = useState("0");
  let [token1Amount, setToken1Amount] = useState("0");
  let [liquidityBreakdown, setLiquidityBreakdown] = useState();
  let [liquidityStatus, setLiquidityStatus] = useState();
  let [exactIn, setExactIn] = useState(true);

  const individualFieldPlaceholder = "Enter amount";
  const dependentFieldPlaceholder = "Estimated value";

  const { account, chainId, library, activate } = useWeb3React();
  const injected = new InjectedConnector({
    supportedChainIds: [1, 3, 4, 5, 42, 80001],
  });

  let supportedTokens = useMemo(() => [
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
  ]);

  useEffect(() => {
    activate(injected);
  }, []);

  return (
    <div>
      <h1>Remove liquidity</h1>
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
            console.log("Approve");
          }}
        >
          Approve {token0 && token0.symbol}
        </Button>

        <Button variant="success">Add Liquidity</Button>
      </Form>
    </div>
  );
};

export default RemoveLiquidityComponent;
