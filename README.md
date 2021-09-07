# acy-dex-swap

## 1.代码运行

```
yarn 
yarn start
```



## 2.src文件介绍

abis/ 保存和合约交互需要的合约格式 ABI

compoenets/ 存有 SwapComponent.js、LiquidityComponent.js 和 RemoveLiquidityComponent.js 文件，分别对应 swap， 添加流动性和移除流动性三个模块。

utils/ 存有上述三个模块所需要的一些共用的函数。

## 3.特别提示

1. swap, add liquidity, remove liquidity涉及到许多具体的流程和细节，目前仅经过了开发人员的简单测试，并不能百分之百保证程序运行和预期的正确性。如果要正式上线，需要经过更加严格和充分的测试!!!
2. 目前程序运行在rinkey 测试网络上，转移到以太坊主网需要在程序上进行必要的调整和测试。



## 4. swap模块介绍

该模块主要在SwapComponent.js部分完成。

swap的主要功能是从代币token0兑换代币token1。

swapGetEstimated 函数主要在确定两种代币的种类，同时输入了其中一种代币的数额的情况下进行动态的调用，可以实现对于另外一种代币数额的估计，以及是否需要获取approve的判断，同时要处理各种可能遇到的情况。

swap函数和 最后的按钮相绑定。

SwapComponent是swap部分最关键的模块，在这里定义了关键的需要在swapGetEstimated和Swap函数种需要调用的变量，这里对变量进行介绍。

### 4.1 相关变量介绍

token0表示第一种代币，token1表示第二种代币，具体的数据结构如下

```
 {
    symbol: "USDC",
    address: "0x4DBCdF9B62e891a7cec5A2568C3F4FAF9E8Abe2b",
    decimal: 6,
  }
```

token0Balance、token1Balance表示的是相应代币的余额。

token0BalanceShow、token1BalanceShow表示相应代币的余额是否要显示，true表示显示，false表示不显示。

token0Amount、token1Amount表示相应代币的指定的数量，是一个字符串，从用户的输中获得，或者在确定一种代币后，被SwapGetEstimated函数通过获取交易对的方式来得到。

exactIn表示用户输入的数额是前一种代币还是后一种代币，如果是true表示对应第一种代币，如果是false对应第二种代币。

slippageTolerance 表示滑点，单位是bips（0.01%）， 在目前实现的版本里acy-dex-swap的输入是支持0到100之间、小数点后两位的数，作为函数的输入时要乘100处理。

needApprove表示智能合约是否有足够的操作用户第一种代币的权限（是否需要approve）, 如果为true，那么会对应的显示approve的按钮，方便用户来进行授权；如果为false则不会。

approveAmount表示需要授权的第一种代币的金额。

approveButtonStatus表示需要授权时approve按钮的状态，如果为true则可以按，如果为false则不可以，具体设置<button> 标签中的disabled项，不过由于目前的设计是如果授权后按钮会自动消失，所以该变量的作用没有比较明显的发挥出来。

swapBreakdown表示的是打印的小票信息，是在确定两种代币和代币金额以及滑点之后所模拟计算出的用户所关心的一些信息。

swapButtonState表示的是该模块最重要的大按钮的状态，true表示处于激活状态，按动时可以触发相应的功能，false表示由于各种原因导致目前按钮的功能无法被执行，所以处于禁止状态。

swapButtonContent表示大按钮上的文字信息，提示用户相应状态。

swapStatus是用户点击swap之后发挥的相应的一些状态，如果成功上链之后会返回etherscan上的事务链接。

pair，route，trade，slippageAdjustedAmount，minAmountOut，maxAmountIn，wethContract和wrappedAmount 是用于从swapGetEstimated函数传递关键信息给swap的变量，在这里引入这些变量的目的是为了保证模拟的结果和最终执行的结果是一致的，防止swapGetEstimated 函数执行的模拟结果 和 swap函数具体执行的结果有所偏差。

### 4.2 swapGetEstimated函数介绍

swapGetEstiamted函数是在确定了两种代币的种类、其中一种代币的金额和 滑点值 之后，触发的模拟计算的一个函数。

如果exactIn为true，则根据inputToken0的信息，计算预期可以得到的代币金额，若exactIn为false，则计算预期需要付出的代币金额。

```
async function swapGetEstimated(
  inputToken0,
  inputToken1,
  allowedSlippage,
  exactIn = true,
  chainId,
  library,
  acoount,
  ...(一系列的set函数)
  
)
```

`inputToken0`需包含以下内容：

