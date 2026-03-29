#!/usr/bin/env bun
import { main } from './index';

main().catch((error: unknown) => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
