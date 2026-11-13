'use client';
import { Provider } from 'react-redux';
import { persistor, store } from './store';
import { PersistGate } from 'redux-persist/integration/react';
import AuthLoadingScreen from '../../components/auth/AuthLoadingScreen';

export function StoreProvider({ children }: { children: React.ReactNode }) {
  return (
    <Provider store={store}>
      <PersistGate loading={<AuthLoadingScreen />} persistor={persistor}>
        {children}
      </PersistGate>
    </Provider>
  );
}
