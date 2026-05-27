import { resetDataRoot } from './helpers/env';

export default async function globalSetup(): Promise<void> {
  resetDataRoot();
}
