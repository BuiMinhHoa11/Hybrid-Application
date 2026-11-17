import { getConfig } from '@uniexam/config';
import { createLogger } from '@uniexam/observability';

export const logger = createLogger('public-api', getConfig().logLevel);
