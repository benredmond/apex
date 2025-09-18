import { vi } from 'vitest';

// Provide a backwards-compatible shim for projects migrated from Jest.
type MockFactory = Parameters<typeof vi.mock>[1];

type ViWithUnstable = typeof vi & {
  unstable_mockModule?: (modulePath: string, factory: MockFactory) => Promise<void>;
};

const viWithUnstable = vi as ViWithUnstable;

if (typeof viWithUnstable.unstable_mockModule !== 'function') {
  const fallbackMock = vi.mock.bind(vi) as typeof vi.mock;

  viWithUnstable.unstable_mockModule = async (moduleId, factory) => {
    fallbackMock(moduleId, factory as MockFactory);
  };
}
