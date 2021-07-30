import { Web3ReactProvider } from "@web3-react/core";
import { Web3Provider } from "@ethersproject/providers";
import MyComponent from "./components/MyComponent";
import LiquididityComponent from "./components/LiquididityComponent";
import "bootstrap/dist/css/bootstrap.min.css";
import "./App.css";

// import your favorite web3 convenience library here

function getLibrary(provider, connector) {
  return new Web3Provider(provider); // this will vary according to whether you use e.g. ethers or web3.js
}

function App() {
  return (
    <Web3ReactProvider getLibrary={getLibrary}>
      <h1>swap</h1>
      <MyComponent />
      <h1>liquidity</h1>
      <LiquididityComponent />
    </Web3ReactProvider>
  );
}

export default App;
