import { configureStore } from "@reduxjs/toolkit";
import swap from "./swap/reducer";

const PERSISTED_KEYS: string[] = ["user", "transactions", "lists"];

const store = configureStore({
  reducer: {
    swap,
  },
});

export default store;
