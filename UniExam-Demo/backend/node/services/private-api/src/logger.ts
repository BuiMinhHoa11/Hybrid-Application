import { getConfig } from '@uniexam/config';
import { createLogger } from '@uniexam/observability';

export const logger = createLogger('private-api', getConfig().logLevel);
