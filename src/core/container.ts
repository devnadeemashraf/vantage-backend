import 'reflect-metadata';
import { container } from 'tsyringe';
import { TOKENS } from './types';
import { logger } from './logger';

container.register(TOKENS.Logger, { useValue: logger });

export { container };
