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

8/8/2021 更新：

1. getEstimated 重命名 -> swapGetEstimated
2. 修改了swap的形参命名 (之前为setToken0ApproxAmount -> setToken0Amount，setToken1ApproxAmount -> setToken1Amount)，不影响功能
3. 添加了addLiquidity，addLiquidityGetEstimated与getAllLiquidityPositions函数

`chainId`, `library` 与 `account` 都能使用 useWeb3React hook 获取

<br/>

### approve

给一个ERC-20代币授权

```
async function approve(
  tokenAddress,
  requiredAmount,
  library,
  account
)
```

<br/>

### checkTokenIsApproved

给定一个ERC-20代币的合约地址和需要的额度，返回一个布尔值，代表该代币与给定金额是否已被授权。应通过轮询方式每数秒调用。

```async function checkTokenIsApproved(
async function checkTokenIsApproved(
  tokenAddress,
  requiredAmount,
  library,
  account
)
```

更多参数信息：

`tokenAddress`：字符串，token 合约地址

`requiredAmount`：字符串，考虑了 token 精度的数额，例如 ETH 有 18 个精度位(decimal)，那么授权 1 ETH requiredAmount 值为 1000000000000000000

<br/>

### swapGetEstimated

如果exactIn为true，则根据inputToken0的信息，计算预期可以得到的代币金额，若exactIn为false，则计算预期需要付出的代币金额

```
async function swapGetEstimated(
  inputToken0,
  inputToken1,
  exactIn = true,
  chainId,
  library
)
```

`inputToken0`需包含以下内容：

{

 symbol: "USDC",

 address: "0x4DBCdF9B62e891a7cec5A2568C3F4FAF9E8Abe2b",

 decimal: 6,

 amount: "12345",

 }

其中 amount 为用户的字符串输入

`exactIn`是一个布尔值，true 表示用户要求准确输入，大概输出，false 则是精确输出，大概输入

<br/>

### getUserTokenBalance

给定用户地址和代币信息，以可读的字符串形式返回用户的代币余额

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

 symbol: "USDC",

 address: "0x4DBCdF9B62e891a7cec5A2568C3F4FAF9E8Abe2b",

 decimal: 6

}

<br/>

### swap

进行一次代币swap，并设置相应的状态变量

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
  setToken0Amount,
  setToken1Amount
)
```

`inputToken0`与`inputToken1`相同，需包含以下内容：

{

 symbol: "USDC",

 address: "0x4DBCdF9B62e891a7cec5A2568C3F4FAF9E8Abe2b",

 decimal: 6

}

`allowedSlippage`表示用户能容忍的输出差异，单位为 bips (0.01%)

`exactIn`定义如上

`setNeedApprove`用于设置是否需要授权。如果需要则设为 true。再次点击后，如果已经授权，则设置为 false

`setApproveAmount` 被用于设置授权金额

`setSwapStatus`用与设置 swap 状态字符串。几个可能的情况：Need Approve，Not enough balance, OK，等等

`setSwapBreakdown`返回一个数组的字符串。第一个元素为价格冲击，第二个元素为 LP 费用(0.03%)，第三个元素为最少获取金额

`setToken0Amount`如果用户要求精确输出金额（exactIn = false），那么计算并设置预计的代币输入金额。

`setToken1Amount`如果用户要求精确输入金额（exactIn = true），那么计算并设置预计的代币输出金额。



------

### getAllLiquidityPositions

给定用户地址account和支持的代币列表tokens，返回一个数组的对象，代表用户的现有流动性仓位

```
async function getAllLiquidityPositions(
  tokens, 
  chainId, 
  library, 
  account
)
```

返回格式：

```
[{
    pool: "DAI/WETH"
    share: "0.0004%"
    token0Amount: "92.6367 DAI"
    token0Reserve: "22545741.054736152087728932 DAI"
    token1Amount: "0.0000475721 WETH"
    token1Reserve: "11.578005914278498676 WETH"
},
...]
```

<br/>

### addLiquidityGetEstimated

若给定的代币对存在，那么给定一个token的输入，返回另一个token应输入的值

```
async function addLiquidityGetEstimated(
  inputToken0,
  inputToken1,
  exactIn = true,
  chainId,
  library
)
```

`inputToken0`需包含以下内容：

{

 symbol: "USDC",

 address: "0x4DBCdF9B62e891a7cec5A2568C3F4FAF9E8Abe2b",

 decimal: 6,

 amount: "12345",

 }

<br/>

### addLiquidity

给定两个代币及相应金额，添加流动性（应先使用 addLiquidityGetEstimated 进行计算后调用此函数）。

如果不存在代币对，则创建并使用用户输入的金额创建池子。

```
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
  setToken1Amount
)
```

`inputToken0`需包含以下内容：

{

 symbol: "USDC",

 address: "0x4DBCdF9B62e891a7cec5A2568C3F4FAF9E8Abe2b",

 decimal: 6,

 amount: "12345",

 }

`setLiquidityBreakdown`返回一个数组的字符串。第一个元素为两个代币池的存量reserves，第二个元素为这个金额占总池子的百分比，第三个元素为第一个代币的金额，第四个元素为第二个代币的金额。这里两个代币的顺序经过字典序排序。

其他的参数的语义和swap函数一样。

注：由于增加流动性需要用户付出两种代币，所以这里的参数多了俩个，分别是另外一个代币的授权和授权金额的变量setter。

<br/>

## Hint

1. 这些都是 async 函数，即要顺序获取数据的话需要使用 await
2. exactIn 的一个实现方案是在 input 元素的 onChange callback 中修改
3. 如果需要授权，checkTokenIsApproved 应该要以 setInterval 的方式每隔几秒判断一下。注意多次渲染可能导致多次注册 setInterval。
4. `approve` 与 `checkTokenIsApproved` 只适用于 ERC-20 token。函数不检测输入 tokenAddress。
5. 遇到了麻烦的话可以尝试看logs，如果还是不行请联络我（祖斌）
