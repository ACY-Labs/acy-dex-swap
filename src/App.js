import { Web3ReactProvider } from "@web3-react/core";
import { Web3Provider } from "@ethersproject/providers";
import MyComponent from "./components/MyComponent";
import { Provider } from "react-redux";
import store from "./state";
import "bootstrap/dist/css/bootstrap.min.css";
import "./App.css";

// import your favorite web3 convenience library here

function getLibrary(provider, connector) {
  return new Web3Provider(provider); // this will vary according to whether you use e.g. ethers or web3.js
}

function App() {
  return (
    <Provider store={store}>
      <Web3ReactProvider getLibrary={getLibrary}>
        <MyComponent />
      </Web3ReactProvider>
    </Provider>
  );
}

export default App;