{

 symbol: "USDC",

 address: "0x4DBCdF9B62e891a7cec5A2568C3F4FAF9E8Abe2b",

 decimal: 6,

 amount: "12345",

 }

其中 amount 为用户的字符串输入。

`exactIn`是一个布尔值，true 表示用户要求准确输入，大概输出，false 则是精确输出，大概输入。



函数内部的执行流程基本按照分类讨论的思路进行，

可能需要进一步处理的地方是parseUnits函数可能会有更多的异常处理。

执行swapGetEstimated函数的结果是会生成对应的breakdown信息，同时计算是否会展示approve按钮，以及计算出最重要的swap按钮的状态。

如果没有执行代币的权限，那么需要用户先点击approve按钮，点击之后如果获取到approve权限的话会重新执行swapGetEstimated函数，这里需要强调的是approve过程可能会比较长，约5s以上的时间，需要前端UI实现一部分等待的效果。

在获取到权限之后，可以点击最重要的swap按钮，这样会触发swap函数，调取钱包执行后续的流程。

### 4.3 swap函数

swap函数执行的流程和swapGetEstimated基本是一致的，从swapGetEstimated函数得到一些重要的全局变量的值，之后执行调取智能合约的操作。

# 5. add liquidity模块

添加流动性。

getEstimated函数用于在输入两种代币，以及确定对应的金额之后把相关所有的变量和需要确定的状态都确定，这里有两种情况，如果是之前有这一个币对的池子，那么会投入该池，如果没有的话，创建一个新的币对池。

addLiquidity函数用于执行通过钱包调取智能合约的操作。

getAllLiquidityPositions 相对比较独立，在取得用户的account信息之后就可以自动执行。

## 5.1 变量解释

token0表示第一种代币，token1表示第二种代币，具体的数据结构如下

```
 {
    symbol: "USDC",
    address: "0x4DBCdF9B62e891a7cec5A2568C3F4FAF9E8Abe2b",
    decimal: 6,
  }
```

token0Balance、token1Balance表示的是相应代币的余额。

token0BalanceShow、token1BalanceShow表示相应代币的余额是否要显示，true表示显示，false表示不显示。

token0Amount、token1Amount表示相应代币的指定的数量，是一个字符串，从用户的输中获得，或者在确定一种代币后，被SwapGetEstimated函数通过获取交易对的方式来得到。

exactIn表示用户输入的数额是前一种代币还是后一种代币，如果是true表示对应第一种代币，如果是false对应第二种代币。

slippageTolerance 表示滑点，单位是bips（0.01%）， 在目前实现的版本里acy-dex-swap的输入是支持0到100之间、小数点后两位的数，作为函数的输入时要乘100处理。

needApproveToken0，needApproveToken1表示智能合约是否有足够的操作用户对应代币的权限（是否需要approve）, 如果为true，则表示对应的代币需要授权；如果为false则不需要授权。

approveAmountToken0，approveAmountToken1表示需要授权的相应代币的金额。

approveToken0ButtonShow，approveToken1ButtonShow 表示需要授权时对应代币授权按钮的状态，如果为true则显示按钮，如果为false则不可显示。

liquidityBreakdown表示的是打印的小票信息，是在确定两种代币和代币金额以及滑点之后所模拟计算出的用户所关心的一些信息。

buttonStatus表示的是该模块最重要的大按钮的状态，true表示处于激活状态，按动时可以触发相应的功能，false表示由于各种原因导致目前按钮的功能无法被执行，所以处于禁止状态。

buttonContent表示大按钮上显示的文本信息，用于提示用户之后的操作。

liquidityStatus是用户点击大按钮之后发挥的相应的一些状态，如果成功上链之后会返回etherscan上的事务链接。

pair，noLiquidity，parsedToken0Amount，parsedToken1Amount，args，value 是用于从getEstimated函数传递关键信息给addLiquidity函数的变量，在这里引入这些变量的目的是为了保证模拟的结果和最终执行的结果是一致的，防止getEstimated 函数执行的模拟结果 和addLiquidity函数具体执行的结果有所偏差。



## 5.2 getEstimated函数

若给定的代币对存在，那么给定一个token的输入，返回另一个token应输入的值，同时对于授权按钮的出现与否、以及最重要的大按钮的状态和显示信息进行计算。

如果给定的代币对不存在，那么需要用户选定token对，两种代币的amount，然后进行创建币对池的估计。

```
async function getEstimated(
  inputToken0,
  inputToken1,
  allowedSlippage,
  exactIn = true,
  chainId,
  library,
  account,
 ...(一系列的set函数)
)
```

