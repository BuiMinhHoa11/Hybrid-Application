import { errorHandler, notFoundHandler } from '@uniexam/observability';
import { logger } from '../logger';

export const handleErrors = errorHandler(logger);
export { notFoundHandler };
