import { clientStore } from './store';
import { BookLayout } from './ui/BookLayout';
import type { BookLayoutProps } from './ui/BookLayout';

export function App({
  store = clientStore,
  send = () => false,
}: Partial<BookLayoutProps>) {
  return <BookLayout store={store} send={send} />;
}