`inputToken0`需包含以下内容：

{

 symbol: "USDC",

 address: "0x4DBCdF9B62e891a7cec5A2568C3F4FAF9E8Abe2b",

 decimal: 6,

 amount: "12345",

 }

## 5.3 addLiquidity函数

给定两个代币及相应金额，添加流动性（应先使用 getEstimated 进行计算后调用此函数）。

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
 ...(一系列的set函数)
)
```

`inputToken0`需包含以下内容：

{

 symbol: "USDC",

 address: "0x4DBCdF9B62e891a7cec5A2568C3F4FAF9E8Abe2b",

 decimal: 6,

 amount: "12345",

 }



## 5.4 getAllLiquidityPositions

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

# 6. remove liquidity模块

用于移除流动性，前提是拥有指定币对的池子，然后才可以移除。

getEstimated函数是在确定两种代币，滑点以及  percent 和 代币对的token当中的一个的情况下，进行预先估计计算的函数。

signOrApprove函数是用于签名或者approve。

removeLiquidity函数是直接调用钱包在智能合约上进行移除流动性的操作。

## 6.1 变量解释

token0表示第一种代币，token1表示第二种代币，具体的数据结构如下

```
 {
    symbol: "USDC",
    address: "0x4DBCdF9B62e891a7cec5A2568C3F4FAF9E8Abe2b",
    decimal: 6,
  }
```



token0Amount、token1Amount表示相应代币在移除流动性后能得到的数量，是一个字符串，具体的内容是在getEstimated函数中计算得到的，而且在interface当中并不会直接有一个文字的输入框展示这个信息，而是会放到breakdown当中。

position原本是展示仓位信息的，但是后面没有再使用。

balance表示给定币对对应代币的余额。

balanceShow是一个布尔值，true表示会展示余额，false表示不展示。

index表示用户输入的是百分比percent还是数额amount。

percent是用户输入的百分比，支持输入0到100小数点后两位的数。

amount是用户输入的代币对token的值。

slippageTolerance是滑点，单位是0.01%，支持输入0到10000的整数。

breakdown是小票信息。

needApprove表示用户是否有操作代币对token的权限，true是需要，false是不需要。

buttonStatus，buttonContent是最重要的大按钮的相关变量，用来指定按钮的状态（是否是disabled）和 按钮文本。

removeStatus是点击最重要的大按钮之后返回的信息，如果成功执行会返回在etherscan上的url信息。

signatureData用于在signOrApprove函数和removeLiquidity函数之间共享签名信息的变量。



## 6.2 getEstimated

这个函数的主要作用是在指定代币对和 （percent和amount当中的一个）之后，输出breakdown信息的。

这里和swap以及添加流动性模块不同是 没有输入滑点信息，因为这一部分的设计是approve按钮一直会存在，而且breakdown信息当中没有需要用到滑点的部分，所以就没有使用。

## 6.3 signOrApprove

用于获得签名，如果签名失败就走approve的路线。

## 6.4 removeLiquidity

直接执行通过钱包调用智能合约的功能，实现移除流动性。



# 7. util/index.js的公共函数

## 7.1 approve

需要注意，这里的approve函数是async类型的，如果授权没有在区块链上确认，会一直阻塞在这个函数当中，具体实现可以参考代码。

给一个ERC-20代币授权，这里设定为

```
async function approve(
  tokenAddress,
  requiredAmount,
  library,
  account
)
```

## 7.2 checkTokenIsApproved

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

## 7.3 getUserTokenBalance

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



# 7. 可改进之处

1. 各种等待的效果需要结合前端一起优化。
2. 需要进行更加充分的测试。
3. 移除流动性部分在签名之后，执行可能会遇到一些错误，会在代码1086处被拦截，但是用户并不知道该如何改变当下的情况。
4. 移除流动性的时间戳取得方式需要参考材料得出一个统一的函数。





## Hint

1. 这些都是 async 函数，即要顺序获取数据的话需要使用 await
2. exactIn 的一个实现方案是在 input 元素的 onChange callback 中修改
3. 如果需要授权，checkTokenIsApproved 应该要以 setInterval 的方式每隔几秒判断一下。注意多次渲染可能导致多次注册 setInterval。
4. `approve` 与 `checkTokenIsApproved` 只适用于 ERC-20 token。函数不检测输入 tokenAddress。
5. 遇到了麻烦的话可以尝试看logs，如果还是不行请联络我（祖斌）
