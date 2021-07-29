# ACY Swap documentation

## Run

```
npm install
npm start
```

## Files

abis/ 保存和合约交互需要的合约格式 ABI

components/ 存有 MyComponent，在这个组件中存有以下**5**个核心函数与对应的 DEMO

utils/ 存有 MyComponent 需要的辅助函数与常数

## Functions

`chainId`, `library` 与 `account` 都能使用 useWeb3React hook 获取

```
async function approve(
tokenAddress,
requiredAmount,
library,
account)
```

```async function checkTokenIsApproved(
async function checkTokenIsApproved(
  tokenAddress,
  requiredAmount,
  library,
  account
)
```

`tokenAddress`：字符串，token 合约地址

`requiredAmount`：字符串，考虑了 token 精度的数额，例如 ETH 有 18 个精度位(decimal)，那么授权 1 ETH requiredAmount 值为 1000000000000000000

```
async function getEstimated(
  inputToken0,
  inputToken1,
  exactIn = true,
  chainId,
  library
)
```

`inputToken0`需包含以下内容：

{

​ symbol: "USDC",

​ address: "0x4DBCdF9B62e891a7cec5A2568C3F4FAF9E8Abe2b",

​ decimal: 6,

​ amount: "12345",

​ },

其中 amount 为用户的字符串输入

`exactIn`是一个布尔值，true 表示用户要求准确输入，大概输出，false 则是精确输出，大概输入

```
async function getUserTokenBalance(
token,
chainId,
account,
library
)
```

`token`需包含如下内容

{

​ symbol: "USDC",

​ address: "0x4DBCdF9B62e891a7cec5A2568C3F4FAF9E8Abe2b",

​ decimal: 6

}

```
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
  setToken0ApproxAmount,
  setToken1ApproxAmount
)
```

`inputToken0`与`inputToken1`相同，需包含以下内容：

{

​ symbol: "USDC",

​ address: "0x4DBCdF9B62e891a7cec5A2568C3F4FAF9E8Abe2b",

​ decimal: 6

}

`allowedSlippage`表示用户能容忍的输出差异，单位为 bips (0.01%)

`exactIn`定义如上

`setNeedApprove`用于设置是否需要授权。如果需要则设为 true。再次点击后，如果已经授权，则设置为 false

`setApproveAmount` 被用于设置授权金额

`setSwapStatus`用与设置 swap 状态字符串。几个可能的情况：Need Approve，Not enough balance, OK，等等

`setSwapBreakdown`返回一个数组的字符串。第一个元素为价格冲击，第二个元素为 LP 费用(0.03%)，第三个元素为最少获取金额

`setToken0ApproxAmount`如果用户要求精确输出金额（exactIn = false），那么计算并设置预计的代币输入金额。

`setToken1ApproxAmount`如果用户要求精确输入金额（exactIn = true），那么计算并设置预计的代币输出金额。

提示：

1. 这些都是 async 函数，即要顺序获取数据的话需要使用 await
2. exactIn 的一个实现方案是在 input 元素的 onChange callback 中修改
3. 如果需要授权，checkTokenIsApproved 应该要以 setInterval 的方式每隔几秒判断一下。注意多次渲染可能导致多次注册 setInterval。
4. `approve` 与 `checkTokenIsApproved` 只适用于 ERC-20 token。函数不检测输入 tokenAddress。
