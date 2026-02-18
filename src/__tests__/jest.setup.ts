/**
 * Jest Global Setup
 *
 * Runs before every test file. The `reflect-metadata` import is required
 * because tsyringe's decorators (@injectable, @inject) rely on the Reflect
 * API to store constructor parameter metadata at class-definition time.
 *
 * In production, `reflect-metadata` is imported at the top of server.ts
 * (via container.ts). In tests, this setup file serves the same purpose
 * so that any import chain touching tsyringe decorators doesn't crash.
 */
import 'reflect-metadata';
