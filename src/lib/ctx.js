import { createContext, useContext } from 'react';

// Everything the views need: the active vessel, its analysis and the actions.
export const AppCtx = createContext(null);
export const useApp = () => useContext(AppCtx);
