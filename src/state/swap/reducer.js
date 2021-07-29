import { createReducer } from "@reduxjs/toolkit";
import { replaceSwapState } from "./actions";

const initialState = {
  data: "NO DATA YET",
};

export default createReducer(initialState, (builder) =>
  builder.addCase(replaceSwapState, (state, { payload: { data } }) => {
    state.data += data;
    return state;
  })
);
