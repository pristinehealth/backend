import { configureStore } from "@reduxjs/toolkit";
import { setupListeners } from "@reduxjs/toolkit/query";
import { perfexApi } from "./features/api/perfexApi";
import { complianceApi } from "./features/api/complianceApi";

export const store = configureStore({
    reducer: {
        // Add the generated reducers as specific top-level slices
        [perfexApi.reducerPath]: perfexApi.reducer,
        [complianceApi.reducerPath]: complianceApi.reducer,
    },
    // Adding the api middleware enables caching, invalidation, polling,
    // and other useful features of `rtk-query`.
    middleware: (getDefaultMiddleware) =>
        getDefaultMiddleware().concat(perfexApi.middleware, complianceApi.middleware),
});

// optional, but required for refetchOnFocus/refetchOnReconnect behaviors
setupListeners(store.dispatch);

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
